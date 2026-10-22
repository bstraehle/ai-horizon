// @ts-check
import { describe, it, expect, vi } from "vitest";
import { AudioManager } from "../js/managers/AudioManager.js";
import { CONFIG } from "../js/constants.js";

function makeParam(value = 0) {
  return {
    value,
    /** @type {number[]} */
    set: [],
    /** @param {number} v */
    setValueAtTime(v) {
      this.set.push(v);
    },
    exponentialRampToValueAtTime() {},
  };
}

/** Scheduled-source stand-in that, like the real API, throws if stop() is called twice. */
function makeSource(extra = {}) {
  let stopped = false;
  return {
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(() => {
      if (stopped) throw new Error("InvalidStateError: stop() called twice");
      stopped = true;
    }),
    onended: /** @type {null|(() => void)} */ (null),
    ...extra,
  };
}

/** Fake AudioContext that records created nodes; `instances` collects every context created. */
function makeFakeContext({ stereo = true } = {}) {
  /** @type {any[]} */
  const instances = [];
  class FakeAudioContext {
    constructor() {
      this.state = "suspended";
      this.currentTime = 0;
      this.sampleRate = 100;
      this.destination = {};
      /** @type {any[]} */ this.oscillators = [];
      /** @type {any[]} */ this.sources = [];
      /** @type {any[]} */ this.gains = [];
      /** @type {any[]} */ this.panners = [];
      /** @type {any[]} */ this.shapers = [];
      /** @type {any[]} */ this.convolvers = [];
      this.resume = vi.fn(() => {
        this.state = "running";
        return Promise.resolve();
      });
      this.suspend = vi.fn(() => {
        this.state = "suspended";
        return Promise.resolve();
      });
      this.decodeAudioData = vi.fn(async (/** @type {ArrayBuffer} */ buf) => ({
        decodedFrom: new Uint8Array(buf),
      }));
      if (stereo) {
        /** @type {any} */ (this).createStereoPanner = () => {
          const p = { connect: vi.fn(), pan: makeParam() };
          this.panners.push(p);
          return p;
        };
      }
      instances.push(this);
    }
    createGain() {
      const g = { connect: vi.fn(), disconnect: vi.fn(), gain: makeParam(1) };
      this.gains.push(g);
      return g;
    }
    createDynamicsCompressor() {
      return {
        connect: vi.fn(),
        threshold: makeParam(),
        knee: makeParam(),
        ratio: makeParam(),
        attack: makeParam(),
        release: makeParam(),
      };
    }
    createOscillator() {
      const o = makeSource({ type: "sine", frequency: makeParam(), detune: makeParam() });
      this.oscillators.push(o);
      return o;
    }
    createBufferSource() {
      const s = makeSource({ buffer: null, loop: false });
      this.sources.push(s);
      return s;
    }
    createBiquadFilter() {
      return { connect: vi.fn(), type: "lowpass", Q: makeParam(), frequency: makeParam() };
    }
    createWaveShaper() {
      const w = { connect: vi.fn(), curve: null, oversample: "none" };
      this.shapers.push(w);
      return w;
    }
    createConvolver() {
      const c = { connect: vi.fn(), buffer: null };
      this.convolvers.push(c);
      return c;
    }
    /** Analyser whose samples all equal `voiceSample` (a steady voice of that amplitude). */
    createAnalyser() {
      return {
        connect: vi.fn(),
        fftSize: 2048,
        getFloatTimeDomainData: (/** @type {Float32Array} */ out) => out.fill(this.voiceSample),
      };
    }
    voiceSample = 0;
    /** @param {number} channels @param {number} len */
    createBuffer(channels, len) {
      const data = Array.from({ length: channels }, () => new Float32Array(len));
      return { numberOfChannels: channels, getChannelData: (/** @type {number} */ c) => data[c] };
    }
  }
  return { FakeAudioContext, instances };
}

function makeStorage(initial = /** @type {Record<string, any>} */ ({})) {
  const data = { ...initial };
  return /** @type {any} */ ({
    data,
    /** @param {string} k @param {any} fb */
    getJSON: (k, fb) => (k in data ? data[k] : (fb ?? null)),
    /** @param {string} k @param {any} v */
    setJSON: (k, v) => {
      data[k] = v;
      return true;
    },
  });
}

/** @param {{ muted?: boolean, stereo?: boolean }} [opts] */
function setup(opts = {}) {
  const { FakeAudioContext, instances } = makeFakeContext({ stereo: opts.stereo !== false });
  const storage = makeStorage(opts.muted ? { [CONFIG.AUDIO.STORAGE_KEY]: true } : {});
  const audio = new AudioManager({
    AudioContextCtor: /** @type {any} */ (FakeAudioContext),
    storage,
    random: () => 0.5,
  });
  return { audio, instances, storage };
}

