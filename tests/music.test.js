// @ts-check
import { describe, it, expect, vi } from "vitest";
import { MusicSequencer, MUSIC_STYLES } from "../js/managers/MusicSequencer.js";
import { AudioManager } from "../js/managers/AudioManager.js";
import { updateFinaleMusic } from "../js/systems/GameUpdate.js";
import { CONFIG } from "../js/constants.js";

/** Bar length of a score, in seconds. @param {"red"|"blue"} style */
const bar = (style) => (4 * 60) / MUSIC_STYLES[style].bpm;

/** AudioParam stand-in recording every automation call as [method, value, time]. */
function makeParam(value = 0) {
  /** @type {[string, number, number][]} */
  const calls = [];
  const rec = (/** @type {string} */ name) => (/** @type {number} */ v, /** @type {number} */ t) =>
    calls.push([name, v, t]);
  return {
    value,
    calls,
    setValueAtTime: rec("set"),
    linearRampToValueAtTime: rec("linear"),
    exponentialRampToValueAtTime: rec("exp"),
    setTargetAtTime: rec("target"),
    cancelScheduledValues: (/** @type {number} */ t) => calls.push(["cancel", 0, t]),
  };
}

/** Fake (Offline)AudioContext recording oscillators and buffer sources with their start times. */
class FakeContext {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 1000;
    this.state = "suspended";
    this.destination = {};
    /** @type {any[]} */ this.oscillators = [];
    /** @type {any[]} */ this.sources = [];
  }
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
  suspend() {
    this.state = "suspended";
    return Promise.resolve();
  }
  node(extra = {}) {
    return { connect: vi.fn(), disconnect: vi.fn(), ...extra };
  }
  createGain() {
    return this.node({ gain: makeParam(1) });
  }
  createDelay() {
    return this.node({ delayTime: makeParam() });
  }
  createBiquadFilter() {
    return this.node({ type: "lowpass", frequency: makeParam(), Q: makeParam() });
  }
  createDynamicsCompressor() {
    const p = makeParam;
    return this.node({ threshold: p(), knee: p(), ratio: p(), attack: p(), release: p() });
  }
  createConvolver() {
    return this.node({ buffer: null });
  }
  createWaveShaper() {
    return this.node({ curve: null, oversample: "none" });
  }
  createAnalyser() {
    return this.node({ fftSize: 2048, getFloatTimeDomainData: () => {} });
  }
  createOscillator() {
    const o = this.node({
      type: "sine",
      frequency: makeParam(),
      detune: makeParam(),
      at: /** @type {number|null} */ (null),
      start(/** @type {number} */ t) {
        this.at = t;
      },
      stop: vi.fn(),
    });
    this.oscillators.push(o);
    return o;
  }
  createBufferSource() {
    const s = this.node({
      buffer: null,
      loop: false,
      at: /** @type {number|null} */ (null),
      start(/** @type {number} */ t) {
        this.at = t;
      },
      stop: vi.fn(),
    });
    this.sources.push(s);
    return s;
  }
  /** @param {number} channels @param {number} len */
  createBuffer(channels, len) {
    const data = Array.from({ length: channels }, () => new Float32Array(len));
    return { getChannelData: (/** @type {number} */ c) => data[c] };
  }
  decodeAudioData() {
    return Promise.resolve({ duration: 2 });
  }
}

/** A sequencer on a fresh fake context. */
function sequencer(seed = 7) {
  const ctx = new FakeContext();
  const out = ctx.createGain();
  return {
    ctx,
    seq: new MusicSequencer(/** @type {any} */ (ctx), /** @type {any} */ (out), null, { seed }),
  };
}

/** Oscillators started in [from, to) that match `pred`. @param {any} ctx */
const started = (ctx, from, to, pred = (/** @type {any} */ _o) => true) =>
  ctx.oscillators.filter(
    (/** @type {any} */ o) => o.at !== null && o.at >= from - 1e-9 && o.at < to - 1e-9 && pred(o)
  );
/** A thump (heartbeat, tom, pulse, boom) that starts at `f0` Hz. @param {number} f0 */
const thump = (f0) => (/** @type {any} */ o) =>
  o.frequency.calls.some((/** @type {any[]} */ c) => c[0] === "set" && c[1] === f0);
