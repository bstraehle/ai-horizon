#!/usr/bin/env node
/**
 * record-autoplay – render an autopilot run of the game to an MP4 (store listing / promo video).
 *
 * Usage:
 *   node --experimental-websocket scripts/record-autoplay.cjs [url] [--out=store-video/autoplay.mp4]
 *       [--width=360 --height=640 --scale=3] [--seed=12345] [--hold=4] [--fps=60] [--max=130]
 *       [--crf=16] [--ffmpeg=<path>] [--sfx=store-video/_sfx.json]
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
 * frame by frame → game-over dialog with the animated "incoming transmission" (2s) → the AI
 * headline typing out (3.5s) and the Well done / Next mission sections fading in (0.5s) →
 * debrief held (3.5s) → Ok → initials prompt (2s) → leaderboard (3s). The post-run timeline is
 * fixed, so every cut of the same seed shares one narration timing. No score is submitted
 * (initials left empty). The default seed survived ~50s on the 360x640 viewport; other seeds
 * mostly die within 15s there.
 *
 * Both are replayed by this script once the real debrief has arrived and typed out, since a slow
 * capture cannot follow the wall clock they run on: the transmission is saved at game over and
 * shown again in front of the debrief, then the recorder resets the headline's spans and reveals
 * it grapheme by grapheme, one step per output frame, in the game's own DOM and CSS (cursor
 * included). CSS animations (pulsing transmission, cursor, fade-in) are slowed to the measured
 * capture speed, as during the run.
 *
 * Sound: screenshots carry no audio, so with --sfx the page runs with `soundlog=1` and every
 * sound-effect call made during the stepped run is written to that JSON as
 * `{ fps, duration, events: [{ at, method, args }] }`, where `at` is seconds into this video.
 * scripts/render-sfx.cjs turns it into a WAV with the game's own AudioManager.
 *
 * Splice (--splice=<earlier raw MP4 of the same seed/size/fps/hold>): re-shoot only the post-run
 * screens (debrief, initials, leaderboard) after a UI change, in minutes instead of a full render.
 * The run is stepped exactly as before but captured only from the frame the game-over dialog
 * appears (the dialog's content arrives over the network, so slow renders can show the earlier
 * debrief before the run loop ends). The recorder checks that the run matches the earlier video
 * (same total frame count, and the first game-over frame equal to the earlier one by PSNR) and
 * writes --out as the earlier frames up to game over followed by the new ones. The run and its
 * sound timeline are unchanged, so the earlier --sfx JSON/WAV stay valid – unless the change adds
 * sounds or alters the dialog's first frame (both true of the transmission reveal), which needs a
 * full render.
 *
 * Output: H.264 yuv420p (bt709, faststart) at --fps; 360x640 @3x = 1080x1920 (9:16). Each PNG is
 * piped straight into ffmpeg (image2pipe at the output rate; held screens are the same image
 * written repeatedly), so nothing is staged on disk – a 4K run would otherwise need tens of GB of
 * frames – and the constant-rate pipe avoids the concat demuxer, whose 1/25s image timebase
 * quantises frame times and turns a 60 fps sequence into a 25 Hz stutter. Encoding overlaps
 * capture; if the encoder falls behind, pipe backpressure pauses capture. Expect a few minutes of
 * rendering per minute of footage at 2x (about 4x longer at --scale=4). ffmpeg is taken from --ffmpeg, $FFMPEG_PATH or
 * PATH; otherwise a pinned static Windows build (gyan.dev 8.1.2 essentials, SHA-256 verified) is
 * downloaded once into .tools/ffmpeg (gitignored). On other platforms install ffmpeg first.
 */
