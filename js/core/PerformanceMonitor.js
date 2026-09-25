import { CONFIG } from "../constants.js";

/**
 * @typedef {{ thresholdMs:number, sampleWindow?:number, cooldownFrames?:number }} PerfLevelConfig
 */

/**
 * PerformanceMonitor – samples frame timings and emits level changes when sustained slowdowns occur.
 *
 * Two signals are averaged over a rolling window:
 *  - frame delta (RAF spacing): detects frames actually being dropped, including GPU-bound cases
 *    where main-thread work stays small. Escalates when the average exceeds the level's `thresholdMs`.
 *  - main-thread work (update + draw CPU ms, optional): detects headroom running out before frames
 *    drop, and is independent of display refresh rate. Escalates when the average exceeds
 *    `workBudgetMs * workEscalateFactor`.
 * Escalation triggers on either signal; recovery requires both to be comfortably healthy
 * (frame average below `thresholdMs * recoveryThresholdFactor` of the previous level and work below
 * `workBudgetMs * workRecoverFactor`), with cooldowns to prevent oscillation.
 *
 * Example:
 *   const monitor = new PerformanceMonitor({ onLevelChange: (level) => console.info(level) });
 *   monitor.sample(frameDtMs, { active: isRunning, workMs: updateMs + drawMs });
 */