/** @param {any} o */
const isTick = (o) => o.type === "square" && o.frequency.value === 2000;
/** @param {number} note */
const hzOf = (note) => 440 * 2 ** ((note - 69) / 12);
/** Notes (MIDI) of the saws started in [from, to). @param {any} ctx */
const sawNotes = (ctx, from, to) =>
  [
    ...new Set(
      started(ctx, from, to, (o) => o.type === "sawtooth").map((o) =>
        Math.round(69 + 12 * Math.log2(o.frequency.value / 440))
      )
    ),
  ].sort((a, b) => a - b);

describe("MusicSequencer", () => {
  it("is silent while off, then plays Abyss for red: dark pad, drone and a heartbeat each bar", () => {
    const { ctx, seq } = sequencer();
    seq.schedule(10);
    expect(ctx.oscillators).toHaveLength(0);
    seq.setMood("mission", 1, { style: "red" });
    const B = bar("red");
    seq.schedule(1 + 4 * B);
    expect(seq.style).toBe("red");
    expect(sawNotes(ctx, 1, 1.01)).toEqual([38, 39, 50, 53, 57]);
    const beats = started(ctx, 1, 1 + 4 * B, thump(62)).map((o) => +(o.at - 1).toFixed(6));
    expect(beats).toEqual([1, 2, 3].map((i) => +(i * B).toFixed(6)));
    expect(started(ctx, 1, 1 + 4 * B, thump(55))).toHaveLength(3);
  });

  it("plays Event Horizon for blue: choir pad, a ticking clock and a braam every two bars", () => {
    const { ctx, seq } = sequencer();
    seq.setMood("mission", 0, { style: "blue" });
    const B = bar("blue");
    seq.schedule(4 * B);
    expect(sawNotes(ctx, 0, 0.01)).toEqual([50, 57, 62, 65]);
    expect(started(ctx, B, 2 * B, isTick)).toHaveLength(8);
    expect(started(ctx, 0, B, isTick)).toHaveLength(0);
    const braams = started(
      ctx,
      0,
      4 * B,
      (o) => o.type === "sawtooth" && o.frequency.value === hzOf(26)
    );
    expect(braams.map((o) => o.at)).toEqual([2 * B]);
  });

  it("builds the finale over its length: the heartbeat races, toms and a riser join", () => {
    const { ctx, seq } = sequencer();
    seq.setMood("mission", 0, { style: "red" });
    seq.setMood("finale", 10, { length: 15 });
    seq.schedule(25);
    const early = started(ctx, 10, 15, thump(62)).length;
    const late = started(ctx, 20, 25, thump(62)).length;
    expect(early).toBeGreaterThanOrEqual(5);
    expect(late).toBeGreaterThanOrEqual(2 * early - 1);
    expect(started(ctx, 10, 25, thump(130)).length).toBeGreaterThan(15);
    expect(ctx.sources.some((/** @type {any} */ s) => s.loop && s.at === 10)).toBe(true);
    expect(seq.mood).toBe("finale");
  });

  it("marks the finale: an entry hit, a bass ostinato that speeds up and a swell in level", () => {
    const { ctx, seq } = sequencer();
    seq.setMood("mission", 0, { style: "blue" });
    seq.schedule(10);
    // Ostinato notes are low saws without detune (the braam's low saws are detuned).
    const isPulse = (/** @type {any} */ o) =>
      o.type === "sawtooth" && o.frequency.value < 80 && o.detune.value === 0;
    expect(started(ctx, 0, 10, isPulse)).toHaveLength(0);
    seq.setMood("finale", 10, { length: 8 });
    seq.schedule(18);
    expect(started(ctx, 10, 10.01, thump(80))).toHaveLength(1);
    const step = bar("blue") / 16;
    expect(started(ctx, 10, 14, isPulse).length).toBeCloseTo(4 / step / 2, -1);
    expect(started(ctx, 14, 18, isPulse).length).toBeCloseTo(4 / step, -1);
    const target = CONFIG.AUDIO.MUSIC.VOLUME * MUSIC_STYLES.blue.level;
    expect(/** @type {any} */ (seq)._level.gain.calls).toContainEqual([
      "linear",
      target * CONFIG.AUDIO.MUSIC.FINALE_GAIN,
      18,
    ]);
  });

  it("ends a survived mission on the impact and then stays silent", () => {
    const { ctx, seq } = sequencer();
    seq.setMood("mission", 0, { style: "blue" });
    seq.setMood("finale", 2, { length: 4 });
    seq.setMood("end", 6);
    seq.schedule(30);
    expect(started(ctx, 6, 6.01, thump(70))).toHaveLength(1);
    expect(started(ctx, 6.01, 30)).toHaveLength(0);
    expect(seq.mood).toBe("off");
  });

  it("cuts on a crash and stays silent while off", () => {
    const { ctx, seq } = sequencer();
    seq.setMood("mission", 0, { style: "red" });
    seq.setMood("finale", 5, { length: 15 });
    seq.setMood("off", 8);
    seq.schedule(30);
    expect(started(ctx, 8, 30)).toHaveLength(0);
    const level = /** @type {any} */ (seq)._level.gain.calls;
    expect(level).toContainEqual(["target", 0, 8]);
  });

  it("restarts on the first chord when the style changes", () => {
    const { ctx, seq } = sequencer();
    seq.setMood("mission", 0, { style: "red" });
    seq.setMood("mission", 10, { style: "blue" });
    seq.schedule(10.5);
    expect(sawNotes(ctx, 10, 10.5)).toEqual([50, 57, 62, 65]);
    expect(seq.style).toBe("blue");
  });

  it("never rewrites notes already scheduled when a later change arrives", () => {
    const { ctx, seq } = sequencer();
    seq.setMood("mission", 0, { style: "blue" });
    seq.schedule(8);
    const before = ctx.oscillators.length;
    seq.setMood("off", 4);
    expect(ctx.oscillators.length).toBe(before);
  });

  it("is identical for the same seed", () => {
    const run = () => {
      const { ctx, seq } = sequencer(42);
      seq.setMood("mission", 0, { style: "red" });
      seq.setMood("finale", 10, { length: 5 });
      seq.schedule(20);
      return ctx.oscillators.map((/** @type {any} */ o) => [o.type, o.at, o.frequency.value]);
    };
    expect(run()).toEqual(run());
  });
});

