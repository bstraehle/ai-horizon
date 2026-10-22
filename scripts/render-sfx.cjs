#!/usr/bin/env node
/**
 * render-sfx – turn a recorded sound timeline into a WAV using the game's own AudioManager.
 *
 * Usage:
 *   node --experimental-websocket scripts/render-sfx.cjs --events=store-video/_sfx.json
 *       [--out=store-video/_sfx.wav] [--rate=48000] [--tail=3]
 *
 * Input is the JSON written by `record-autoplay.cjs --sfx=...` ({ duration, events: [{ at, method,
 * args }], comms?: [...] }). `comms` holds the debrief commander's voice (playSpeech with the
 * clip), rendered through the same radio chain to its own `<out>-comms.wav` so narrate.py can mix
 * it at voice-over level. js/managers/AudioManager.js is bundled with esbuild and run in
 * headless Chrome on an OfflineAudioContext whose `currentTime` is pinned to each event's `at`
 * while that call schedules its nodes, so every sound starts exactly on its video frame and uses
 * the same synthesis, panning, reverb and compression as the live game. The voice cap is disabled
 * (offline rendering reports `onended` only after scheduling finishes); per-sound throttling still
 * applies. Output is 16-bit stereo PCM covering `duration + tail` seconds, unmuted and
 * unnormalised – level setting and ducking under the voice-over happen in store-video/narrate.py.
 */
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");
const { connect } = require("./screenshot.cjs");

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const eventsPath = path.resolve(opt("events", "store-video/_sfx.json"));
const out = path.resolve(opt("out", eventsPath.replace(/\.json$/i, ".wav")));
/** The commander's voice track (the timeline's `comms` events), next to the effects WAV. */
const commsOut = out.replace(/\.wav$/i, "-comms.wav");
const rate = Number(opt("rate", "48000")) || 48000;
const tail = Number(opt("tail", "3")) || 3;

/**
 * Page-side renderer: schedules every event (awaiting async ones such as playSpeech, whose MP3
 * decode must finish while the clock is still pinned), renders, and keeps 16-bit interleaved PCM.
 */
const RENDER = (events, duration, sampleRate, tailSec) => `(async () => {
  const events = ${JSON.stringify(events)};
  const length = Math.ceil((${duration} + ${tailSec}) * ${sampleRate});
  let now = 0;
  class PinnedClock extends OfflineAudioContext {
    constructor() { super(2, length, ${sampleRate}); }
    get currentTime() { return now; }
    get state() { return "running"; }
  }
  const storage = { getJSON: (_k, fallback) => fallback ?? null, setJSON: () => true };
  const audio = new SfxBundle.AudioManager({ AudioContextCtor: PinnedClock, storage });
  audio.unlock();
  let played = 0;
  for (const e of events) {
    if (typeof audio[e.method] !== "function") continue;
    now = e.at;
    audio._voices = 0;
    await audio[e.method](...(e.args || []));
    played++;
  }
  const rendered = await audio._ctx.startRendering();
  const l = rendered.getChannelData(0), r = rendered.getChannelData(1);
  const pcm = new Int16Array(l.length * 2);
  let peak = 0;
  for (let i = 0; i < l.length; i++) {
    const a = Math.max(-1, Math.min(1, l[i])), b = Math.max(-1, Math.min(1, r[i]));
    peak = Math.max(peak, Math.abs(a), Math.abs(b));
    pcm[2 * i] = a * 32767;
    pcm[2 * i + 1] = b * 32767;
  }
  const bytes = new Uint8Array(pcm.buffer);
  const CHUNK = 1 << 21;
  window.__sfxChunks = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    let s = "";
    const part = bytes.subarray(i, i + CHUNK);
    for (let j = 0; j < part.length; j += 0x8000) s += String.fromCharCode.apply(null, part.subarray(j, j + 0x8000));
    window.__sfxChunks.push(btoa(s));
  }
  return { played, frames: l.length, peak, chunks: window.__sfxChunks.length };
})()`;

/** Minimal RIFF/WAVE header for 16-bit PCM. */
function wavHeader(dataBytes, channels, sampleRate) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + dataBytes, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * channels * 2, 28);
  h.writeUInt16LE(channels * 2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(dataBytes, 40);
  return h;
}

async function main() {
  const timeline = JSON.parse(fs.readFileSync(eventsPath, "utf8"));
  if (!Array.isArray(timeline.events) || !(timeline.duration > 0)) {
    throw new Error(`${eventsPath}: expected { duration, events[] }`);
  }
  const bundle = esbuild.buildSync({
    entryPoints: [path.resolve(__dirname, "..", "js", "managers", "AudioManager.js")],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "SfxBundle",
    target: "es2020",
  }).outputFiles[0].text;

  const { evaluate, close } = await connect({ url: "about:blank", width: 400, height: 300 });
  /** Render `events` to a WAV at `file`. */
  const render = async (/** @type {any[]} */ events, /** @type {string} */ file) => {
    const info = await evaluate(RENDER(events, timeline.duration, rate, tail));
    if (!info || !info.frames) throw new Error("offline render failed");
    const parts = [];
    for (let i = 0; i < info.chunks; i++) {
      parts.push(Buffer.from(await evaluate(`window.__sfxChunks[${i}]`), "base64"));
    }
    const data = Buffer.concat(parts);
    fs.writeFileSync(file, Buffer.concat([wavHeader(data.length, 2, rate), data]));
    console.error(
      `[render-sfx] ${info.played}/${events.length} events, ` +
        `${(info.frames / rate).toFixed(1)}s, peak ${(20 * Math.log10(info.peak || 1e-9)).toFixed(1)} dBFS -> ${file}`
    );
  };
  try {
    await evaluate(bundle);
    await render(timeline.events, out);
    if (Array.isArray(timeline.comms) && timeline.comms.length) {
      await render(timeline.comms, commsOut);
    }
  } finally {
    close();
  }
}

main().catch((err) => {
  console.error("[render-sfx] failed:", err && err.message ? err.message : err);
  process.exit(1);
});
