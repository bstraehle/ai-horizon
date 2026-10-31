// @ts-check
import { describe, it, expect, vi } from "vitest";
import { MusicSequencer, MUSIC_MOODS } from "../js/managers/MusicSequencer.js";
import { AudioManager } from "../js/managers/AudioManager.js";
import { updateFinaleMusic } from "../js/systems/GameUpdate.js";
import { CONFIG } from "../js/constants.js";

const BEAT = 60 / CONFIG.AUDIO.MUSIC.BPM;
const BAR = 4 * BEAT;

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
    /** @type {any[]} */ this.gains = [];
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
    const g = this.node({ gain: makeParam(1) });
    this.gains.push(g);
    return g;
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
/** @param {any} o */
const isKick = (o) =>
  o.frequency.calls.some((/** @type {any[]} */ c) => c[0] === "set" && c[1] === 110);
/** @param {any} o */
const isPluck = (o) => o.type === "square";
/** Hats started in [from, to). @param {any} ctx */
const hats = (ctx, from, to) =>
  ctx.sources.filter((/** @type {any} */ s) => s.at >= from - 1e-9 && s.at < to - 1e-9).length;

describe("MusicSequencer", () => {
  it("is silent while off, then drives with a kick on every beat and off-beat hats", () => {
    const { ctx, seq } = sequencer();
    seq.schedule(10);
    expect(started(ctx, 0, 10, (o) => o.type !== "sine")).toHaveLength(0);
    seq.setMood("drive", 1);
    seq.schedule(1 + 2 * BAR);
    const kicks = started(ctx, 1, 1 + 2 * BAR, isKick);
    expect(kicks.map((o) => +(o.at - 1).toFixed(6))).toEqual(
      Array.from({ length: 8 }, (_, i) => +(i * BEAT).toFixed(6))
    );
    expect(hats(ctx, 1, 1 + 2 * BAR)).toBe(8);
    expect(seq.mood).toBe("drive");
  });

  it("plays calm without drums, and lifts the finale (more hats, arpeggio an octave up)", () => {
    const calm = sequencer();
    calm.seq.setMood("calm", 0);
    calm.seq.schedule(2 * BAR);
    expect(started(calm.ctx, 0, 2 * BAR, isKick)).toHaveLength(0);
    expect(hats(calm.ctx, 0, 2 * BAR)).toBe(0);

    const finale = sequencer();
    finale.seq.setMood("finale", 0);
    finale.seq.schedule(BAR);
    expect(hats(finale.ctx, 0, BAR)).toBe(12);
    const top = (/** @type {any} */ ctx) =>
      Math.max(...started(ctx, 0, BAR, isPluck).map((o) => o.frequency.value));
    const drive = sequencer();
    drive.seq.setMood("drive", 0);
    drive.seq.schedule(BAR);
    expect(top(finale.ctx)).toBeGreaterThan(top(drive.ctx) * 1.9);
    expect(MUSIC_MOODS.finale.cutoff).toBeGreaterThan(MUSIC_MOODS.drive.cutoff);
  });

  it("applies mood changes on the grid at their time and stops while off", () => {
    const { ctx, seq } = sequencer();
    seq.setMood("drive", 0);
    seq.setMood("off", 2);
    seq.schedule(20);
    expect(started(ctx, 2, 20, (o) => o.type !== "sine" || isKick(o))).toHaveLength(0);
    expect(started(ctx, 0, 2, isKick).length).toBeGreaterThan(0);
    const level = /** @type {any} */ (seq)._level.gain.calls;
    expect(level).toContainEqual(["target", 0, 2]);
  });

  it("restarts the progression on its first chord when it starts again", () => {
    const { ctx, seq } = sequencer();
    seq.setMood("calm", 0);
    seq.setMood("off", 3 * BAR);
    seq.setMood("calm", 20);
    seq.schedule(20.5);
    const saws = started(ctx, 20, 20.5, (o) => o.type === "sawtooth");
    const notes = [
      ...new Set(saws.map((o) => Math.round(69 + 12 * Math.log2(o.frequency.value / 440)))),
    ];
    expect(notes.sort()).toEqual([57, 60, 64]);
  });

  it("never rewrites notes already scheduled when a later change arrives", () => {
    const { ctx, seq } = sequencer();
    seq.setMood("drive", 0);
    seq.schedule(BAR);
    const before = ctx.oscillators.length;
    seq.setMood("calm", BAR / 2);
    expect(ctx.oscillators.length).toBe(before);
    seq.schedule(3 * BAR);
    expect(started(ctx, BAR, 3 * BAR, isKick)).toHaveLength(0);
  });

  it("is identical for the same seed", () => {
    const run = () => {
      const { ctx, seq } = sequencer(42);
      seq.setMood("drive", 0);
      seq.schedule(4 * BAR);
      return ctx.oscillators.map((/** @type {any} */ o) => [o.type, o.at, o.frequency.value]);
    };
    expect(run()).toEqual(run());
  });

  it("ducks under the commander's voice and comes back after it", () => {
    const { seq } = sequencer();
    const gain = /** @type {any} */ (seq)._duckGain.gain;
    seq.duck(3, 6);
    const duck = gain.calls.filter((/** @type {any[]} */ c) => c[0] === "target");
    expect(duck[0][1]).toBe(CONFIG.AUDIO.MUSIC.DUCK);
    expect(duck[0][2]).toBeCloseTo(2.7);
    expect(duck[1].slice(1)).toEqual([1, 6.2]);
    seq.unduck(4);
    expect(gain.calls.at(-1)).toEqual(["target", 1, 4]);
  });
});