describe("AudioManager music", () => {
  function setup() {
    /** @type {FakeContext[]} */
    const instances = [];
    class Ctx extends FakeContext {
      constructor() {
        super();
        instances.push(this);
      }
    }
    const storage = /** @type {any} */ ({ getJSON: () => false, setJSON: () => true });
    const audio = new AudioManager({
      AudioContextCtor: /** @type {any} */ (Ctx),
      storage,
      random: () => 0.5,
    });
    return { audio, instances };
  }

  it("is a no-op until unlocked, then schedules ahead on a timer", () => {
    vi.useFakeTimers();
    try {
      const { audio, instances } = setup();
      audio.setMusic("mission", { style: "blue" });
      expect(instances).toHaveLength(0);
      audio.unlock();
      const ctx = instances[0];
      audio.setMusic("mission", { style: "blue" });
      const first = ctx.oscillators.length;
      expect(first).toBeGreaterThan(0);
      ctx.currentTime = bar("blue") + 1;
      vi.advanceTimersByTime(CONFIG.AUDIO.MUSIC.TICK_MS);
      expect(started(ctx, bar("blue"), ctx.currentTime, isTick).length).toBeGreaterThan(0);
      audio.setMusic("finale", { length: 15 });
      const music = /** @type {any} */ (audio)._music;
      expect(music.mood).toBe("finale");
      audio.setMusic("end", { delay: 2.5 });
      expect(music._changes).toEqual([{ mood: "end", at: ctx.currentTime + 2.5 }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("schedules a whole timeline offline without a timer", () => {
    const { audio, instances } = setup();
    const g = /** @type {any} */ (globalThis);
    const saved = g.OfflineAudioContext;
    g.OfflineAudioContext = FakeContext;
    const timers = vi.spyOn(globalThis, "setInterval");
    try {
      audio.unlock();
      audio.setMusic("mission", { style: "red" });
      audio.scheduleMusic(4 * bar("red"));
      expect(timers).not.toHaveBeenCalled();
      expect(started(instances[0], 0, 4 * bar("red"), thump(62))).toHaveLength(3);
    } finally {
      g.OfflineAudioContext = saved;
      timers.mockRestore();
    }
  });
});

describe("finale music", () => {
  it("starts the finale once, building over the seconds left", () => {
    const setMusic = vi.fn();
    const window = CONFIG.GAME.FINALE_BONUS_WINDOW_SECONDS;
    const game = { timerRemaining: window + 1, audio: { setMusic } };
    updateFinaleMusic(game);
    expect(setMusic).not.toHaveBeenCalled();
    game.timerRemaining = window - 0.01;
    updateFinaleMusic(game);
    game.timerRemaining -= 1;
    updateFinaleMusic(game);
    expect(setMusic.mock.calls).toEqual([["finale", { length: window - 0.01 }]]);
    expect(() => updateFinaleMusic({ timerRemaining: 1 })).not.toThrow();
  });
});
