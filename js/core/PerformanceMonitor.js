import { CONFIG } from "../constants.js";

/**
 * @typedef {{ thresholdMs:number, sampleWindow?:number, cooldownFrames?:number }} PerfLevelConfig
 */

/**
 * PerformanceMonitor – samples frame times and emits level changes when sustained slowdowns occur.
 *
 * Example:
 *   const monitor = new PerformanceMonitor({ onLevelChange: (level) => console.info(level) });
 *   monitor.sample(frameDtMs, { active: isRunning });
 */
export class PerformanceMonitor {
  /**
   * @param {{
   *   levels?: PerfLevelConfig[],
   *   sampleWindow?: number,
   *   cooldownFrames?: number,
   *   onLevelChange?: (level:number, meta:{averageFrameMs:number, thresholdMs:number, windowSize:number})=>void,
   * }} [opts]
   */
  constructor(opts = {}) {
    const perf = CONFIG.PERFORMANCE || {};
    /** @type {PerfLevelConfig[]} */
    const configLevels =
      Array.isArray(opts.levels) && opts.levels.length > 0 ? opts.levels : perf.LEVELS || [];
    this._levels = configLevels.map((lvl) => ({ ...lvl }));
    this._sampleWindow = opts.sampleWindow || perf.SAMPLE_WINDOW || 90;
    this._defaultCooldown = opts.cooldownFrames || perf.COOLDOWN_FRAMES || 180;
    this._onLevelChange = typeof opts.onLevelChange === "function" ? opts.onLevelChange : () => {};

    // Ring buffer state (allocated lazily when window size known) replaces dynamic array.
    /** @private @type {Float32Array|null} */ this._buf = null; // sample storage
    /** @private */ this._w = 0; // write index
    /** @private */ this._count = 0; // number of valid samples (<= window size)
    /** @private */ this._sum = 0; // running sum of samples
    this._level = 0;
    this._cooldown = 0;
  }

  /** Reset monitor state and optionally force level. */
  reset(level = 0) {
    this._level = Math.max(0, level | 0);
    this._cooldown = 0;
    // Fast reset of ring buffer statistics (retain allocated array for reuse).
    this._w = 0;
    this._count = 0;
    this._sum = 0;
  }

  /** Current performance level (0 = default). */
  get level() {
    return this._level;
  }

  /**
   * Add a frame sample.
   * @param {number} frameDtMs Frame duration in milliseconds.
   * @param {{ active?: boolean }} [opts]
   */
  sample(frameDtMs, opts = {}) {
    if (!Number.isFinite(frameDtMs) || frameDtMs <= 0) return;
    const active = opts.active !== false;
    if (!active) {
      // Inactive sampling: clear accumulated stats without deallocating buffer.
      this._w = 0;
      this._count = 0;
      this._sum = 0;
      return;
    }

    const targetIndex = this._level;
    if (!Array.isArray(this._levels) || targetIndex >= this._levels.length) {
      return;
    }

    const config = this._levels[targetIndex];
    const windowSize = config.sampleWindow || this._sampleWindow;
    const cooldownFrames =
      typeof config.cooldownFrames === "number" ? config.cooldownFrames : this._defaultCooldown;
    // Lazy allocate or reallocate buffer if window size changed (rare path).
    if (!this._buf || this._buf.length !== windowSize) {
      this._buf = new Float32Array(windowSize);
      this._w = 0;
      this._count = 0;
      this._sum = 0;
    }
    const buf = this._buf;
    // Remove value being overwritten from running sum (only when buffer already full).
    const overwritten = this._count === buf.length ? buf[this._w] : 0;
    if (this._count < buf.length) this._count++;
    this._sum -= overwritten;
    buf[this._w] = frameDtMs;
    this._sum += frameDtMs;
    this._w = (this._w + 1) % buf.length;
    if (this._count < buf.length) return; // not enough samples yet

    if (this._cooldown > 0) {
      this._cooldown--;
      return;
    }

    const avg = this._sum / this._count;
    if (avg > config.thresholdMs) {
      this._level += 1;
      // Reset buffer stats but keep allocation for reuse.
      this._w = 0;
      this._count = 0;
      this._sum = 0;
      this._cooldown = cooldownFrames;
      try {
        this._onLevelChange(this._level, {
          averageFrameMs: avg,
          thresholdMs: config.thresholdMs,
          windowSize,
        });
      } catch (_e) {
        /* swallow listener errors */
      }
    }
  }
}