describe("AudioManager music", () => {
  /** @param {{ muted?: boolean }} [opts] */
  function setup(opts = {}) {
    /** @type {FakeContext[]} */
    const instances = [];
    class Ctx extends FakeContext {
      constructor() {
        super();
        instances.push(this);
      }
    }
    const store = { muted: !!opts.muted };
    const storage = /** @type {any} */ ({
      getJSON: () => store.muted,
      setJSON: () => true,
    });
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
      audio.setMusic("drive");
      expect(instances).toHaveLength(0);
      audio.unlock();
      const ctx = instances[0];
      audio.setMusic("drive");
      const first = ctx.oscillators.length;
      expect(started(ctx, 0, CONFIG.AUDIO.MUSIC.LOOKAHEAD_S, isKick)).toHaveLength(1);
      ctx.currentTime = 2;
      vi.advanceTimersByTime(CONFIG.AUDIO.MUSIC.TICK_MS);
      expect(ctx.oscillators.length).toBeGreaterThan(first);
      expect(started(ctx, 0, 2 + CONFIG.AUDIO.MUSIC.LOOKAHEAD_S, isKick).length).toBeGreaterThan(2);
      audio.setMusic("calm", { delay: 2.5 });
      expect(/** @type {any} */ (audio)._music._changes).toEqual([{ mood: "calm", at: 4.5 }]);
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
      audio.setMusic("drive");
      audio.scheduleMusic(4 * BAR);
      expect(timers).not.toHaveBeenCalled();
      expect(started(instances[0], 0, 4 * BAR, isKick)).toHaveLength(16);
    } finally {
      g.OfflineAudioContext = saved;
      timers.mockRestore();
    }
  });

  it("ducks the music while the commander speaks and restores it when speech stops", async () => {
    vi.useFakeTimers();
    try {
      const { audio, instances } = setup();
      audio.unlock();
      await Promise.resolve();
      instances[0].state = "running";
      audio.setMusic("calm");
      const music = /** @type {any} */ (audio)._music;
      const duck = vi.spyOn(music, "duck");
      const unduck = vi.spyOn(music, "unduck");
      const timing = await audio.playSpeech(btoa("mp3"), "altair");
      expect(timing).not.toBeNull();
      expect(duck).toHaveBeenCalledTimes(1);
      const [from, to] = duck.mock.calls[0];
      expect(to - from).toBeCloseTo(2);
      audio.stopSpeech();
      expect(unduck).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("finale music", () => {
  it("lifts the music once when the finale window begins", () => {
    const setMusic = vi.fn();
    const game = {
      timerRemaining: CONFIG.GAME.FINALE_BONUS_WINDOW_SECONDS + 1,
      audio: { setMusic },
    };
    updateFinaleMusic(game);
    expect(setMusic).not.toHaveBeenCalled();
    game.timerRemaining = CONFIG.GAME.FINALE_BONUS_WINDOW_SECONDS;
    updateFinaleMusic(game);
    game.timerRemaining -= 1;
    updateFinaleMusic(game);
    expect(setMusic.mock.calls).toEqual([["finale"]]);
    expect(() => updateFinaleMusic({ timerRemaining: 1 })).not.toThrow();
  });
});
