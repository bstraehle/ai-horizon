#!/usr/bin/env node
/**
 * record-autoplay – record an autopilot run of the game as an MP4 (store listing / promo video).
 *
 * Usage:
 *   node --experimental-websocket scripts/record-autoplay.cjs [url] [--out=store-video/autoplay.mp4]
 *       [--width=360 --height=640 --scale=2] [--seed=12345] [--hold=4] [--fps=30] [--max=130]
 *       [--ffmpeg=<path>]
 *   npm run record
 *
 * Sequence: title screen held --hold seconds (default 4, via the game's `autodelay` flag, so the
 * remote high score is showing) → the run → debrief held 4s once the AI analysis has rendered → Ok
 * → initials prompt 2s → leaderboard held 3s. No score is submitted (initials are left empty; the
 * default seed survived ~50s on the 360x640 viewport — runs are only roughly repeatable because
 * adaptive quality reacts to frame timing, so re-run or change --seed if a take is short). Frames
 * come from the
 * DevTools screencast (the whole page: canvas, HUD and dialogs) with their capture timestamps; the
 * screencast only emits on repaint, so each frame lasts until the next one and the final frame
 * until the recording stopped. ffmpeg resamples to a constant frame rate and encodes H.264
 * yuv420p (limited range) with faststart, which YouTube / Play Console accept. The default
 * viewport 360x640 @2x gives a 720x1280 (9:16) phone video; use --scale=3 for 1080x1920.
 *
 * ffmpeg is taken from --ffmpeg, $FFMPEG_PATH or PATH. Otherwise a pinned static Windows build
 * (gyan.dev 8.1.2 essentials, SHA-256 verified) is downloaded once into .tools/ffmpeg (gitignored);
 * on other platforms install ffmpeg and put it on PATH.
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
const scale = Number(opt("scale", "2")) || 2;
const seed = opt("seed", "12345");
const holdSec = Number(opt("hold", "4")) || 4;
const fps = Number(opt("fps", "30")) || 30;
const maxSec = Number(opt("max", "130")) || 130;

const FFMPEG_PIN = {
  url: "https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-8.1.2-essentials_build.zip",
  sha256: "db580001caa24ac104c8cb856cd113a87b0a443f7bdf47d8c12b1d740584a2ec",
  exe: "ffmpeg-8.1.2-essentials_build/bin/ffmpeg.exe",
};
const TOOLS_DIR = path.resolve(__dirname, "..", ".tools", "ffmpeg");

const RUNNING =
  "document.getElementById('gameInfo').hidden && document.getElementById('gameOverScreen').hidden";
const DEBRIEF_READY =
  "!document.getElementById('gameOverScreen').hidden && !document.getElementById('okBtn').disabled";
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
  /** @type {{ file: string, t: number }[]} */
  const frames = [];
  const url = `${base}/?seed=${seed}&autoplay=1&autodelay=${Math.round(holdSec * 1000)}&dpr=${scale}`;
  console.error(`[record] ${url} at ${width}x${height} @${scale}x`);
  const session = await connect({ url, width, height, scale, chrome: opt("chrome", "") });
  const { send, evaluate, on, close } = session;
  let stoppedAt = 0;
  try {
    on("Page.screencastFrame", (p) => {
      const file = path.join(framesDir, `f${String(frames.length + 1).padStart(6, "0")}.jpg`);
      fs.writeFileSync(file, Buffer.from(p.data, "base64"));
      frames.push({ file, t: p.metadata.timestamp });
      send("Page.screencastFrameAck", { sessionId: p.sessionId });
    });
    await send("Page.startScreencast", {
      format: "jpeg",
      quality: 88,
      maxWidth: width * scale,
      maxHeight: height * scale,
      everyNthFrame: 1,
    });

    if (!(await waitFor(evaluate, RUNNING, holdSec * 1000 + 15000))) {
      throw new Error("autopilot did not start");
    }
    console.error("[record] run started");
    const runStart = Date.now();
    if (!(await waitFor(evaluate, DEBRIEF_READY, maxSec * 1000))) {
      throw new Error(`run did not finish within --max=${maxSec}s`);
    }
    console.error(`[record] run over after ${((Date.now() - runStart) / 1000).toFixed(1)}s`);
    await sleep(4000);
    await evaluate("document.getElementById('okBtn').click()");
    await sleep(2000);
    await evaluate(SKIP_INITIALS);
    await waitFor(evaluate, LEADERBOARD_VISIBLE, 10000);
    await sleep(3000);
    // Screencast timestamps are seconds since the epoch, so the wall clock marks the end.
    stoppedAt = Date.now() / 1000;
    await send("Page.stopScreencast");
    await sleep(300);
  } finally {
    close();
  }

  if (frames.length < 2) throw new Error("no screencast frames captured");
  const first = frames[0].t;
  const end = Math.max(stoppedAt, frames[frames.length - 1].t + 1 / fps);
  const lines = ["ffconcat version 1.0"];
  for (let i = 0; i < frames.length; i++) {
    const next = i + 1 < frames.length ? frames[i + 1].t : end;
    lines.push(`file '${path.basename(frames[i].file)}'`);
    lines.push(`duration ${Math.max(0.001, next - frames[i].t).toFixed(4)}`);
  }
  lines.push(`file '${path.basename(frames[frames.length - 1].file)}'`);
  const list = path.join(framesDir, "list.txt");
  fs.writeFileSync(list, `${lines.join("\n")}\n`);
  console.error(
    `[record] ${frames.length} frames over ${(end - first).toFixed(1)}s (${(frames.length / (end - first)).toFixed(1)} fps captured); encoding at ${fps} fps`
  );
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
      `fps=${fps},scale=trunc(iw/2)*2:trunc(ih/2)*2:in_range=jpeg:out_range=mpeg,format=yuv420p`,
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "20",
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
