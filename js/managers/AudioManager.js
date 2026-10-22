import { CONFIG } from "../constants.js";
import { LocalStorageAdapter } from "../adapters/LocalStorageAdapter.js";

/**
 * Quindar tone pitches of a debrief commander; Commander Vega's for unknown names.
 * @param {string} commander
 * @returns {{ introHz: number, outroHz: number }}
 */
function commanderTones(commander) {
  const { vega, altair } = CONFIG.AUDIO.COMMANDERS;
  return commander === "altair" ? altair : vega;
}

/** Scales the voice's RMS (speech peaks around 0.1-0.2) to the 0-1 range of speechLevel(). */
const SPEECH_METER_GAIN = 5;

/** Major-pentatonic steps (semitones above C6) climbed by consecutive star pickups. */
const STAR_SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

/**
 * @typedef {{ heavy?: boolean, pan?: number }} HitOptions
 *  heavy: bullet (caliber) upgrade active – deeper, more distorted impacts with an extra sub layer.
 *  pan:   stereo position in [-1, 1] (left..right), scaled by `CONFIG.AUDIO.MAX_PAN`.
 */

/**
 * AudioManager – procedurally synthesized sound effects (Web Audio API; no audio files, so no
 * downloads, CSP `media-src`, or service-worker changes are needed).
 *
 * Sounds (each is a stack of layers: transient, distorted body, filtered noise, sub, reverb send)
 *  - playAsteroidHit(opts): any bullet impact that is not a planet kill – regular asteroid
 *    destroyed or a non-lethal hit on a hardened/bonus planet – crack, distorted punch, debris.
 *  - playHardenedExplosion(isBonus, opts): planet destroyed – blast crack, distorted sub drop,
 *    long rumble and scattered debris pops; bonus planets add a second, deeper detonation.
 *  - playUpgrade(): one-shot when the bullet caliber upgrades – resonant power-up sweep followed
 *    by a two-click "racking" sound. From then on callers pass `heavy: true` for heavier impacts.
 *  - playStarCollect({ bonus, pan }): regular star – a short two-note "pling"; pickups within
 *    `CONFIG.AUDIO.STAR_STREAK_WINDOW_MS` of each other climb a pentatonic scale. Bonus star – a
 *    brighter four-note arpeggio chime with sparkle and more reverb.
 *  - playFatal(): the player's ship is hit – hull crack, distorted crunch, descending metal
 *    screech, huge sub drop, long rumble and debris. Bypasses the voice cap so it always plays.
 *
 * Narration (Game Over headline spoken by Amazon Polly, synthesized server-side)
 *  - playTransmission(commander): a radio channel opening (the commander's call chirp, squelch
 *    and crackle) while the debrief loads.
 *  - playSpeech(base64Mp3): decodes and plays the clip through the master bus (so mute applies)
 *    as a radio transmission (Quindar tones, squelch, band-limited voice, hiss), starting after
 *    the loud part of a fatal crash, and reports when the voice starts and how long it lasts
 *    (the headline types along with it); stopSpeech() cancels it (new run); speechLevel()
 *    reads the voice's loudness for the level meter.
 *
 * Lifecycle & policy
 *  - The AudioContext is created lazily by `unlock()`, which callers invoke from a user gesture
 *    (Launch Mission / sound toggle) to satisfy browser autoplay rules. Until then every play
 *    call is a silent no-op, as it is when muted, suspended, or Web Audio is unsupported.
 *  - `suspend()` / `resume()` follow tab visibility.
 *  - Mute state persists in localStorage (`CONFIG.AUDIO.STORAGE_KEY`); listeners registered via
 *    `onMuteChange` are notified so every toggle control stays in sync.
 *  - Per-sound minimum intervals and a voice cap keep rapid fire from clipping or piling up; a
 *    compressor on the master bus glues the layers together.
 *  - Variation uses the injected `random` (default Math.random), never the seeded game RNG, so
 *    seeded runs stay deterministic.
 */
