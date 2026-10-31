import { CONFIG } from "../constants.js";

/** @typedef {"calm"|"drive"|"finale"|"off"} MusicMood */

/**
 * Arrangement per mood: overall level (calm has no drums, so it is raised to sit about as loud
 * as the others), kick on every beat, hats (1 = off-beat eighths, 2 = plus sixteenths), arpeggio
 * rate in sixteenths and rest chance, arpeggio transposition and the pad's low-pass cutoff.
 * @type {Record<MusicMood, { level: number, kick: boolean, hats: number, arpEvery: number,
 *   arpRest: number, arpUp: number, cutoff: number }>}
 */
export const MUSIC_MOODS = {
  calm: { level: 1.6, kick: false, hats: 0, arpEvery: 2, arpRest: 0.3, arpUp: 12, cutoff: 800 },
  drive: { level: 1, kick: true, hats: 1, arpEvery: 1, arpRest: 0.2, arpUp: 12, cutoff: 1100 },
  finale: { level: 1, kick: true, hats: 2, arpEvery: 1, arpRest: 0.08, arpUp: 24, cutoff: 1700 },
  off: { level: 0, kick: false, hats: 0, arpEvery: 2, arpRest: 1, arpUp: 12, cutoff: 800 },
};

/** A minor, i-VI-III-VII (Am F C G): bass root and a voice-led pad triad (MIDI notes). */
const CHORDS = [
  { bass: 45, pad: [57, 60, 64] },
  { bass: 41, pad: [57, 60, 65] },
  { bass: 48, pad: [55, 60, 64] },
  { bass: 43, pad: [55, 59, 62] },
];

/** Sixteenth steps per bar and per chord (two bars). */
const STEPS_PER_BAR = 16;
const STEPS_PER_CHORD = 32;

/** @param {number} note MIDI note @returns {number} Hz */
const hz = (note) => 440 * 2 ** ((note - 69) / 12);

/**
 * Seeded PRNG (mulberry32), so the arrangement never touches the seeded game RNG and every render
 * of the same mood timeline is identical.
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
 * MusicSequencer – procedural background music (the same synth as the architecture video's bed):
 * A minor, Am-F-C-G, two bars per chord on a sixteenth-note grid. A warm detuned-saw pad through a
 * slowly breathing low-pass, a soft triangle bass on beats 1 and 3 and a plucked square arpeggio
 * with a dotted-eighth delay; "drive" adds a kick on every beat and off-beat hats, "finale" opens
 * the filter, doubles the hats and lifts the arpeggio an octave (see {@link MUSIC_MOODS}).
 *
 * Notes are created ahead of time by `schedule(until)`: the live game calls it from a timer with a
 * short lookahead (see AudioManager.setMusic), offline renders call it once for the whole timeline.
 * Mood changes (`setMood`) take effect on the grid at their context time with a short crossfade;
 * starting from "off" restarts the progression on its first chord. `duck` lowers the music under
 * the commander's voice. Everything feeds `out` (the master bus, so mute and the compressor apply).
 */
