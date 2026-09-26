#!/usr/bin/env node
/**
 * record-autoplay – render an autopilot run of the game to an MP4 (store listing / promo video).
 *
 * Usage:
 *   node --experimental-websocket scripts/record-autoplay.cjs [url] [--out=store-video/autoplay.mp4]
 *       [--width=360 --height=640 --scale=3] [--seed=12345] [--hold=4] [--fps=60] [--max=130]
 *       [--crf=16] [--ffmpeg=<path>]
 *   npm run record
 *
 * Offline, deterministic rendering rather than a live screen recording: a shim installed before the
 * page loads takes over `requestAnimationFrame` and `performance.now()` once the run starts, so the
 * game loop only advances when this script steps the clock by exactly one output frame
 * (1000/fps ms, i.e. one or two fixed simulation steps). After each step a lossless PNG screenshot
 * is taken at full device resolution. Pacing is therefore perfect regardless of how slowly headless
 * software rendering draws, frames are never JPEG-compressed, and because no wall-clock time
 * passes inside a frame the adaptive quality monitor stays at the baseline tier (full starfield,
 * particles and spawn rates). CSS animations still run on real time, so their playback rate is
 * scaled to the measured capture speed via the Animation domain.
 *
 * Sequence: title screen (held --hold s, with the remote high score loaded) → the run, stepped
 * frame by frame → game-over dialog (1.2s) → AI debrief once rendered (4s) → Ok → initials prompt
 * (2s) → leaderboard (3s). No score is submitted (initials left empty). The default seed survived
 * ~50s on the 360x640 viewport; other seeds mostly die within 15s there.
 *
 * Output: H.264 yuv420p (bt709, faststart) at --fps; 360x640 @3x = 1080x1920 (9:16). Expect a
 * few minutes of rendering per minute of footage. ffmpeg is taken from --ffmpeg, $FFMPEG_PATH or
 * PATH; otherwise a pinned static Windows build (gyan.dev 8.1.2 essentials, SHA-256 verified) is
 * downloaded once into .tools/ffmpeg (gitignored). On other platforms install ffmpeg first.
 */
