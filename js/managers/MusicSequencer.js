import { CONFIG } from "../constants.js";

/** @typedef {"mission"|"finale"|"end"|"off"} MusicMood */
/** @typedef {"red"|"blue"} MusicStyle The mission's nebula palette, which picks the score. */
/** @typedef {{ mood: MusicMood, at: number, style?: MusicStyle, length?: number }} MoodChange */

/**
 * The two scores, one per nebula palette (missions alternate red and blue):
 *  - red, "Abyss": a D drone, a heartbeat pulse, distant reverb pings and a dark Dm-Bb-Gm-A pad;
 *    the finale races the heartbeat, adds toms and opens the drone and pad filters.
 *  - blue, "Event Horizon": a ticking clock, distorted low "braam" swells, a choir-like Dm-Bb-F-C
 *    pad and a sub pulse; the finale races the clock and swells every bar.
 * Both finales open with a hit, add a pulsing bass ostinato (eighths, then sixteenths, its filter
 * opening) and a noise-and-saw riser, and swell by CONFIG.AUDIO.MUSIC.FINALE_GAIN over the
 * remaining seconds into an impact when the mission is survived. `level` evens out their loudness.
 */
export const MUSIC_STYLES = {
  red: { name: "Abyss", bpm: 70, level: 0.45 },
  blue: { name: "Event Horizon", bpm: 60, level: 0.7 },
};

const ABYSS_CHORDS = [
  [50, 53, 57],
  [46, 50, 53],
  [43, 46, 50],
  [45, 49, 52],
];
const HORIZON_CHORDS = [
  [50, 57, 62, 65],
  [46, 53, 58, 62],
  [41, 53, 57, 60],
  [48, 55, 60, 64],
];
/** D minor pentatonic, two octaves up: Abyss's distant pings. */
const SHIMMER = [74, 77, 79, 81, 84, 86, 89];
/** Seconds the closing impact rings before the music stops. */
const IMPACT_S = 3;

/** @param {number} note MIDI note @returns {number} Hz */
const hz = (note) => 440 * 2 ** ((note - 69) / 12);

/**
 * Seeded PRNG (mulberry32), so the music never touches the seeded game RNG and every render of the
 * same mood timeline is identical.
 * @param {number} seed
 * @returns {() => number} Uniform in [0, 1).
 */