export class AudioManager {
  /**
   * @param {{ AudioContextCtor?: (new () => AudioContext)|null, storage?: LocalStorageAdapter,
   *   random?: () => number }} [opts] Test seams; the constructor defaults to `window.AudioContext`.
   */
  constructor(opts = {}) {
    const g = /** @type {any} */ (typeof globalThis !== "undefined" ? globalThis : {});
    this._Ctor =
      opts.AudioContextCtor !== undefined
        ? opts.AudioContextCtor
        : g.AudioContext || g.webkitAudioContext || null;
    this._storage = opts.storage || new LocalStorageAdapter();
    this._random = opts.random || Math.random;
    this._muted =
      this._storage.getJSON(CONFIG.AUDIO.STORAGE_KEY, /** @type {boolean} */ (false)) === true;
    /** @type {AudioContext|null} */
    this._ctx = null;
    /** @type {GainNode|null} */
    this._master = null;
    /** @type {AudioNode|null} Reverb input (convolver); sends connect here. */
    this._verb = null;
    /** @type {AudioBuffer|null} */
    this._noise = null;
    /** @type {Map<number, Float32Array<ArrayBuffer>>} Distortion curves keyed by drive amount. */
    this._curves = new Map();
    /** @type {Record<string, number>} */
    this._last = Object.create(null);
    this._voices = 0;
    this._starStep = 0;
    /** @type {number|null} Context time of the last regular star pickup (streak tracking). */
    this._lastStarAt = null;
    /** Context time before which narration should not start (end of a crash's loud part). */
    this._fatalEndsAt = 0;
    /**
     * Current narration: the voice source, the gain all of its transmission nodes feed, and the
     * analyser (with its sample buffer) behind speechLevel().
     * @type {{ src: AudioBufferSourceNode, out: GainNode, analyser: AnalyserNode,
     *   samples: Float32Array<ArrayBuffer> }|null}
     */
    this._speech = null;
    /** Incremented to invalidate in-flight narration decodes. */
    this._speechToken = 0;
    /** @type {Set<(muted: boolean) => void>} */
    this._listeners = new Set();
  }

  /** Whether the Web Audio API is available. */
  get supported() {
    return !!this._Ctor;
  }

  /** Current mute state. */
  get muted() {
    return this._muted;
  }

  /**
   * Set and persist the mute state, then notify listeners.
   * @param {boolean} muted
   */
  setMuted(muted) {
    this._muted = !!muted;
    this._storage.setJSON(CONFIG.AUDIO.STORAGE_KEY, this._muted);
    if (this._master) this._master.gain.value = this._muted ? 0 : CONFIG.AUDIO.MASTER_VOLUME;
    for (const fn of this._listeners) fn(this._muted);
  }

  /** @returns {boolean} The new mute state. */
  toggleMuted() {
    this.setMuted(!this._muted);
    return this._muted;
  }

  /**
   * @param {(muted: boolean) => void} fn
   * @returns {() => void} Unsubscribe.
   */
  onMuteChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  /** Create (first call) and resume the AudioContext; call from a user gesture. */
  unlock() {
    if (!this._Ctor) return;
    try {
      if (!this._ctx) this._init();
    } catch {
      this._ctx = null;
      return;
    }
    this.resume();
  }

  /** Pause audio processing (tab hidden). */
  suspend() {
    if (this._ctx && this._ctx.state === "running") this._settle(() => this._ctx?.suspend());
  }

  /** Resume audio processing after `suspend()`. */
  resume() {
    if (this._ctx && this._ctx.state === "suspended") this._settle(() => this._ctx?.resume());
  }

  /**
   * Bullet impact: regular asteroid destroyed, or a non-lethal hit on a hardened planet.
   * @param {HitOptions} [opts]
   */
  playAsteroidHit(opts = {}) {
    const t = this._begin("hit", CONFIG.AUDIO.MIN_INTERVAL_MS.HIT);
    if (t === null) return;
    const heavy = !!opts.heavy;
    const v = 0.92 + this._random() * 0.16;
    const bus = this._bus(opts.pan, heavy ? 0.16 : 0.1);
    this._noiseBurst(t, 0.02, "highpass", 5000, 5000, 0.7, this._env(t, 0.45, 0.001, 0.02, bus));
    const bodyDecay = heavy ? 0.22 : 0.15;
    this._track(
      this._tone(
        "square",
        (heavy ? 120 : 180) * v,
        (heavy ? 32 : 48) * v,
        t,
        bodyDecay,
        this._shaper(heavy ? 14 : 7, this._env(t, 0.32, 0.002, bodyDecay, bus))
      )
    );
    const crunch = heavy ? 0.24 : 0.16;
    this._noiseBurst(
      t,
      crunch,
      "bandpass",
      2400 * v,
      380 * v,
      1.2,
      this._env(t, 0.42, 0.002, crunch, bus)
    );
    if (heavy) this._tone("sine", 72 * v, 30 * v, t, 0.26, this._env(t, 0.6, 0.003, 0.26, bus));
  }