export class PerformanceMonitor {
  /**
   * @param {{
   *   levels?: PerfLevelConfig[],
   *   sampleWindow?: number,
   *   cooldownFrames?: number,
   *   recoveryThresholdFactor?: number,
   *   recoveryCooldownFrames?: number,
   *   workBudgetMs?: number,
   *   workEscalateFactor?: number,
   *   workRecoverFactor?: number,
   *   onLevelChange?: (level:number, meta:{averageFrameMs:number, thresholdMs:number, windowSize:number, workMs?:number})=>void,
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
    const configuredRecoveryFactor =
      typeof opts.recoveryThresholdFactor === "number"
        ? opts.recoveryThresholdFactor
        : perf.RECOVERY_THRESHOLD_FACTOR;
    this._recoveryThresholdFactor = Number.isFinite(configuredRecoveryFactor)
      ? Math.max(0.5, Math.min(0.99, configuredRecoveryFactor))
      : 0.85;
    const configuredRecoveryCooldown =
      typeof opts.recoveryCooldownFrames === "number"
        ? opts.recoveryCooldownFrames
        : perf.RECOVERY_COOLDOWN_FRAMES;
    this._recoveryCooldownFrames = Number.isFinite(configuredRecoveryCooldown)
      ? Math.max(0, Math.round(configuredRecoveryCooldown))
      : this._defaultCooldown;
    const budget = typeof opts.workBudgetMs === "number" ? opts.workBudgetMs : perf.WORK_BUDGET_MS;
    this._workBudgetMs = Number.isFinite(budget) && budget > 0 ? budget : CONFIG.TIME.STEP_MS;
    const escalate =
      typeof opts.workEscalateFactor === "number"
        ? opts.workEscalateFactor
        : perf.WORK_ESCALATE_FACTOR;
    this._workEscalateFactor = Number.isFinite(escalate) && escalate > 0 ? escalate : 0.85;
    const recover =
      typeof opts.workRecoverFactor === "number"
        ? opts.workRecoverFactor
        : perf.WORK_RECOVER_FACTOR;
    this._workRecoverFactor = Number.isFinite(recover) && recover > 0 ? recover : 0.55;
    this._onLevelChange = typeof opts.onLevelChange === "function" ? opts.onLevelChange : () => {};

    // Ring buffer state (allocated lazily when window size known) replaces dynamic array.
    /** @private @type {Float32Array|null} */ this._buf = null; // frame delta samples
    /** @private @type {Float32Array|null} */ this._workBuf = null; // work samples (-1 = absent)
    /** @private */ this._w = 0; // write index
    /** @private */ this._count = 0; // number of valid samples (<= window size)
    /** @private */ this._sum = 0; // running sum of frame samples
    /** @private */ this._workSum = 0; // running sum of work samples present in window
    /** @private */ this._workCount = 0; // number of work samples present in window
    this._level = 0;
    this._cooldown = 0;
  }

  /** Reset monitor state and optionally force level. */
  reset(level = 0) {
    this._level = Math.max(0, level | 0);
    this._cooldown = 0;
    this._clearWindow();
  }

  /** Current performance level (0 = default). */
  get level() {
    return this._level;
  }

  /** Configured main-thread budget per frame (ms) used by the work signal. */
  get workBudgetMs() {
    return this._workBudgetMs;
  }

  /**
   * Add a frame sample.
   * @param {number} frameDtMs Frame duration in milliseconds.
   * @param {{ active?: boolean, workMs?: number }} [opts]
   *  active: false while paused / in menus (clears the window so stale frames never trigger).
   *  workMs: optional main-thread update+draw time for this frame.
   */
  sample(frameDtMs, opts = {}) {
    if (!Number.isFinite(frameDtMs) || frameDtMs <= 0) return;
    const active = opts.active !== false;
    if (!active) {
      this._clearWindow();
      return;
    }

    if (!Array.isArray(this._levels) || this._levels.length === 0) {
      return;
    }
    const maxLevel = this._levels.length;
    const configIndex = Math.max(0, Math.min(this._level, maxLevel - 1));

    const config = this._levels[configIndex];
    const windowSize = config.sampleWindow || this._sampleWindow;
    const cooldownFrames =
      typeof config.cooldownFrames === "number" ? config.cooldownFrames : this._defaultCooldown;
    // Lazy allocate or reallocate buffers if window size changed (rare path).
    if (!this._buf || this._buf.length !== windowSize || !this._workBuf) {
      this._buf = new Float32Array(windowSize);
      this._workBuf = new Float32Array(windowSize);
      this._clearWindow();
    }
    const buf = this._buf;
    const workBuf = this._workBuf;
    const work =
      typeof opts.workMs === "number" && Number.isFinite(opts.workMs) && opts.workMs >= 0
        ? opts.workMs
        : -1;
    // Remove values being overwritten from running sums (only when buffer already full).
    if (this._count === buf.length) {
      this._sum -= buf[this._w];
      const oldWork = workBuf[this._w];
      if (oldWork >= 0) {
        this._workSum -= oldWork;
        this._workCount--;
      }
    } else {
      this._count++;
    }
    buf[this._w] = frameDtMs;
    workBuf[this._w] = work;
    this._sum += frameDtMs;
    if (work >= 0) {
      this._workSum += work;
      this._workCount++;
    }
    this._w = (this._w + 1) % buf.length;
    if (this._count < buf.length) return; // not enough samples yet

    if (this._cooldown > 0) {
      this._cooldown--;
      return;
    }

    const avg = this._sum / this._count;
    const workAvg = this._workCount > 0 ? this._workSum / this._workCount : -1;
    const workEscalate = workAvg >= 0 && workAvg > this._workBudgetMs * this._workEscalateFactor;
    if (this._level < maxLevel && (avg > config.thresholdMs || workEscalate)) {
      this._level += 1;
      this._clearWindow();
      this._cooldown = cooldownFrames;
      this._notify(avg, config.thresholdMs, windowSize, workAvg);
      return;
    }

    if (this._level > 0) {
      const recoveryConfigIndex = Math.max(0, Math.min(this._level - 1, maxLevel - 1));
      const recoveryConfig = this._levels[recoveryConfigIndex];
      const recoveryThreshold = recoveryConfig.thresholdMs * this._recoveryThresholdFactor;
      const workHealthy = workAvg < 0 || workAvg < this._workBudgetMs * this._workRecoverFactor;
      if (avg < recoveryThreshold && workHealthy) {
        this._level -= 1;
        this._clearWindow();
        this._cooldown = this._recoveryCooldownFrames;
        this._notify(avg, recoveryThreshold, windowSize, workAvg);
      }
    }
  }

  /**
   * Reset rolling-window statistics while retaining buffer allocations.
   * @private
   */
  _clearWindow() {
    this._w = 0;
    this._count = 0;
    this._sum = 0;
    this._workSum = 0;
    this._workCount = 0;
  }

  /**
   * Invoke the level-change listener, swallowing listener errors.
   * @param {number} averageFrameMs
   * @param {number} thresholdMs
   * @param {number} windowSize
   * @param {number} workAvg Negative when no work samples were available.
   * @private
   */
  _notify(averageFrameMs, thresholdMs, windowSize, workAvg) {
    try {
      /** @type {{averageFrameMs:number, thresholdMs:number, windowSize:number, workMs?:number}} */
      const meta = { averageFrameMs, thresholdMs, windowSize };
      if (workAvg >= 0) meta.workMs = workAvg;
      this._onLevelChange(this._level, meta);
    } catch (_e) {
      /* swallow listener errors */
    }
  }
}