const { execFileSync, spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { connect, sleep } = require("./screenshot.cjs");

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const base = (args.find((a) => !a.startsWith("--")) || "http://localhost:8000").replace(/\/$/, "");
const out = path.resolve(opt("out", "store-video/autoplay.mp4"));
const width = Number(opt("width", "360")) || 360;
const height = Number(opt("height", "640")) || 640;
const scale = Number(opt("scale", "3")) || 3;
const seed = opt("seed", "12345");
const holdSec = Number(opt("hold", "4")) || 4;
const fps = Number(opt("fps", "60")) || 60;
const maxSec = Number(opt("max", "130")) || 130;
const crf = Number(opt("crf", "16")) || 16;

const FFMPEG_PIN = {
  url: "https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-8.1.2-essentials_build.zip",
  sha256: "db580001caa24ac104c8cb856cd113a87b0a443f7bdf47d8c12b1d740584a2ec",
  exe: "ffmpeg-8.1.2-essentials_build/bin/ffmpeg.exe",
};
const TOOLS_DIR = path.resolve(__dirname, "..", ".tools", "ffmpeg");

/**
 * Installed before any page script runs. Real time until `__frameClock.enable()`; afterwards
 * `performance.now()` is frozen between `step(ms)` calls and rAF callbacks run only inside them.
 */
const CLOCK_SHIM = `(() => {
  const realNow = performance.now.bind(performance);
  const realRaf = window.requestAnimationFrame.bind(window);
  const realCaf = window.cancelAnimationFrame.bind(window);
  const queue = new Map();
  let nextId = 1;
  let virtual = false;
  let vnow = 0;
  performance.now = () => (virtual ? vnow : realNow());
  window.requestAnimationFrame = (cb) => {
    if (!virtual) return realRaf(cb);
    const id = nextId++;
    queue.set(id, cb);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    if (!queue.delete(id)) realCaf(id);
  };
  window.__frameClock = {
    enable() {
      if (virtual) return;
      vnow = realNow();
      virtual = true;
    },
    step(ms) {
      vnow += ms;
      const cbs = Array.from(queue.values());
      queue.clear();
      for (const cb of cbs) cb(vnow);
      return vnow;
    },
    disable() {
      if (!virtual) return;
      virtual = false;
      const cbs = Array.from(queue.values());
      queue.clear();
      for (const cb of cbs) realRaf(cb);
    },
  };
})();`;

const START_READY =
  "performance.now() > 15000 || Number(document.getElementById('highScore').textContent) > 0";
const GAME_OVER = "!document.getElementById('gameOverScreen').hidden";
const DEBRIEF_READY = `${GAME_OVER} && !document.getElementById('okBtn').disabled`;
const SKIP_INITIALS = `(() => {
  const screen = document.getElementById('initialsScreen');
  if (!screen || screen.hidden) return 'no-initials';
  const input = document.getElementById('initialsInput');
  if (input) input.value = '';
  document.getElementById('submitScoreBtn').click();
  return 'skipped';
})()`;
const LEADERBOARD_VISIBLE = "!document.getElementById('leaderboardScreen').hidden";

/** Locate ffmpeg: explicit flag, env, PATH, then the pinned local download. */
async function resolveFfmpeg() {
  const explicit = opt("ffmpeg", "") || process.env.FFMPEG_PATH;
  if (explicit) return explicit;
  const onPath = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (!onPath.error && onPath.status === 0) return "ffmpeg";
  const local = path.join(TOOLS_DIR, FFMPEG_PIN.exe);
  if (fs.existsSync(local)) return local;
  if (process.platform !== "win32") {
    throw new Error("ffmpeg not found: install it (e.g. apt/brew) or pass --ffmpeg=<path>");
  }
  console.error(`[ffmpeg] downloading pinned build ${FFMPEG_PIN.url}`);
  fs.mkdirSync(TOOLS_DIR, { recursive: true });
  const res = await fetch(FFMPEG_PIN.url);
  if (!res.ok) throw new Error(`ffmpeg download failed: HTTP ${res.status}`);
  const zip = Buffer.from(await res.arrayBuffer());
  const digest = crypto.createHash("sha256").update(zip).digest("hex");
  if (digest !== FFMPEG_PIN.sha256) {
    throw new Error(`ffmpeg download checksum mismatch: ${digest}`);
  }
  const zipPath = path.join(TOOLS_DIR, "ffmpeg.zip");
  fs.writeFileSync(zipPath, zip);
  // Windows 10+ ships bsdtar (which reads zips) in System32; call it by path so a GNU tar earlier
  // on PATH (Git Bash) is not picked up. Fall back to PowerShell's Expand-Archive.
  const bsdtar = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
  if (fs.existsSync(bsdtar)) {
    execFileSync(bsdtar, ["-xf", zipPath, "-C", TOOLS_DIR], { stdio: "ignore" });
  } else {
    execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Expand-Archive -Force -Path '${zipPath}' -DestinationPath '${TOOLS_DIR}'`,
      ],
      { stdio: "ignore" }
    );
  }
  fs.rmSync(zipPath, { force: true });
  if (!fs.existsSync(local)) throw new Error(`ffmpeg extraction failed: ${local} missing`);
  console.error(`[ffmpeg] ready: ${local}`);
  return local;
}

/** Poll `expression` until truthy or the deadline passes. */
async function waitFor(evaluate, expression, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return true;
    await sleep(200);
  }
  return false;
}

async function main() {
  const ffmpeg = await resolveFfmpeg();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const framesDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-horizon-rec-"));
  /** @type {{ file: string, duration: number }[]} */
  const frames = [];
  const frameMs = 1000 / fps;
  const url = `${base}/?seed=${seed}&autoplay=1&autodelay=600000&dpr=${scale}`;
  console.error(`[record] ${url} at ${width}x${height} @${scale}x, ${fps} fps`);

  // Start on about:blank so the clock shim is registered before the game script runs.
  const { send, evaluate, close } = await connect({
    url: "about:blank",
    width,
    height,
    scale,
    chrome: opt("chrome", ""),
  });
  const grab = async (duration) => {
    const res = await send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true });
    if (!res.result) throw new Error(`screenshot failed: ${JSON.stringify(res.error)}`);
    const file = path.join(framesDir, `f${String(frames.length + 1).padStart(6, "0")}.png`);
    fs.writeFileSync(file, Buffer.from(res.result.data, "base64"));
    frames.push({ file, duration });
  };
  try {
    await send("Page.addScriptToEvaluateOnNewDocument", { source: CLOCK_SHIM });
    await send("Animation.enable");
    await send("Page.navigate", { url });
    if (!(await waitFor(evaluate, START_READY, 20000))) throw new Error("page did not load");
    await sleep(500);
    await grab(holdSec);

    // Take over the clock, launch, and step the run one output frame at a time.
    await evaluate("__frameClock.enable()");
    await evaluate("document.getElementById('startBtn').click()");
    const maxFrames = Math.ceil(maxSec * fps);
    let over = false;
    const t0 = Date.now();
    for (let i = 0; i < maxFrames && !over; i++) {
      await evaluate(`__frameClock.step(${frameMs})`);
      await grab(1 / fps);
      if (i % 10 === 9) {
        over = !!(await evaluate(GAME_OVER));
        // Keep CSS animations (finale flash, death punch) in step with virtual time.
        const realPerFrame = (Date.now() - t0) / (i + 1);
        await send("Animation.setPlaybackRate", {
          playbackRate: Math.min(1, frameMs / Math.max(realPerFrame, frameMs)),
        });
        if (i % 300 === 299) {
          console.error(
            `[record] ${((i + 1) / fps).toFixed(0)}s of run rendered (${realPerFrame.toFixed(0)} ms/frame)`
          );
        }
      }
    }
    if (!over) throw new Error(`run did not finish within --max=${maxSec}s`);
    const runSec = (frames.length - 1) / fps;
    console.error(`[record] run over after ${runSec.toFixed(1)}s`);

    // Back to real time for the network-bound debrief and the dialog flow.
    await send("Animation.setPlaybackRate", { playbackRate: 1 });
    await evaluate("__frameClock.disable()");
    await sleep(400);
    await grab(1.2);
    if (!(await waitFor(evaluate, DEBRIEF_READY, 60000))) throw new Error("debrief never rendered");
    await sleep(400);
    await grab(4);
    await evaluate("document.getElementById('okBtn').click()");
    await sleep(600);
    await grab(2);
    await evaluate(SKIP_INITIALS);
    await waitFor(evaluate, LEADERBOARD_VISIBLE, 10000);
    await sleep(600);
    await grab(3);
  } finally {
    close();
  }

  const lines = ["ffconcat version 1.0"];
  for (const f of frames) {
    lines.push(`file '${path.basename(f.file)}'`);
    lines.push(`duration ${f.duration.toFixed(5)}`);
  }
  lines.push(`file '${path.basename(frames[frames.length - 1].file)}'`);
  const list = path.join(framesDir, "list.txt");
  fs.writeFileSync(list, `${lines.join("\n")}\n`);
  const total = frames.reduce((s, f) => s + f.duration, 0);
  console.error(`[record] ${frames.length} frames, ${total.toFixed(1)}s; encoding (crf ${crf})`);
  execFileSync(
    ffmpeg,
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      list,
      "-vf",
      `fps=${fps},scale=trunc(iw/2)*2:trunc(ih/2)*2:out_color_matrix=bt709,format=yuv420p`,
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      String(crf),
      "-colorspace",
      "bt709",
      "-color_primaries",
      "bt709",
      "-color_trc",
      "bt709",
      "-movflags",
      "+faststart",
      out,
    ],
    { stdio: "inherit" }
  );
  fs.rmSync(framesDir, { recursive: true, force: true });
  const size = fs.statSync(out).size;
  console.error(`[record] wrote ${out} (${(size / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((err) => {
  console.error("[record-autoplay] failed:", err && err.message ? err.message : err);
  process.exit(1);
});