export class MusicSequencer {
  /**
   * @param {BaseAudioContext} ctx
   * @param {AudioNode} out Destination (the game's master bus).
   * @param {AudioNode|null} [verb] Reverb input for the pad and arpeggio sends.
   * @param {{ seed?: number, bpm?: number }} [opts]
   */
  constructor(ctx, out, verb = null, opts = {}) {
    const M = CONFIG.AUDIO.MUSIC;
    this._ctx = ctx;
    this._rnd = mulberry32(opts.seed ?? M.SEED);
    this._beat = 60 / (opts.bpm ?? M.BPM);
    this._step = this._beat / 4;
    /** @type {MusicMood} */
    this._mood = "off";
    /** Context time of grid step 0 and the next step to schedule. */
    this._origin = 0;
    this._n = 0;
    /** @type {{ at: number, mood: MusicMood }[]} Pending mood changes, oldest first. */
    this._changes = [];

    const t0 = ctx.currentTime;
    this._level = ctx.createGain();
    this._level.gain.value = 0;
    this._duckGain = ctx.createGain();
    this._level.connect(this._duckGain);
    this._duckGain.connect(out);

    this._verbSend = ctx.createGain();
    this._verbSend.gain.value = 0.4;
    if (verb) this._verbSend.connect(verb);

    this._delay = ctx.createDelay(2);
    this._delay.delayTime.value = this._beat * 0.75;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    this._delay.connect(feedback);
    feedback.connect(this._delay);
    const delayOut = ctx.createGain();
    delayOut.gain.value = 0.35;
    this._delay.connect(delayOut);
    delayOut.connect(this._level);
    delayOut.connect(this._verbSend);

    this._padFilter = ctx.createBiquadFilter();
    this._padFilter.type = "lowpass";
    this._padFilter.frequency.value = MUSIC_MOODS.calm.cutoff;
    this._padFilter.Q.value = 0.7;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 400;
    lfo.connect(lfoDepth);
    lfoDepth.connect(this._padFilter.frequency);
    lfo.start(t0);
    const padBus = ctx.createGain();
    padBus.gain.value = 0.5;
    this._padFilter.connect(padBus);
    padBus.connect(this._level);
    padBus.connect(this._verbSend);
    /** @type {GainNode|null} The sounding chord's envelope (released when the music stops). */
    this._padGain = null;

    const hatLen = Math.max(1, Math.floor(ctx.sampleRate * 0.06));
    this._hatNoise = ctx.createBuffer(1, hatLen, ctx.sampleRate);
    const noise = this._hatNoise.getChannelData(0);
    for (let i = 0; i < hatLen; i++) noise[i] = this._rnd() * 2 - 1;
  }

  /** The mood currently on the grid (pending changes not yet reached are not included). */
  get mood() {
    return this._mood;
  }

  /**
   * Switch to `mood` at context time `at`: the grid is first filled up to `at` with the current
   * mood, so later changes never rewrite notes already scheduled.
   * @param {MusicMood} mood
   * @param {number} at
   */
  setMood(mood, at) {
    this.schedule(at);
    this._changes.push({ mood, at });
    this._changes.sort((a, b) => a.at - b.at);
  }

  /**
   * Create the notes of every grid step before `until` (context time), applying mood changes as
   * the grid reaches them. While the music is off the grid waits for the next change.
   * @param {number} until
   */
  schedule(until) {
    for (;;) {
      const next = this._changes[0];
      if (this._mood === "off") {
        if (!next || next.at > until) return;
        this._apply(/** @type {{ at: number, mood: MusicMood }} */ (this._changes.shift()));
        continue;
      }
      const t = this._origin + this._n * this._step;
      if (next && next.at <= t && next.at <= until) {
        this._apply(/** @type {{ at: number, mood: MusicMood }} */ (this._changes.shift()));
        continue;
      }
      if (t >= until) return;
      this._play(this._n, t);
      this._n++;
    }
  }

  /**
   * Lower the music to `CONFIG.AUDIO.MUSIC.DUCK` from just before `from` until just after `to`.
   * @param {number} from
   * @param {number} to
   */
  duck(from, to) {
    const g = this._duckGain.gain;
    g.cancelScheduledValues(Math.min(from, this._ctx.currentTime));
    g.setTargetAtTime(CONFIG.AUDIO.MUSIC.DUCK, Math.max(0, from - 0.3), 0.1);
    g.setTargetAtTime(1, to + 0.2, 0.4);
  }

  /**
   * Bring the music back to full level from `at` (narration cancelled).
   * @param {number} at
   */
  unduck(at) {
    const g = this._duckGain.gain;
    g.cancelScheduledValues(at);
    g.setTargetAtTime(1, at, 0.2);
  }