function mulberry32(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Stop a parameter's automation at `at`, keeping its current value where the browser can.
 * @param {AudioParam} param
 * @param {number} at
 */
function holdAt(param, at) {
  const p = /** @type {any} */ (param);
  if (typeof p.cancelAndHoldAtTime === "function") p.cancelAndHoldAtTime(at);
  else param.cancelScheduledValues(at);
}

/**
 * MusicSequencer – the game's procedural score (see {@link MUSIC_STYLES}), on a sixteenth-note
 * grid at the style's tempo.
 *
 * Moods: "mission" while flying, "finale" for the last seconds (its `length` paces the build),
 * "end" (the mission was survived: the closing impact rings out, then the music stops) and "off"
 * (cut on a crash). The play is over at both, so the music stays silent through the game-over
 * screens and the commander's radio debrief. A change of style (or starting from off) restarts the
 * score on its first chord.
 *
 * Notes are created ahead of time by `schedule(until)`: the live game calls it from a timer with a
 * short lookahead (see AudioManager.setMusic), offline renders once for the whole timeline. Mood
 * changes take effect at their context time. Everything feeds `out` (the master bus, so mute and
 * the compressor apply).
 */
export class MusicSequencer {
  /**
   * @param {BaseAudioContext} ctx
   * @param {AudioNode} out Destination (the game's master bus).
   * @param {AudioNode|null} [verb] Reverb input for the sends.
   * @param {{ seed?: number }} [opts]
   */
  constructor(ctx, out, verb = null, opts = {}) {
    this._ctx = ctx;
    this._rnd = mulberry32(opts.seed ?? CONFIG.AUDIO.MUSIC.SEED);
    /** @type {MusicMood} */
    this._mood = "off";
    /** @type {MusicStyle} */
    this._style = "red";
    this._step = 60 / MUSIC_STYLES.red.bpm / 4;
    /** Context time of grid step 0, and the next step to schedule. */
    this._origin = 0;
    this._n = 0;
    /** @type {MoodChange[]} Pending mood changes, oldest first. */
    this._changes = [];
    /** @type {{ start: number, length: number, gains: GainNode[] }|null} The finale in progress. */
    this._finale = null;
    /** @type {{ gain: GainNode, end: number }[]} Sustained envelopes, released when the score stops. */
    this._held = [];

    this._level = ctx.createGain();
    this._level.gain.value = 0;
    this._level.connect(out);
    this._verb = verb;

    const len = Math.max(1, Math.floor(ctx.sampleRate * 2));
    this._noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const noise = this._noise.getChannelData(0);
    for (let i = 0; i < len; i++) noise[i] = this._rnd() * 2 - 1;

    const red = {
      drone: this._filter("lowpass", 160, 1.2, this._bus(1, 0)),
      pad: this._filter("lowpass", 500, 0.8, this._bus(1, 0.8)),
      shimmer: this._bus(0.6, 2.5),
      toms: this._bus(1, 0.5),
    };
    const choir = this._bus(1, 1);
    const pad = this._bus(1, 0);
    pad.disconnect();
    pad.connect(this._filter("bandpass", 750, 6, choir));
    pad.connect(this._filter("bandpass", 1150, 8, choir));
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh(3 * ((i * 2) / 1023 - 1));
    shaper.curve = curve;
    shaper.connect(this._bus(0.5, 0.6));
    const blue = { pad, braam: shaper, tick: this._filter("bandpass", 2500, 4, this._bus(1, 0.3)) };
    this._buses = { red, blue };
    /** The finale's bass ostinato, behind a low-pass that opens as the finale builds. */
    this._pulse = this._filter("lowpass", 300, 6, this._bus(1, 0.2));
  }

  /** The mood currently on the grid (pending changes not yet reached are not included). */
  get mood() {
    return this._mood;
  }

  /** The score currently playing. */
  get style() {
    return this._style;
  }

  /**
   * Switch to `mood` at context time `at`, with the mission's `style` (default: the current one)
   * and, for the finale, its `length` in seconds. The grid is first filled up to `at`, so later
   * changes never rewrite notes already scheduled.
   * @param {MusicMood} mood
   * @param {number} at
   * @param {{ style?: MusicStyle, length?: number }} [opts]
   */
  setMood(mood, at, opts = {}) {
    this.schedule(at);
    this._queue({ mood, at, ...opts });
  }

  /**
   * Create the notes of every grid step before `until` (context time), applying mood changes as
   * the grid reaches them. While the music is off the grid waits for the next change.
   * @param {number} until
   */
  schedule(until) {
    for (;;) {
      const next = this._changes[0];
      const t = this._origin + this._n * this._step;
      if (next && next.at <= until && (this._mood === "off" || next.at <= t)) {
        this._apply(/** @type {MoodChange} */ (this._changes.shift()));
        continue;
      }
      if (this._mood === "off" || t >= until) return;
      this._play(this._n, t);
      this._n++;
    }
  }

  /**
   * @param {MoodChange} change
   * @private
   */
  _queue(change) {
    this._changes.push(change);
    this._changes.sort((a, b) => a.at - b.at);
  }

  /**
   * @param {MoodChange} change
   * @private
   */
  _apply(change) {
    const { mood, at } = change;
    const style = change.style || this._style;
    const was = this._mood;
    const level = this._level.gain;
    if (was === "finale" && mood !== "finale") this._endFinale(at);
    if (mood === "off" || mood === "end") {
      if (was === "off") return;
      // The play is over: a crash cuts the music, a survived mission ends on the impact.
      holdAt(level, at);
      if (mood === "end") this._impact(at);
      level.setTargetAtTime(
        0,
        mood === "end" ? at + IMPACT_S - 1 : at,
        mood === "end" ? 0.3 : 0.08
      );
      this._release(at);
      this._mood = "off";
      return;
    }
    if (was === "off" || style !== this._style) {
      if (was !== "off") this._release(at);
      this._style = style;
      this._step = 60 / MUSIC_STYLES[style].bpm / 4;
      this._origin = at;
      this._n = 0;
      if (was === "off") level.setValueAtTime(0, at);
    }
    const target = CONFIG.AUDIO.MUSIC.VOLUME * MUSIC_STYLES[style].level;
    if (mood === "finale") {
      const length = Math.max(1, change.length ?? 15);
      holdAt(level, at);
      level.setValueAtTime(target, at);
      level.linearRampToValueAtTime(target * CONFIG.AUDIO.MUSIC.FINALE_GAIN, at + length);
      this._startFinale(at, length);
    } else {
      level.setTargetAtTime(target, at, CONFIG.AUDIO.MUSIC.FADE_S / 3);
    }
    this._mood = mood;
  }

  /**
   * Notes of grid step `n` at time `t`.
   * @param {number} n
   * @param {number} t
   * @private
   */
  _play(n, t) {
    const f = this._finale;
    const k = f ? Math.min(1, Math.max(0, (t - f.start) / f.length)) : 0;
    const blue = this._style === "blue";
    if (blue) this._horizon(n, t, this._mood, k);
    else this._abyss(n, t, this._mood, k);
    if (this._mood === "finale" && n % (k < 0.5 ? 2 : 1) === 0) {
      // Bass ostinato on the chord's root: eighths, then sixteenths for the second half.
      const chords = blue ? HORIZON_CHORDS : ABYSS_CHORDS;
      const root = chords[Math.floor(n / (blue ? 16 : 32)) % 4][0] - 12;
      const accent = n % 4 === 0;
      this._pluck(
        "sawtooth",
        hz(accent ? root : root + 12 * (n % 8 === 6 ? 1 : 0)),
        t,
        accent ? 0.2 : 0.13,
        this._step * 1.8,
        this._pulse
      );
    }
  }

  /**
   * Abyss (red): pad and drone per chord, heartbeat, shimmer, finale toms.
   * @param {number} n
   * @param {number} t
   * @param {MusicMood} mood
   * @param {number} k Finale progress, 0..1.
   * @private
   */
  _abyss(n, t, mood, k) {
    const bus = this._buses.red;
    const step = this._step;
    const fin = mood === "finale";
    if (n % 32 === 0) {
      const len = 32 * step;
      this._chord(ABYSS_CHORDS[(n / 32) % 4], t, len, bus.pad, { attack: n === 0 ? 2 : 1.5 });
      const drone = this._env(bus.drone, t, len, n === 0 ? 3 : 0.6, 0.8);
      for (const [note, type, v] of /** @type {[number, OscillatorType, number][]} */ ([
        [26, "sine", 0.5],
        [38, "sawtooth", 0.25],
        [39, "sawtooth", 0.06],
      ])) {
        this._osc(type, hz(note), t, len + 0.9, v, drone);
      }
    }
    if ((mood === "mission" && n % 16 === 0 && n >= 16) || (fin && n % (k < 2 / 3 ? 4 : 2) === 0)) {
      this._thump(62, 34, t, fin ? 0.75 : 0.6, 0.32, this._level);
      if (!fin || k < 2 / 3) this._thump(55, 32, t + 0.28, fin ? 0.5 : 0.4, 0.28, this._level);
    }
    if (mood === "mission" && this._rnd() < 0.08) {
      const note = SHIMMER[Math.floor(this._rnd() * SHIMMER.length)];
      this._pluck("sine", hz(note), t, 0.05, 2.5, bus.shimmer);
    }
    if (fin && n % (k < 0.5 ? 4 : 2) === 0) {
      this._thump(130, 60, t, 0.35 + 0.35 * k, 0.35, bus.toms);
      this._noiseHit(t, "bandpass", 900, 1, 0.08 + 0.1 * k, 0.12, bus.toms);
    }
  }

  /**
   * Event Horizon (blue): choir pad per bar, braams, ticking clock, sub pulse.
   * @param {number} n
   * @param {number} t
   * @param {MusicMood} mood
   * @param {number} k Finale progress, 0..1.
   * @private
   */
  _horizon(n, t, mood, k) {
    const bus = this._buses.blue;
    const step = this._step;
    const fin = mood === "finale";
    if (n % 16 === 0) {
      this._chord(HORIZON_CHORDS[(n / 16) % 4], t, 16 * step, bus.pad, {
        peak: 0.09,
        detune: 12,
      });
    }
    if ((mood === "mission" && n % 32 === 0 && n >= 32) || (fin && n % 16 === 0)) {
      this._braam(t, 3.5, bus.braam);
    }
    const ticks = mood === "mission" ? (n >= 16 && n % 2 === 0 ? 1 : 0) : fin ? tickCount(n, k) : 0;
    for (let i = 0; i < ticks; i++) {
      this._pluck("square", 2000, t + (i * step) / ticks, 0.04 + 0.05 * k, 0.03, bus.tick);
    }
    if (n % 4 === 0 && n >= 32) this._thump(50, 32, t, fin ? 0.5 : 0.35, 0.5, this._level);
  }

  /**
   * Finale: an entry hit, the ostinato's (and Abyss's) filters opening and the riser building
   * over `length` seconds.
   * @param {number} at
   * @param {number} length
   * @private
   */
  _startFinale(at, length) {
    const end = at + length;
    this._thump(80, 30, at, 0.8, 1.6, this._level);
    this._noiseHit(at, "lowpass", 600, 0.7, 0.45, 1.2, this._bus(1, 0.8));
    holdAt(this._pulse.frequency, at);
    this._pulse.frequency.setValueAtTime(300, at);
    this._pulse.frequency.exponentialRampToValueAtTime(2500, end);
    if (this._style === "red") {
      const { drone, pad } = this._buses.red;
      for (const [filter, from, to] of /** @type {[BiquadFilterNode, number, number][]} */ ([
        [drone, 160, 1400],
        [pad, 500, 3500],
      ])) {
        holdAt(filter.frequency, at);
        filter.frequency.setValueAtTime(from, at);
        filter.frequency.exponentialRampToValueAtTime(to, end);
      }
    }
    const peak = this._style === "red" ? 0.22 : 0.28;
    const ctx = this._ctx;
    const noise = ctx.createBufferSource();
    noise.buffer = this._noise;
    noise.loop = true;
    const band = this._filter("bandpass", 200, 2, this._bus(1, 0.4));
    band.frequency.setValueAtTime(200, at);
    band.frequency.exponentialRampToValueAtTime(7000, end);
    const noiseGain = this._env(band, at, length, length, 0, peak, true);
    noise.connect(noiseGain);
    noise.start(at);
    noise.stop(end + 0.1);
    const saw = ctx.createOscillator();
    saw.type = "sawtooth";
    saw.frequency.setValueAtTime(hz(50), at);
    saw.frequency.exponentialRampToValueAtTime(hz(86), end);
    const sawGain = this._env(
      this._filter("lowpass", 3000, 0.7, this._level),
      at,
      length,
      length,
      0,
      0.05,
      true
    );
    saw.connect(sawGain);
    saw.start(at);
    saw.stop(end + 0.1);
    this._finale = { start: at, length, gains: [noiseGain, sawGain] };
  }

  /**
   * Cut the riser and close the filters (crash, or the impact taking over).
   * @param {number} at
   * @private
   */
  _endFinale(at) {
    if (!this._finale) return;
    for (const g of this._finale.gains) {
      holdAt(g.gain, at);
      g.gain.setTargetAtTime(0, at, 0.03);
    }
    const { drone, pad } = this._buses.red;
    for (const [filter, base] of /** @type {[BiquadFilterNode, number][]} */ ([
      [drone, 160],
      [pad, 500],
      [this._pulse, 300],
    ])) {
      holdAt(filter.frequency, at);
      filter.frequency.setTargetAtTime(base, at, 0.5);
    }
    this._finale = null;
  }

  /**
   * The game-over impact: sub boom, low rumble and a long crash wash.
   * @param {number} at
   * @private
   */
  _impact(at) {
    this._thump(70, 28, at, 0.9, 2.5, this._level);
    this._noiseHit(at, "lowpass", 400, 0.7, 0.8, 2.5, this._level);
    this._noiseHit(at, "highpass", 3000, 0.7, 0.25, 3.5, this._bus(1, 1.2));
  }

  /**
   * Fade every sustained envelope from `at`.
   * @param {number} at
   * @private
   */
  _release(at) {
    for (const { gain } of this._held) {
      holdAt(gain.gain, at);
      gain.gain.setTargetAtTime(0, at, 0.3);
    }
    this._held = [];
  }

  /**
   * A gain into the level bus with an optional reverb send.
   * @param {number} value
   * @param {number} send
   * @returns {GainNode}
   * @private
   */
  _bus(value, send) {
    const g = this._ctx.createGain();
    g.gain.value = value;
    g.connect(this._level);
    if (this._verb && send > 0) {
      const s = this._ctx.createGain();
      s.gain.value = send;
      g.connect(s);
      s.connect(this._verb);
    }
    return g;
  }

  /**
   * @param {BiquadFilterType} type
   * @param {number} freq
   * @param {number} q
   * @param {AudioNode} out
   * @returns {BiquadFilterNode}
   * @private
   */
  _filter(type, freq, q, out) {
    const f = this._ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    f.connect(out);
    return f;
  }

  /**
   * Envelope gain into `out`: linear attack to `peak`, hold until `t + len`, then release (or, for
   * a riser, an exponential swell over `attack` that cuts at its end).
   * @param {AudioNode} out
   * @param {number} t
   * @param {number} len
   * @param {number} attack
   * @param {number} release
   * @param {number} [peak]
   * @param {boolean} [swell]
   * @returns {GainNode}
   * @private
   */
  _env(out, t, len, attack, release, peak = 1, swell = false) {
    const g = this._ctx.createGain();
    if (swell) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + attack - 0.05);
      g.gain.linearRampToValueAtTime(0, t + attack);
    } else {
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + attack);
      g.gain.setValueAtTime(peak, t + len);
      g.gain.linearRampToValueAtTime(0, t + len + release);
      this._held = this._held.filter((h) => h.end > t);
      this._held.push({ gain: g, end: t + len + release });
    }
    g.connect(out);
    return g;
  }

  /**
   * @param {OscillatorType} type
   * @param {number} freq
   * @param {number} t
   * @param {number} dur
   * @param {number} gain
   * @param {AudioNode} out
   * @param {number} [detune]
   * @private
   */
  _osc(type, freq, t, dur, gain, out, detune = 0) {
    const o = this._ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const g = this._ctx.createGain();
    g.gain.value = gain;
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + dur);
  }

  /**
   * Detuned-saw chord with a slow swell, held for `len` seconds.
   * @param {number[]} notes
   * @param {number} t
   * @param {number} len
   * @param {AudioNode} out
   * @param {{ peak?: number, attack?: number, detune?: number }} [opts]
   * @private
   */
  _chord(notes, t, len, out, { peak = 0.035, attack = 1.5, detune = 8 } = {}) {
    const env = this._env(out, t, len, attack, 1.5, peak);
    for (const note of notes) {
      for (const cents of [-detune, detune])
        this._osc("sawtooth", hz(note), t, len + 1.6, 1, env, cents);
    }
  }

  /**
   * Pitched thump (heartbeat, tom, sub pulse, boom): a sine gliding down with a fast decay.
   * @param {number} f0
   * @param {number} f1
   * @param {number} t
   * @param {number} peak
   * @param {number} decay
   * @param {AudioNode} out
   * @private
   */
  _thump(f0, f1, t, peak, decay, out) {
    const o = this._ctx.createOscillator();
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + decay);
    const g = this._ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + decay + 0.05);
  }

  /**
   * Short pluck (shimmer ping, clock tick).
   * @param {OscillatorType} type
   * @param {number} freq
   * @param {number} t
   * @param {number} peak
   * @param {number} decay
   * @param {AudioNode} out
   * @private
   */
  _pluck(type, freq, t, peak, decay, out) {
    const o = this._ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this._ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + decay + 0.05);
  }

  /**
   * Filtered noise burst.
   * @param {number} t
   * @param {BiquadFilterType} type
   * @param {number} freq
   * @param {number} q
   * @param {number} peak
   * @param {number} decay
   * @param {AudioNode} out
   * @private
   */
  _noiseHit(t, type, freq, q, peak, decay, out) {
    const src = this._ctx.createBufferSource();
    src.buffer = this._noise;
    const g = this._ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(this._filter(type, freq, q, g));
    g.connect(out);
    src.start(t, this._rnd());
    src.stop(t + decay + 0.05);
  }

  /**
   * Low brass swell: four distorted saws behind a low-pass that opens and closes.
   * @param {number} t
   * @param {number} len
   * @param {AudioNode} out
   * @private
   */
  _braam(t, len, out) {
    const lp = this._filter("lowpass", 120, 3, out);
    lp.frequency.setValueAtTime(120, t);
    lp.frequency.exponentialRampToValueAtTime(1300, t + 0.6);
    lp.frequency.exponentialRampToValueAtTime(180, t + len);
    const env = this._ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.12, t + 0.25);
    env.gain.setValueAtTime(0.12, t + len - 1);
    env.gain.exponentialRampToValueAtTime(0.0001, t + len);
    env.connect(lp);
    for (const note of [26, 38, 45, 50]) {
      this._osc("sawtooth", hz(note), t, len + 0.05, 1, env, (this._rnd() - 0.5) * 20);
    }
  }
}

/**
 * Clock ticks in a finale grid step: eighths, then sixteenths, then thirty-seconds as it builds.
 * @param {number} n
 * @param {number} k Finale progress, 0..1.
 * @returns {number}
 */
function tickCount(n, k) {
  if (k < 1 / 3) return n % 2 === 0 ? 1 : 0;
  return k < 2 / 3 ? 1 : 2;
}