/** Unlocked manager plus its context. */
function unlocked(opts = {}) {
  const s = setup(opts);
  s.audio.unlock();
  return { ...s, ctx: s.instances[0] };
}

/** Count nodes created by `fn`. @param {any} ctx @param {() => void} fn */
function created(ctx, fn) {
  const before = { osc: ctx.oscillators.length, src: ctx.sources.length, sh: ctx.shapers.length };
  fn();
  return {
    osc: ctx.oscillators.length - before.osc,
    src: ctx.sources.length - before.src,
    shapers: ctx.shapers.length - before.sh,
    oscillators: ctx.oscillators.slice(before.osc),
  };
}

describe("AudioManager", () => {
  it("stays silent until unlocked, then creates one context with a reverb bus", () => {
    const { audio, instances } = setup();
    audio.playAsteroidHit();
    expect(instances).toHaveLength(0);
    audio.unlock();
    audio.unlock();
    expect(instances).toHaveLength(1);
    const ctx = instances[0];
    expect(ctx.state).toBe("running");
    expect(ctx.convolvers).toHaveLength(1);
    expect(ctx.convolvers[0].buffer.numberOfChannels).toBe(2);
    expect(created(ctx, () => audio.playAsteroidHit()).osc).toBeGreaterThan(0);
  });

  it("is a no-op without Web Audio support", () => {
    const audio = new AudioManager({ AudioContextCtor: null, storage: makeStorage() });
    expect(audio.supported).toBe(false);
    expect(() => {
      audio.unlock();
      audio.playHardenedExplosion(true);
      audio.playUpgrade();
      audio.suspend();
      audio.resume();
    }).not.toThrow();
  });

  it("restores and persists mute state, silencing the master bus and notifying listeners", () => {
    const { audio, ctx, storage } = unlocked({ muted: true });
    expect(audio.muted).toBe(true);
    const master = ctx.gains[0];
    expect(master.gain.value).toBe(0);
    expect(created(ctx, () => audio.playAsteroidHit()).osc).toBe(0);

    const listener = vi.fn();
    audio.onMuteChange(listener);
    expect(audio.toggleMuted()).toBe(false);
    expect(listener).toHaveBeenCalledWith(false);
    expect(storage.data[CONFIG.AUDIO.STORAGE_KEY]).toBe(false);
    expect(master.gain.value).toBe(CONFIG.AUDIO.MASTER_VOLUME);
    expect(created(ctx, () => audio.playAsteroidHit()).osc).toBeGreaterThan(0);
  });

  it("does not play while suspended and resumes afterwards", () => {
    const { audio, ctx } = unlocked();
    audio.suspend();
    expect(ctx.suspend).toHaveBeenCalled();
    expect(created(ctx, () => audio.playAsteroidHit()).osc).toBe(0);
    audio.resume();
    expect(created(ctx, () => audio.playAsteroidHit()).osc).toBeGreaterThan(0);
  });

  it("throttles rapid repeats of the same sound but not different sounds", () => {
    const { audio, ctx } = unlocked();
    audio.playAsteroidHit();
    expect(created(ctx, () => audio.playAsteroidHit()).osc).toBe(0);
    expect(created(ctx, () => audio.playStarCollect()).osc).toBeGreaterThan(0);
    ctx.currentTime = CONFIG.AUDIO.MIN_INTERVAL_MS.HIT / 1000 + 0.001;
    expect(created(ctx, () => audio.playAsteroidHit()).osc).toBeGreaterThan(0);
  });

  it("caps concurrent voices and frees them when sounds end", () => {
    const { audio, ctx } = unlocked();
    let played = 0;
    /** @type {any[]} */
    const firstOscs = [];
    for (let i = 0; i < CONFIG.AUDIO.MAX_VOICES + 3; i++) {
      ctx.currentTime += 1;
      const c = created(ctx, () => audio.playAsteroidHit());
      if (c.osc > 0) {
        played++;
        firstOscs.push(c.oscillators[0]);
      }
    }
    expect(played).toBe(CONFIG.AUDIO.MAX_VOICES);
    firstOscs[0].onended();
    ctx.currentTime += 1;
    expect(created(ctx, () => audio.playAsteroidHit()).osc).toBeGreaterThan(0);
  });

  it("makes heavy (upgraded caliber) hits deeper, grittier and layered with a sub", () => {
    const { audio, ctx } = unlocked();
    const normal = created(ctx, () => audio.playAsteroidHit());
    ctx.currentTime += 1;
    const heavy = created(ctx, () => audio.playAsteroidHit({ heavy: true }));
    expect(heavy.osc).toBe(normal.osc + 1);
    expect(heavy.oscillators[0].frequency.set[0]).toBeLessThan(
      normal.oscillators[0].frequency.set[0]
    );
    const drive = (/** @type {any} */ s) => s.curve[s.curve.length - 4];
    const [nShaper, hShaper] = ctx.shapers.slice(-2);
    expect(drive(hShaper)).toBeGreaterThan(drive(nShaper));
  });

  it("gives bonus explosions a second detonation", () => {
    const { audio, ctx } = unlocked();
    const regular = created(ctx, () => audio.playHardenedExplosion(false));
    ctx.currentTime += 1;
    const bonus = created(ctx, () => audio.playHardenedExplosion(true));
    expect(bonus.osc).toBe(regular.osc * 2);
  });

  it("pans by position (clamped) and falls back to centre without StereoPanner", () => {
    const { audio, ctx } = unlocked();
    audio.playAsteroidHit({ pan: -5 });
    expect(ctx.panners.at(-1).pan.value).toBeCloseTo(-CONFIG.AUDIO.MAX_PAN);
    ctx.currentTime += 1;
    const before = ctx.panners.length;
    audio.playAsteroidHit({ pan: 0 });
    expect(ctx.panners.length).toBe(before);

    const mono = unlocked({ stereo: false });
    expect(() => mono.audio.playAsteroidHit({ pan: 0.8 })).not.toThrow();
    expect(mono.ctx.oscillators.length).toBeGreaterThan(0);
  });

  it("climbs the pentatonic scale on quick star streaks and resets after a pause", () => {
    const { audio, ctx } = unlocked();
    const firstNote = () => created(ctx, () => audio.playStarCollect()).oscillators[0];
    const f1 = firstNote().frequency.set[0];
    ctx.currentTime += 0.2;
    const f2 = firstNote().frequency.set[0];
    ctx.currentTime += 0.2;
    const f3 = firstNote().frequency.set[0];
    expect(f2).toBeGreaterThan(f1);
    expect(f3).toBeGreaterThan(f2);
    ctx.currentTime += CONFIG.AUDIO.STAR_STREAK_WINDOW_MS / 1000 + 0.1;
    expect(firstNote().frequency.set[0]).toBeCloseTo(f1);
    for (let i = 0; i < 30; i++) {
      ctx.currentTime += 0.1;
      expect(() => audio.playStarCollect({ pan: 0.3 })).not.toThrow();
    }
  });

  it("gives bonus stars a separate, richer chime that does not reset the streak", () => {
    const { audio, ctx } = unlocked();
    const regular = created(ctx, () => audio.playStarCollect());
    const bonus = created(ctx, () => audio.playStarCollect({ bonus: true }));
    expect(bonus.osc).toBeGreaterThan(regular.osc);
    expect(bonus.oscillators.filter((o) => o.type === "sawtooth")).toHaveLength(4);
    ctx.currentTime += 0.2;
    const next = created(ctx, () => audio.playStarCollect()).oscillators[0];
    expect(next.frequency.set[0]).toBeGreaterThan(regular.oscillators[0].frequency.set[0]);
  });

  it("plays the fatal crash even at the voice cap, once per throttle window", () => {
    const { audio, ctx } = unlocked();
    for (let i = 0; i < CONFIG.AUDIO.MAX_VOICES; i++) {
      ctx.currentTime += 1;
      audio.playAsteroidHit();
    }
    ctx.currentTime += 1;
    expect(created(ctx, () => audio.playAsteroidHit()).osc).toBe(0);
    const fatal = created(ctx, () => audio.playFatal());
    expect(fatal.osc).toBeGreaterThan(0);
    expect(fatal.shapers).toBeGreaterThan(0);
    expect(created(ctx, () => audio.playFatal()).osc).toBe(0);
  });

  it("opens the radio channel after the crash's loud part, once per throttle window", () => {
    const { audio, ctx } = unlocked();
    ctx.currentTime = 10;
    audio.playFatal();
    const fatalEnd = 10 + CONFIG.AUDIO.SPEECH_AFTER_FATAL_S;
    const first = created(ctx, () => audio.playTransmission("altair"));
    expect(first.src).toBeGreaterThan(1);
    // The caller's call chirp (two short rising blips in their pitch), then squelch and crackle.
    const { CHIRP_S, CHIRP_GAP_S, CHIRP_RISE } = CONFIG.AUDIO.RADIO;
    const f = CONFIG.AUDIO.COMMANDERS.altair.introHz;
    const chirp = ctx.oscillators.slice(-2);
    expect(chirp.map((/** @type {any} */ o) => o.frequency.set[0])).toEqual([f, f * CHIRP_RISE]);
    expect(chirp[0].start.mock.calls[0][0]).toBeCloseTo(fatalEnd);
    expect(chirp[1].start.mock.calls[0][0]).toBeCloseTo(fatalEnd + CHIRP_S + CHIRP_GAP_S);
    const starts = ctx.sources
      .slice(-first.src)
      .map((/** @type {any} */ s) => s.start.mock.calls[0][0]);
    expect(Math.min(...starts)).toBeCloseTo(fatalEnd + 2 * CHIRP_S + CHIRP_GAP_S);
    expect(created(ctx, () => audio.playTransmission()).src).toBe(0);
    const muted = unlocked({ muted: true });
    expect(created(muted.ctx, () => muted.audio.playTransmission()).src).toBe(0);
  });

  it("plays narration as a radio transmission after the crash's loud part", async () => {
    const { audio, ctx } = unlocked();
    ctx.currentTime = 10;
    audio.playFatal();
    const before = ctx.oscillators.length;
    const clip = Buffer.from([7, 8, 9]).toString("base64");
    const R = CONFIG.AUDIO.RADIO;
    const fatalEnd = 10 + CONFIG.AUDIO.SPEECH_AFTER_FATAL_S;
    const timing = /** @type {any} */ (await audio.playSpeech(clip));
    expect(timing.delay).toBeCloseTo(fatalEnd + R.TONE_S + R.SQUELCH_S - 10);
    expect(timing.duration).toBeGreaterThanOrEqual(0);
    const voice = ctx.sources.find((/** @type {any} */ s) => s.buffer && s.buffer.decodedFrom);
    expect(voice.buffer.decodedFrom).toEqual(new Uint8Array([7, 8, 9]));
    expect(voice.start.mock.calls[0][0]).toBeCloseTo(fatalEnd + R.TONE_S + R.SQUELCH_S);
    const tones = ctx.oscillators.slice(before);
    const { vega, altair } = CONFIG.AUDIO.COMMANDERS;
    expect(tones.map((/** @type {any} */ o) => o.frequency.set[0])).toEqual([
      vega.introHz,
      vega.outroHz,
    ]);
    expect(tones[0].start.mock.calls[0][0]).toBeCloseTo(fatalEnd);

    // Captain Altair's transmissions are framed by his own, lower tones.
    const next = ctx.oscillators.length;
    await audio.playSpeech(clip, "altair");
    expect(ctx.oscillators.slice(next).map((/** @type {any} */ o) => o.frequency.set[0])).toEqual([
      altair.introHz,
      altair.outroHz,
    ]);
  });

  it("reads the narration voice's loudness for the level meter", async () => {
    const { audio, ctx } = unlocked();
    expect(audio.speechLevel()).toBe(0);
    await audio.playSpeech(Buffer.from([1]).toString("base64"));
    ctx.voiceSample = 0.1;
    expect(audio.speechLevel()).toBeCloseTo(0.5);
    ctx.voiceSample = 0.9;
    expect(audio.speechLevel()).toBe(1);
    audio.stopSpeech();
    expect(audio.speechLevel()).toBe(0);
  });

  it("skips narration when muted, locked, or invalid, and stopSpeech cancels it", async () => {
    const clip = Buffer.from([1]).toString("base64");
    const locked = setup();
    await expect(locked.audio.playSpeech(clip)).resolves.toBeNull();

    const muted = unlocked({ muted: true });
    await expect(muted.audio.playSpeech(clip)).resolves.toBeNull();
    expect(muted.ctx.decodeAudioData).not.toHaveBeenCalled();

    const { audio, ctx } = unlocked();
    await expect(audio.playSpeech("")).resolves.toBeNull();
    const pending = audio.playSpeech(clip);
    audio.stopSpeech();
    await expect(pending).resolves.toBeNull();

    const gainsBefore = ctx.gains.length;
    await audio.playSpeech(clip);
    const playing = ctx.sources.find((/** @type {any} */ s) => s.buffer && s.buffer.decodedFrom);
    const out = ctx.gains[gainsBefore];
    audio.stopSpeech();
    expect(playing.stop).toHaveBeenCalledTimes(1);
    // Disconnecting the transmission bus also silences the scheduled tones, squelch and hiss.
    expect(out.disconnect).toHaveBeenCalledTimes(1);
    expect(() => audio.stopSpeech()).not.toThrow();
  });

  it("plays the upgrade cue once per throttle window without double-stopping nodes", () => {
    const { audio, ctx } = unlocked();
    const first = created(ctx, () => audio.playUpgrade());
    expect(first.oscillators.filter((o) => o.type === "sawtooth")).toHaveLength(2);
    expect(first.oscillators.every((o) => o.stop.mock.calls.length === 1)).toBe(true);
    ctx.currentTime += 0.5;
    expect(created(ctx, () => audio.playUpgrade()).osc).toBe(0);
    ctx.currentTime += 1;
    expect(created(ctx, () => audio.playUpgrade()).osc).toBe(first.osc);
  });
});