  /**
   * @param {{ at: number, mood: MusicMood }} change
   * @private
   */
  _apply({ at, mood }) {
    const was = this._mood;
    const m = MUSIC_MOODS[mood];
    const level = this._level.gain;
    if (was === "off" && mood !== "off") {
      this._origin = at;
      this._n = 0;
      level.setValueAtTime(0, at);
    }
    const fade = mood === "off" ? 0.12 : CONFIG.AUDIO.MUSIC.FADE_S / 3;
    level.setTargetAtTime(m.level * CONFIG.AUDIO.MUSIC.VOLUME, at, fade);
    this._padFilter.frequency.setTargetAtTime(m.cutoff, at, 0.8);
    if (mood === "off" && this._padGain) {
      this._padGain.gain.setTargetAtTime(0, at, 0.15);
      this._padGain = null;
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
    const m = MUSIC_MOODS[this._mood];
    const inBar = n % STEPS_PER_BAR;
    const chord = CHORDS[Math.floor(n / STEPS_PER_CHORD) % CHORDS.length];
    if (n % STEPS_PER_CHORD === 0) this._pad(chord.pad, t, STEPS_PER_CHORD * this._step);
    if (inBar % 8 === 0) this._bass(chord.bass, t, m.kick);
    if (n % m.arpEvery === 0 && this._rnd() >= m.arpRest) {
      const arp = [...chord.pad, chord.pad[0] + 12, chord.pad[2], chord.pad[1]];
      this._pluck(arp[(n / m.arpEvery) % arp.length] + m.arpUp, t, m.kick);
    }
    if (m.kick && inBar % 4 === 0) this._kick(t);
    if (m.hats >= 1 && inBar % 4 === 2) this._hat(t, 0.06);
    if (m.hats >= 2 && inBar % 2 === 1) this._hat(t, 0.03);
  }

  /**
   * One chord: two detuned saws per note with a slow attack and release.
   * @param {number[]} notes
   * @param {number} t
   * @param {number} len
   * @private
   */
  _pad(notes, t, len) {
    const ctx = this._ctx;
    if (this._padGain) this._padGain.gain.setTargetAtTime(0, t, 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 1.2);
    g.gain.setValueAtTime(0.05, t + len - 0.2);
    g.gain.linearRampToValueAtTime(0, t + len + 1.2);
    g.connect(this._padFilter);
    this._padGain = g;
    for (const note of notes) {
      for (const cents of [-7, 7]) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = hz(note);
        osc.detune.value = cents;
        osc.connect(g);
        osc.start(t);
        osc.stop(t + len + 1.3);
      }
    }
  }

  /**
   * @param {number} note
   * @param {number} t
   * @param {boolean} drive Slightly louder under the kick.
   * @private
   */
  _bass(note, t, drive) {
    const ctx = this._ctx;
    const len = 2 * this._beat;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = hz(note);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(drive ? 0.32 : 0.24, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    osc.connect(filter);
    filter.connect(g);
    g.connect(this._level);
    osc.start(t);
    osc.stop(t + len + 0.05);
  }

  /**
   * Plucked square note into the level bus and the delay.
   * @param {number} note
   * @param {number} t
   * @param {boolean} drive Brighter and a touch louder.
   * @private
   */
  _pluck(note, t, drive) {
    const ctx = this._ctx;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = hz(note);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = drive ? 2400 : 1600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(drive ? 0.03 : 0.025, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 0.3);
    osc.connect(filter);
    filter.connect(g);
    g.connect(this._level);
    g.connect(this._delay);
    osc.start(t);
    osc.stop(t + 0.32);
  }

  /**
   * Soft kick: a sine dropping from 110 to 42 Hz.
   * @param {number} t
   * @private
   */
  _kick(t) {
    const ctx = this._ctx;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(g);
    g.connect(this._level);
    osc.start(t);
    osc.stop(t + 0.36);
  }

  /**
   * Short high-passed noise tick.
   * @param {number} t
   * @param {number} peak
   * @private
   */
  _hat(t, peak) {
    const ctx = this._ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._hatNoise;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(filter);
    filter.connect(g);
    g.connect(this._level);
    src.start(t);
  }
}
