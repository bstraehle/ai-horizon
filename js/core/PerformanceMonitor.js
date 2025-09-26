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

    /** @type {number[]} */
    this._samples = [];
    this._level = 0;
    this._cooldown = 0;
  }

  /** Reset monitor state and optionally force level. */
  reset(level = 0) {
    this._level = Math.max(0, level | 0);
    this._samples.length = 0;
    this._cooldown = 0;
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
      this._samples.length = 0;
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

    this._samples.push(frameDtMs);
    if (this._samples.length > windowSize) this._samples.shift();
    if (this._samples.length < windowSize) return;

    if (this._cooldown > 0) {
      this._cooldown--;
      return;
    }

    const avg = this._samples.reduce((sum, val) => sum + val, 0) / this._samples.length;
    if (avg > config.thresholdMs) {
      this._level += 1;
      this._samples.length = 0;
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