const { execFileSync, spawn, spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
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
const sfxOut = opt("sfx", "") ? path.resolve(opt("sfx", "")) : "";
const spliceFrom = opt("splice", "") ? path.resolve(opt("splice", "")) : "";
/** Minimum PSNR (dB) between the re-stepped final run frame and the earlier video's frame. */
const SPLICE_MIN_PSNR = 35;

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
/** Debrief rendered and its headline fully typed out (the sections fade in once it is). */
const DEBRIEF_READY = `${GAME_OVER} && !document.getElementById('okBtn').disabled &&
  !!document.querySelector('#postGameMessage .debrief:not(.pending)')`;
const SKIP_INITIALS = `(() => {
  const screen = document.getElementById('initialsScreen');
  if (!screen || screen.hidden) return 'no-initials';
  const input = document.getElementById('initialsInput');
  if (input) input.value = '';
  document.getElementById('submitScoreBtn').click();
  return 'skipped';
})()`;
const LEADERBOARD_VISIBLE = "!document.getElementById('leaderboardScreen').hidden";

/** The debrief has replaced the incoming transmission in the post-game panel. */
const DEBRIEF_ARRIVED = "!!document.querySelector('#postGameMessage .debrief')";

/** Post-run timeline, in seconds of video (fixed, see the header), from the game-over frame. */
const GAME_OVER_TAIL_S = 0.6;
const TRANSMISSION_S = 2;
const TYPING_S = 3.5;
const FADE_S = 0.5;
const DEBRIEF_HOLD_S = 3.5;

/**
 * The post-game panel's incoming transmission, saved at game over (false when it is not
 * showing), then swapped in front of the arrived debrief and back, with the outcome title and
 * the Ok button hidden as the game hides them while the transmission is incoming. Nodes are
 * cloned and moved rather than written as HTML: the page enforces Trusted Types.
 */
const SAVE_TRANSMISSION = `(() => {
  const m = document.getElementById('postGameMessage');
  if (!m.querySelector('.transmission')) return false;
  window.__transmission = { nodes: Array.from(m.childNodes, (n) => n.cloneNode(true)), cls: m.className };
  return true;
})()`;
const SHOW_TRANSMISSION = `(() => {
  const m = document.getElementById('postGameMessage');
  window.__debrief = { nodes: Array.from(m.childNodes), cls: m.className };
  m.className = __transmission.cls;
  m.replaceChildren(...__transmission.nodes);
  document.getElementById('gameOverTitle').hidden = true;
  document.getElementById('okBtn').hidden = true;
  return !!m.querySelector('.transmission');
})()`;
const SHOW_DEBRIEF = `(() => {
  const m = document.getElementById('postGameMessage');
  m.className = __debrief.cls;
  m.replaceChildren(...__debrief.nodes);
  document.getElementById('gameOverTitle').hidden = false;
  const ok = document.getElementById('okBtn');
  ok.hidden = false;
  ok.focus();
})()`;

/**
 * Installs `window.__typeReplay` over the rendered debrief and resets it to an empty headline
 * with the sections hidden (no fade-out); returns the headline's grapheme count. `set(k)` shows
 * the first k graphemes (cursor while typing), `end()` shows all and fades the sections in.
 */
const TYPE_REPLAY = `(() => {
  const root = document.getElementById('postGameMessage');
  const typed = root.querySelector('.debrief-typed');
  const shown = root.querySelector('.debrief-typed-shown');
  const rest = root.querySelector('.debrief-typed-rest');
  const debrief = root.querySelector('.debrief');
  if (!typed || !shown || !rest || !debrief) return 0;
  const parts = Array.from(
    new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(shown.textContent + rest.textContent),
    (s) => s.segment
  );
  const set = (k) => {
    shown.textContent = parts.slice(0, k).join('');
    rest.textContent = parts.slice(k).join('');
    typed.classList.toggle('typing', k < parts.length);
  };
  debrief.style.transition = 'none';
  debrief.classList.add('pending');
  void debrief.offsetWidth;
  debrief.style.transition = '';
  set(0);
  window.__typeReplay = { set, end: () => { set(parts.length); debrief.classList.remove('pending'); } };
  return parts.length;
})()`;

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

/** Screenshot (RGB PNG) to the video's even-sized bt709 yuv420p frames. */
const TO_YUV = "scale=trunc(iw/2)*2:trunc(ih/2)*2:out_color_matrix=bt709,format=yuv420p";

/** H.264 settings shared by the capture encoder and the splice. */
const ENCODE_ARGS = () => [
  "-r",
  String(fps),
  "-vsync",
  "cfr",
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
];

/**
 * Run ffmpeg/ffprobe to completion.
 * @param {string} exe
 * @param {string[]} argv
 * @returns {{ stdout: string, stderr: string }}
 */
function run(exe, argv) {
  const res = spawnSync(exe, argv, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (res.error || res.status !== 0) {
    throw new Error(`${path.basename(exe)} failed: ${res.error || res.stderr.slice(-500)}`);
  }
  return { stdout: res.stdout, stderr: res.stderr };
}

/**
 * Check the re-stepped run against the earlier video and write `out` as its first `cutFrame`
 * frames followed by the new frames in `tail` (which start at that frame).
 * @param {string} ffmpeg
 * @param {{ cutFrame: number, totalFrames: number, firstFrame: Buffer, tail: string }} take
 */
function splice(ffmpeg, { cutFrame, totalFrames, firstFrame, tail }) {
  const ffprobe = ffmpeg.replace(/ffmpeg(\.exe)?$/i, "ffprobe$1");
  const probe = run(ffprobe, [
    "-v",
    "error",
    "-count_packets",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=nb_read_packets",
    "-of",
    "csv=p=0",
    spliceFrom,
  ]);
  const earlier = Number(probe.stdout.trim());
  if (earlier !== totalFrames) {
    throw new Error(
      `splice: earlier video has ${earlier} frames, this run ${totalFrames} – ` +
        "seed, size, fps or hold differ, or the run is no longer deterministic"
    );
  }
  const firstPng = `${out}.first.png`;
  fs.writeFileSync(firstPng, firstFrame);
  const { stderr } = run(ffmpeg, [
    "-hide_banner",
    "-i",
    spliceFrom,
    "-i",
    firstPng,
    "-filter_complex",
    `[0:v]select=eq(n\\,${cutFrame}),format=yuv420p[a];[1:v]${TO_YUV}[b];[a][b]psnr`,
    "-frames:v",
    "1",
    "-f",
    "null",
    "-",
  ]);
  const m = /average:([\d.]+|inf)/.exec(stderr);
  const psnr = m ? (m[1] === "inf" ? Infinity : Number(m[1])) : 0;
  console.error(
    `[splice] game-over frame ${cutFrame} vs earlier video: PSNR ${psnr.toFixed(1)} dB`
  );
  if (!(psnr >= SPLICE_MIN_PSNR)) {
    throw new Error(
      `splice: game-over frame differs from the earlier video (PSNR ${psnr} dB, see ${firstPng})`
    );
  }
  fs.rmSync(firstPng, { force: true });
  run(ffmpeg, [
    "-y",
    "-loglevel",
    "error",
    "-i",
    spliceFrom,
    "-i",
    tail,
    "-filter_complex",
    `[0:v]trim=end_frame=${cutFrame},setpts=PTS-STARTPTS[a];[1:v]setpts=PTS-STARTPTS[b];` +
      "[a][b]concat=n=2:v=1:a=0,format=yuv420p[v]",
    "-map",
    "[v]",
    ...ENCODE_ARGS(),
    out,
  ]);
  fs.rmSync(tail, { force: true });
}

/**
 * Start ffmpeg reading a constant-rate PNG stream on stdin and encoding it to `file`.
 * @param {string} ffmpeg
 * @param {string} file
 * @returns {{ write: (png: Buffer) => Promise<void>, finish: () => Promise<void>, kill: () => void }}
 */
function startEncoder(ffmpeg, file) {
  const proc = spawn(
    ffmpeg,
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "image2pipe",
      "-framerate",
      String(fps),
      "-c:v",
      "png",
      "-i",
      "-",
      "-vf",
      TO_YUV,
      ...ENCODE_ARGS(),
      file,
    ],
    { stdio: ["pipe", "inherit", "inherit"] }
  );
  /** @type {Error|null} */
  let failure = null;
  const done = new Promise((resolve, reject) => {
    proc.on("error", (err) => reject((failure = err)));
    proc.on("close", (code) =>
      code === 0 ? resolve(undefined) : reject((failure = new Error(`ffmpeg exited ${code}`)))
    );
  });
  done.catch(() => {});
  proc.stdin.on("error", (err) => (failure = failure || err));
  return {
    write: (png) =>
      new Promise((resolve, reject) => {
        if (failure) return reject(failure);
        if (proc.stdin.write(png)) resolve();
        else proc.stdin.once("drain", () => resolve());
      }),
    finish: async () => {
      proc.stdin.end();
      await done;
    },
    kill: () => proc.kill(),
  };
}

async function main() {
  const ffmpeg = await resolveFfmpeg();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  /** Output frames written so far (held screens count once per repeat). */
  let frameCount = 0;
  const frameMs = 1000 / fps;
  const url = `${base}/?seed=${seed}&autoplay=1&autodelay=600000&dpr=${scale}${sfxOut ? "&soundlog=1" : ""}`;
  /** Virtual clock reading at the start of the run (sound timeline origin). */
  let runStartMs = 0;
  console.error(`[record] ${url} at ${width}x${height} @${scale}x, ${fps} fps`);

  // Start on about:blank so the clock shim is registered before the game script runs.
  const { send, evaluate, close } = await connect({
    url: "about:blank",
    width,
    height,
    scale,
    chrome: opt("chrome", ""),
  });
  // One PNG per output frame on the encoder's stdin; a held screen is the same image repeated, so
  // ffmpeg reads a plain constant-rate stream and never has to resample timestamps. When splicing,
  // only frames from game over on are encoded (to a temporary file); earlier ones are counted.
  const tailFile = `${out}.tail.mp4`;
  const encoder = startEncoder(ffmpeg, spliceFrom ? tailFile : out);
  let encoded = false;
  const shoot = async () => {
    const res = await send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true });
    if (!res.result) throw new Error(`screenshot failed: ${JSON.stringify(res.error)}`);
    return Buffer.from(res.result.data, "base64");
  };
  const frames = (/** @type {number} */ duration) => Math.max(1, Math.round(duration * fps));
  /** Splice only: index of the first game-over frame and its screenshot. */
  let cutFrame = -1;
  /** @type {Buffer|null} */
  let firstFrame = null;
  /** @type {Buffer|null} */
  let lastPng = null;
  const grab = async (/** @type {number} */ duration, repeatLast = false) => {
    const png = repeatLast && lastPng ? lastPng : await shoot();
    lastPng = png;
    if (spliceFrom && cutFrame < 0) [cutFrame, firstFrame] = [frameCount, png];
    for (let i = 0, n = frames(duration); i < n; i++) {
      await encoder.write(png);
      frameCount++;
    }
  };
  /**
   * Capture `duration` of distinct frames in real time, keeping CSS animations in step with the
   * output frame rate; `beforeFrame(i, n)` runs before each one.
   */
  const grabLive = async (
    /** @type {number} */ duration,
    /** @type {(i: number, n: number) => Promise<void>} */ beforeFrame = async () => {}
  ) => {
    const n = frames(duration);
    let last = Date.now();
    for (let i = 0; i < n; i++) {
      await beforeFrame(i, n);
      await grab(1 / fps);
      const now = Date.now();
      const playbackRate = Math.min(1, frameMs / Math.max(now - last, frameMs));
      last = now;
      await send("Animation.setPlaybackRate", { playbackRate });
    }
  };
  /** Segment boundaries (output frame numbers), logged for picking screenshot frames. */
  const mark = (/** @type {string} */ name) =>
    console.error(`[record] ${name} from frame ${frameCount} (${(frameCount / fps).toFixed(2)}s)`);
  try {
    await send("Page.addScriptToEvaluateOnNewDocument", { source: CLOCK_SHIM });
    await send("Animation.enable");
    await send("Page.navigate", { url });
    if (!(await waitFor(evaluate, START_READY, 20000))) throw new Error("page did not load");
    await sleep(500);
    if (spliceFrom) frameCount += frames(holdSec);
    else await grab(holdSec);

    // Take over the clock, launch, and step the run one output frame at a time.
    await evaluate("__frameClock.enable()");
    runStartMs = await evaluate("performance.now()");
    await evaluate("document.getElementById('startBtn').click()");
    const maxFrames = Math.ceil(maxSec * fps);
    let over = false;
    const t0 = Date.now();
    // Stop on the first game-over frame, so the run never shows the dialog past its transmission.
    for (let i = 0; i < maxFrames && !over; i++) {
      await evaluate(`__frameClock.step(${frameMs})`);
      over = !!(await evaluate(GAME_OVER));
      if (!spliceFrom || cutFrame >= 0 || over) await grab(1 / fps);
      else frameCount++;
      if (i % 10 === 9) {
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
    console.error(`[record] run over after ${(frameCount / fps - holdSec).toFixed(1)}s`);
    // The transmission is kept (DOM snapshot) and replayed once the debrief has arrived, since a
    // slow capture would otherwise only catch a few frames of it.
    if (!(await evaluate(SAVE_TRANSMISSION)))
      throw new Error("no incoming transmission at game over");
    // Let the crash flash and the dialog's entrance play out; if the debrief arrives first, the
    // last frame is held instead, so the timeline stays fixed.
    for (let left = frames(GAME_OVER_TAIL_S); left > 0; left--) {
      await evaluate(`__frameClock.step(${frameMs})`);
      if (await evaluate(DEBRIEF_ARRIVED)) {
        await grab(left / fps, true);
        break;
      }
      await grab(1 / fps);
    }
    // Only the stepped run is on the virtual clock, so only its sounds map onto video frames. A
    // sound fired during step k first appears in frame k-1 (frames are grabbed after stepping).
    const soundLog = sfxOut ? (await evaluate("window.__soundLog || []")) || [] : [];

    // Back to real time for the network-bound debrief and the dialog flow.
    await evaluate("__frameClock.disable()");
    if (!(await waitFor(evaluate, DEBRIEF_READY, 60000))) throw new Error("debrief never rendered");
    await sleep(200);
    if (!(await evaluate(SHOW_TRANSMISSION))) throw new Error("could not replay the transmission");
    mark("transmission");
    await grabLive(TRANSMISSION_S);
    await evaluate(SHOW_DEBRIEF);
    const graphemes = await evaluate(TYPE_REPLAY);
    if (!graphemes) throw new Error("debrief headline not found for the typing replay");
    mark("typing");
    await grabLive(TYPING_S, async (i, n) => {
      await evaluate(`__typeReplay.set(${Math.ceil(((i + 1) / n) * graphemes)})`);
    });
    await evaluate("__typeReplay.end()");
    await grabLive(FADE_S);
    await send("Animation.setPlaybackRate", { playbackRate: 1 });
    await sleep(500);
    mark("debrief");
    await grab(DEBRIEF_HOLD_S);
    await evaluate("document.getElementById('okBtn').click()");
    await sleep(600);
    mark("initials");
    await grab(2);
    await evaluate(SKIP_INITIALS);
    await waitFor(evaluate, LEADERBOARD_VISIBLE, 10000);
    await sleep(600);
    mark("leaderboard");
    await grab(3);
    if (sfxOut) {
      const events = soundLog.map((/** @type {any} */ e) => ({
        at: Math.max(0, holdSec + (e.t - runStartMs) / 1000 - 1 / fps),
        method: e.method,
        args: e.args,
      }));
      fs.mkdirSync(path.dirname(sfxOut), { recursive: true });
      fs.writeFileSync(
        sfxOut,
        JSON.stringify({ fps, duration: frameCount / fps, events }, null, 1)
      );
      console.error(`[record] wrote ${events.length} sound events to ${sfxOut}`);
    }
    console.error(
      `[record] ${frameCount} frames, ${(frameCount / fps).toFixed(1)}s; finishing encode (crf ${crf})`
    );
    await encoder.finish();
    encoded = true;
    if (spliceFrom && firstFrame) {
      console.error(`[splice] joining ${cutFrame} earlier frames with the new game-over frames`);
      splice(ffmpeg, { cutFrame, totalFrames: frameCount, firstFrame, tail: tailFile });
    }
  } finally {
    close();
    if (!encoded) encoder.kill();
  }

  const size = fs.statSync(out).size;
  console.error(`[record] wrote ${out} (${(size / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((err) => {
  console.error("[record-autoplay] failed:", err && err.message ? err.message : err);
  process.exit(1);
});