  /**
   * Hardened planet destroyed.
   * @param {boolean} [isBonus=false] Bonus planets get a longer explosion with a second detonation.
   * @param {HitOptions} [opts] `heavy` is accepted for symmetry; explosions are already maximal.
   */
  playHardenedExplosion(isBonus = false, opts = {}) {
    const t = this._begin("boom", CONFIG.AUDIO.MIN_INTERVAL_MS.BOOM);
    if (t === null) return;
    const k = isBonus ? 1.4 : 1;
    const bus = this._bus(opts.pan, 0.45);
    this._detonation(t, k, 1, bus, true);
    if (isBonus) this._detonation(t + 0.18, 1.1, 0.75, bus, false);
    const pops = 6 + Math.floor(this._random() * 5);
    for (let i = 0; i < pops; i++) {
      const at = t + 0.05 + this._random() * 0.7 * k;
      const f = 1200 + this._random() * 2800;
      const decay = 0.04 + this._random() * 0.05;
      this._noiseBurst(
        at,
        decay,
        "bandpass",
        f,
        f * 0.6,
        2,
        this._env(at, 0.12 + this._random() * 0.13, 0.001, decay, bus)
      );
    }
  }

  /** One-shot cue when the bullet caliber upgrades: power-up sweep, then a racking "cha-chunk". */
  playUpgrade() {
    const t = this._begin("upgrade", CONFIG.AUDIO.MIN_INTERVAL_MS.UPGRADE);
    if (t === null) return;
    const ctx = /** @type {AudioContext} */ (this._ctx);
    const bus = this._bus(0, 0.35);
    const sweep = 0.5;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 12;
    filter.frequency.setValueAtTime(300, t);
    filter.frequency.exponentialRampToValueAtTime(6000, t + sweep);
    filter.connect(this._env(t, 0.28, 0.02, 0.75, bus));
    for (const detune of [-12, 12]) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.detune.value = detune;
      osc.frequency.setValueAtTime(110, t);
      osc.frequency.exponentialRampToValueAtTime(440, t + sweep);
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + 0.85);
      if (detune < 0) this._track(osc);
    }
    this._tone("sine", 55, 55, t, 0.6, this._env(t, 0.4, 0.01, 0.6, bus));
    for (const [offset, f] of [
      [0.52, 2600],
      [0.64, 1700],
    ]) {
      const at = t + offset;
      this._noiseBurst(at, 0.035, "bandpass", f, f, 3, this._env(at, 0.5, 0.001, 0.035, bus));
      this._tone(
        "square",
        f / 8,
        f / 16,
        at,
        0.04,
        this._shaper(6, this._env(at, 0.2, 0.001, 0.04, bus))
      );
    }
  }

  /**
   * Star pickup.
   * @param {{ bonus?: boolean, pan?: number }} [opts] `bonus` for red bonus stars.
   */
  playStarCollect(opts = {}) {
    if (opts.bonus) {
      this._playBonusStar(opts.pan);
      return;
    }
    const t = this._begin("star", CONFIG.AUDIO.MIN_INTERVAL_MS.STAR);
    if (t === null) return;
    const streak =
      this._lastStarAt !== null &&
      (t - this._lastStarAt) * 1000 <= CONFIG.AUDIO.STAR_STREAK_WINDOW_MS;
    this._starStep = streak ? Math.min(this._starStep + 1, STAR_SCALE.length - 2) : 0;
    this._lastStarAt = t;
    const bus = this._bus(opts.pan, 0.2);
    const notes = [STAR_SCALE[this._starStep], STAR_SCALE[this._starStep + 1]];
    notes.forEach((semis, i) => {
      const at = t + i * 0.045;
      const f = 1046.5 * 2 ** (semis / 12);
      const osc = this._tone("sine", f, f, at, 0.14, this._env(at, 0.16, 0.002, 0.14, bus));
      this._tone("triangle", f * 2, f * 2, at, 0.06, this._env(at, 0.04, 0.002, 0.06, bus));
      if (i === 0) this._track(osc);
    });
  }

  /**
   * Bonus (red) star: bright major arpeggio through a sweeping low-pass, plus high sparkle.
   * @param {number|undefined} pan
   * @private
   */
  _playBonusStar(pan) {
    const t = this._begin("bonusStar", CONFIG.AUDIO.MIN_INTERVAL_MS.BONUS_STAR);
    if (t === null) return;
    const ctx = /** @type {AudioContext} */ (this._ctx);
    const bus = this._bus(pan, 0.35);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 4;
    filter.frequency.setValueAtTime(1800, t);
    filter.frequency.exponentialRampToValueAtTime(7000, t + 0.25);
    filter.connect(bus);
    [0, 4, 7, 12].forEach((semis, i) => {
      const at = t + i * 0.055;
      const f = 784 * 2 ** (semis / 12);
      const osc = this._tone("sawtooth", f, f, at, 0.32, this._env(at, 0.09, 0.003, 0.32, filter));
      this._tone("sine", f, f, at, 0.36, this._env(at, 0.12, 0.003, 0.36, bus));
      if (i === 0) this._track(osc);
    });
    this._noiseBurst(t, 0.3, "highpass", 6000, 9000, 0.7, this._env(t, 0.08, 0.01, 0.3, bus));
  }

  /** The player's ship is destroyed. */
  playFatal() {
    const t = this._begin("fatal", CONFIG.AUDIO.MIN_INTERVAL_MS.FATAL, true);
    if (t === null) return;
    this._fatalEndsAt = t + CONFIG.AUDIO.SPEECH_AFTER_FATAL_S;
    const ctx = /** @type {AudioContext} */ (this._ctx);
    const bus = this._bus(0, 0.6);
    this._noiseBurst(t, 0.08, "highpass", 1200, 1200, 0.7, this._env(t, 0.8, 0.001, 0.08, bus));
    this._track(
      this._tone("sine", 140, 20, t, 1.6, this._shaper(4, this._env(t, 1.0, 0.004, 1.8, bus)))
    );
    this._tone("sawtooth", 220, 30, t, 0.6, this._shaper(18, this._env(t, 0.45, 0.002, 0.6, bus)));
    const screech = ctx.createBiquadFilter();
    screech.type = "bandpass";
    screech.Q.value = 6;
    screech.frequency.setValueAtTime(1400, t);
    screech.frequency.exponentialRampToValueAtTime(300, t + 0.9);
    screech.connect(this._env(t + 0.03, 0.15, 0.02, 0.9, bus));
    for (const f of [900, 937]) this._tone("sawtooth", f, 120, t + 0.03, 0.9, screech);
    this._noiseBurst(t, 2.2, "lowpass", 4000, 60, 0.7, this._env(t, 0.9, 0.005, 2.4, bus));
    const pops = 10 + Math.floor(this._random() * 5);
    for (let i = 0; i < pops; i++) {
      const at = t + 0.05 + this._random() * 1.2;
      const f = 900 + this._random() * 3200;
      const decay = 0.04 + this._random() * 0.07;
      this._noiseBurst(
        at,
        decay,
        "bandpass",
        f,
        f * 0.6,
        2,
        this._env(at, 0.1 + this._random() * 0.15, 0.001, decay, bus)
      );
    }
  }

  /**
   * A radio channel opening while the debrief is on its way: the calling commander's call chirp
   * (two short rising blips in their pitch, unlike the steady beeps framing the voice), squelch,
   * then a few crackles of static. Starts after the loud part of a fatal crash, like the narration.
   * @param {string} [commander] "vega" or "altair" (see CONFIG.AUDIO.COMMANDERS).
   */
  playTransmission(commander = "vega") {
    const now = this._begin("transmission", CONFIG.AUDIO.MIN_INTERVAL_MS.TRANSMISSION, true);
    if (now === null) return;
    const t = Math.max(now, this._fatalEndsAt);
    const bus = this._bus(0, 0.05);
    const { CHIRP_S, CHIRP_GAP_S, CHIRP_RISE } = CONFIG.AUDIO.RADIO;
    const f = commanderTones(commander).introHz;
    this._radioTone(f, t, bus, CHIRP_S);
    this._radioTone(f * CHIRP_RISE, t + CHIRP_S + CHIRP_GAP_S, bus, CHIRP_S);
    const open = t + 2 * CHIRP_S + CHIRP_GAP_S;
    this._squelch(open, bus);
    const crackles = 5 + Math.floor(this._random() * 4);
    for (let i = 0; i < crackles; i++) {
      const at = open + CONFIG.AUDIO.RADIO.SQUELCH_S + this._random() * 0.6;
      const f = 1800 + this._random() * 3500;
      const decay = 0.015 + this._random() * 0.03;
      this._noiseBurst(at, decay, "bandpass", f, f, 1.5, this._env(at, 0.12, 0.001, decay, bus));
    }
  }

  /**
   * Decode and play a narration clip (base64 MP3) through the master bus as a radio
   * transmission from command (see {@link CONFIG.AUDIO.RADIO}): intro Quindar tone and squelch,
   * the voice band-limited and lightly saturated over a faint hiss, then outro tone and squelch.
   * The tones are pitched per commander. Skipped when muted, locked, suspended, or superseded by
   * stopSpeech() while decoding.
   * @param {string} base64
   * @param {string} [commander] "vega" or "altair" (see CONFIG.AUDIO.COMMANDERS).
   * @returns {Promise<{ delay: number, duration: number }|null>} When playback is scheduled:
   *   seconds from now until the voice starts, and the voice's length; otherwise null.
   */
  async playSpeech(base64, commander = "vega") {
    const ctx = this._ctx;
    if (this._muted || !ctx || typeof base64 !== "string" || !base64) return null;
    this.stopSpeech();
    const token = this._speechToken;
    try {
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const buffer = await ctx.decodeAudioData(bytes.buffer);
      if (token !== this._speechToken || this._muted || ctx.state !== "running") return null;
      const R = CONFIG.AUDIO.RADIO;
      const at = Math.max(ctx.currentTime + 0.05, this._fatalEndsAt);
      const voiceAt = at + R.TONE_S + R.SQUELCH_S;
      const voiceEnd = voiceAt + (Number.isFinite(buffer.duration) ? buffer.duration : 0);
      const out = ctx.createGain();
      out.connect(/** @type {GainNode} */ (this._master));
      const tones = commanderTones(commander);
      this._radioTone(tones.introHz, at, out);
      this._squelch(at + R.TONE_S, out);
      const hiss = ctx.createGain();
      hiss.gain.value = R.HISS_GAIN;
      hiss.connect(out);
      this._noiseBurst(voiceAt, voiceEnd - voiceAt, "bandpass", 2500, 2500, 0.7, hiss);
      this._radioTone(tones.outroHz, voiceEnd + 0.05, out);
      this._squelch(voiceEnd + 0.05 + R.TONE_S, out);
      const gain = ctx.createGain();
      gain.gain.value = CONFIG.AUDIO.SPEECH_GAIN;
      gain.connect(out);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(this._radioBand(gain));
      // Taps the clean voice for speechLevel() (a level meter); feeds nothing audible.
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      src.start(voiceAt);
      this._speech = { src, out, analyser, samples: new Float32Array(analyser.fftSize) };
      return { delay: Math.max(0, voiceAt - ctx.currentTime), duration: voiceEnd - voiceAt };
    } catch {
      return null;
    }
  }

  /**
   * How loud the narration voice is right now, from 0 (silent, or no narration) to 1, for a
   * level meter next to the speaking commander's name.
   * @returns {number}
   */
  speechLevel() {
    const speech = this._speech;
    if (!speech) return 0;
    speech.analyser.getFloatTimeDomainData(speech.samples);
    let sum = 0;
    for (const v of speech.samples) sum += v * v;
    return Math.min(1, Math.sqrt(sum / speech.samples.length) * SPEECH_METER_GAIN);
  }

  /** Stop current narration (voice and transmission sounds) and cancel any clip still decoding. */
  stopSpeech() {
    this._speechToken++;
    const speech = this._speech;
    this._speech = null;
    if (!speech) return;
    try {
      speech.src.stop();
    } catch {
      /* already stopped */
    }
    try {
      speech.out.disconnect();
    } catch {
      /* already disconnected */
    }
  }

  /**
   * Voice band of a comms channel: high-pass + low-pass, then gentle saturation into `out`.
   * @param {AudioNode} out
   * @returns {BiquadFilterNode} Input of the chain.
   * @private
   */
  _radioBand(out) {
    const ctx = /** @type {AudioContext} */ (this._ctx);
    const R = CONFIG.AUDIO.RADIO;
    const high = ctx.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = R.LOW_HZ;
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = R.HIGH_HZ;
    high.connect(low);
    low.connect(this._shaper(R.DRIVE, out));
    return high;
  }

  /**
   * Steady sine beep (Quindar tone) with click-free edges, `CONFIG.AUDIO.RADIO.TONE_S` long
   * unless `duration` is given.
   * @param {number} f
   * @param {number} t
   * @param {AudioNode} out
   * @param {number} [duration]
   * @private
   */
  _radioTone(f, t, out, duration = CONFIG.AUDIO.RADIO.TONE_S) {
    const ctx = /** @type {AudioContext} */ (this._ctx);
    const { TONE_GAIN } = CONFIG.AUDIO.RADIO;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(TONE_GAIN, t + 0.01);
    g.gain.setValueAtTime(TONE_GAIN, t + duration - 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    g.connect(out);
    this._tone("sine", f, f, t, duration, g);
  }

  /**
   * Short burst of band-passed static, as when a radio channel opens or closes.
   * @param {number} t
   * @param {AudioNode} out
   * @private
   */
  _squelch(t, out) {
    const { SQUELCH_S, SQUELCH_GAIN } = CONFIG.AUDIO.RADIO;
    this._noiseBurst(
      t,
      SQUELCH_S,
      "bandpass",
      3000,
      1200,
      0.8,
      this._env(t, SQUELCH_GAIN, 0.003, SQUELCH_S, out)
    );
  }

  /**
   * One explosion layer stack: blast crack, distorted sub drop, mid punch and long rumble.
   * @param {number} t
   * @param {number} k Length multiplier.
   * @param {number} p Pitch multiplier.
   * @param {AudioNode} bus
   * @param {boolean} track Count this detonation as a voice.
   * @private
   */
  _detonation(t, k, p, bus, track) {
    this._noiseBurst(t, 0.06, "highpass", 1500, 1500, 0.7, this._env(t, 0.7, 0.001, 0.06, bus));
    this._tone(
      "sine",
      95 * p,
      24 * p,
      t,
      0.9 * k,
      this._shaper(3, this._env(t, 1.0, 0.004, 1.0 * k, bus))
    );
    this._tone(
      "square",
      160 * p,
      40 * p,
      t,
      0.3 * k,
      this._shaper(10, this._env(t, 0.35, 0.002, 0.3 * k, bus))
    );
    const rumble = this._noiseBurst(
      t,
      1.4 * k,
      "lowpass",
      3000 * p,
      90 * p,
      0.7,
      this._env(t, 0.85, 0.005, 1.5 * k, bus)
    );
    if (track) this._track(rumble);
  }

  /** @private */
  _init() {
    const Ctor = /** @type {new () => AudioContext} */ (this._Ctor);
    const ctx = new Ctor();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    const master = ctx.createGain();
    master.gain.value = this._muted ? 0 : CONFIG.AUDIO.MASTER_VOLUME;
    master.connect(comp);
    comp.connect(ctx.destination);

    const len = Math.max(1, Math.floor(ctx.sampleRate));
    const noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = this._random() * 2 - 1;

    const irLen = Math.max(1, Math.floor(ctx.sampleRate * CONFIG.AUDIO.REVERB_SECONDS));
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < irLen; i++) d[i] = (this._random() * 2 - 1) * (1 - i / irLen) ** 3;
    }
    const verb = ctx.createConvolver();
    verb.buffer = ir;
    verb.connect(master);

    this._ctx = ctx;
    this._master = master;
    this._verb = verb;
    this._noise = noise;
  }

  /**
   * Swallow sync throws and async rejections from suspend/resume.
   * @param {() => Promise<void>|undefined} fn
   * @private
   */
  _settle(fn) {
    try {
      Promise.resolve(fn()).catch(() => {});
    } catch {
      /* ignore */
    }
  }

  /**
   * Gate a sound: returns the start time, or null when muted, locked, suspended, throttled, or at
   * the voice cap (unless `ignoreVoiceCap`).
   * @param {string} key
   * @param {number} minIntervalMs
   * @param {boolean} [ignoreVoiceCap=false]
   * @returns {number|null}
   * @private
   */
  _begin(key, minIntervalMs, ignoreVoiceCap = false) {
    const ctx = this._ctx;
    if (this._muted || !ctx || ctx.state !== "running") return null;
    if (!ignoreVoiceCap && this._voices >= CONFIG.AUDIO.MAX_VOICES) return null;
    const now = ctx.currentTime;
    const last = this._last[key];
    if (last !== undefined && (now - last) * 1000 < minIntervalMs) return null;
    this._last[key] = now;
    return now;
  }

  /**
   * Count a sound as an active voice until `node` ends.
   * @param {AudioScheduledSourceNode} node
   * @private
   */
  _track(node) {
    this._voices++;
    node.onended = () => {
      this._voices = Math.max(0, this._voices - 1);
    };
  }

  /**
   * Per-sound output bus: stereo panner (when supported) into the master, plus a reverb send.
   * @param {number|undefined} pan [-1, 1]
   * @param {number} verbAmount Reverb send level.
   * @returns {GainNode}
   * @private
   */
  _bus(pan, verbAmount) {
    const ctx = /** @type {AudioContext} */ (this._ctx);
    const master = /** @type {GainNode} */ (this._master);
    const bus = ctx.createGain();
    const p = Number.isFinite(pan) ? Math.max(-1, Math.min(1, /** @type {number} */ (pan))) : 0;
    if (p !== 0 && typeof ctx.createStereoPanner === "function") {
      const panner = ctx.createStereoPanner();
      panner.pan.value = p * CONFIG.AUDIO.MAX_PAN;
      bus.connect(panner);
      panner.connect(master);
    } else {
      bus.connect(master);
    }
    if (this._verb && verbAmount > 0) {
      const send = ctx.createGain();
      send.gain.value = verbAmount;
      bus.connect(send);
      send.connect(this._verb);
    }
    return bus;
  }

  /**
   * Gain envelope: exponential attack to `peak`, then decay to silence, routed to `out`.
   * @param {number} t
   * @param {number} peak
   * @param {number} attack
   * @param {number} decay
   * @param {AudioNode} out
   * @returns {GainNode}
   * @private
   */
  _env(t, peak, attack, decay, out) {
    const ctx = /** @type {AudioContext} */ (this._ctx);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(out);
    return g;
  }

  /**
   * Soft-clipping distortion stage feeding `out`; curves are cached per drive amount.
   * @param {number} drive Higher = grittier.
   * @param {AudioNode} out
   * @returns {WaveShaperNode}
   * @private
   */
  _shaper(drive, out) {
    const ctx = /** @type {AudioContext} */ (this._ctx);
    let curve = this._curves.get(drive);
    if (!curve) {
      const n = 1024;
      curve = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i * 2) / (n - 1) - 1;
        curve[i] = Math.tanh(drive * x) / Math.tanh(drive);
      }
      this._curves.set(drive, curve);
    }
    const shaper = ctx.createWaveShaper();
    shaper.curve = curve;
    shaper.oversample = "2x";
    shaper.connect(out);
    return shaper;
  }

  /**
   * Oscillator gliding exponentially from f0 to f1 over `dur` seconds.
   * @param {OscillatorType} type
   * @param {number} f0
   * @param {number} f1
   * @param {number} t
   * @param {number} dur
   * @param {AudioNode} out
   * @returns {OscillatorNode}
   * @private
   */
  _tone(type, f0, f1, t, dur, out) {
    const ctx = /** @type {AudioContext} */ (this._ctx);
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    osc.connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    return osc;
  }

  /**
   * Filtered white-noise burst with an exponential cutoff sweep from f0 to f1.
   * @param {number} t
   * @param {number} dur
   * @param {BiquadFilterType} filterType
   * @param {number} f0
   * @param {number} f1
   * @param {number} q
   * @param {AudioNode} out
   * @returns {AudioBufferSourceNode}
   * @private
   */
  _noiseBurst(t, dur, filterType, f0, f1, q, out) {
    const ctx = /** @type {AudioContext} */ (this._ctx);
    const src = ctx.createBufferSource();
    src.buffer = this._noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(f1, t + dur);
    src.connect(filter);
    filter.connect(out);
    src.start(t, this._random() * 0.5);
    src.stop(t + dur + 0.05);
    return src;
  }
}
