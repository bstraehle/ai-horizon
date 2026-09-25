import { CONFIG } from "../constants.js";

/** Tolerance (ms) when testing whether the accumulator holds a full step; far below RAF precision. */
const STEP_EPSILON_MS = 1e-6;

/**
 * GameLoop – fixed timestep accumulator with timestep snapping and a render extrapolation ratio.
 *
 * Goals:
 * - Keep simulation deterministic & stable across variable refresh displays.
 * - Bound catch‑up work to avoid the classic spiral‑of‑death on long frames.
 * - Expose raw frame delta separately for systems that want render‑time effects.
 *
 * Flow (per requestAnimationFrame tick):
 *   1. Snap the frame delta to a whole number of steps when it is within `snapTolerance` of one
 *      (absorbs vsync jitter on displays whose refresh is a multiple of the step rate, so a 60 Hz
 *      display runs exactly one step per frame instead of drifting into 0/2-step hitches).
 *   2. Accumulate clamped elapsed time (<= stepMs * maxSubSteps).
 *   3. While accumulator >= step: invoke update(stepMs) & decrement.
 *   4. Invoke draw(frameDtMs, metrics) exactly once. `metrics.alpha` (remaining accumulator / step,
 *      in [0,1)) tells renderers how far past the last simulated state this frame is, so linear
 *      motion can be extrapolated for smooth output on 120 Hz+ displays.
 *
 * Notes:
 * - `shouldUpdate` gate lets paused states continue rendering without advancing simulation; the
 *   accumulator is reset while paused so alpha is 0.
 */
export class GameLoop {
  /**
   * @typedef {Object} GameLoopOptions
   * @property {(dtMs:number, dtSec:number)=>void} update Fixed-step simulation callback.
   * @property {(frameDtMs:number, metrics?:GameLoopFrameMetrics)=>void} draw Per-frame render callback.
   * @property {()=>boolean} [shouldUpdate] Predicate; when false, simulation pauses while draw still runs.
   * @property {number} [stepMs] Fixed timestep size in ms.
   * @property {number} [maxSubSteps] Maximum update steps processed per RAF (catch-up clamp).
   * @property {number} [snapTolerance] Fraction of a step within which frame deltas snap to whole steps (0 disables).
   * @property {(m:GameLoopFrameMetrics)=>void} [onMetrics] Optional per-frame metrics listener.
   */
  /**
   * @param {GameLoopOptions} opts
   */
  constructor(opts /** @type {any} */) {
    this._update = opts.update;
    this._draw = opts.draw;
    this._shouldUpdate = opts.shouldUpdate || null;
    this._stepMs = opts.stepMs || CONFIG.TIME.STEP_MS;
    this._maxSubSteps = Math.max(1, opts.maxSubSteps || CONFIG.TIME.MAX_SUB_STEPS);
    this._snapTolerance =
      typeof opts.snapTolerance === "number"
        ? Math.max(0, opts.snapTolerance)
        : CONFIG.TIME.SNAP_TOLERANCE;
    this._acc = 0;
    this._last = 0;
    this._running = false;
    this._rafId = 0;
    this._tick = this._tick.bind(this);
    this._onMetrics = typeof opts.onMetrics === "function" ? opts.onMetrics : null;
    /** @private */ this._lastMetrics = null;
  }

  /**
   * Snap a raw frame delta to the nearest whole number of fixed steps when within tolerance.
   * Deltas far from any multiple (e.g. 8.3 ms at 120 Hz with a 16.7 ms step) are returned as-is.
   * @param {number} frameDtMs Raw RAF delta (ms).
   * @param {number} stepMs Fixed step size (ms).
   * @param {number} tolerance Fraction of a step; 0 disables snapping.
   * @returns {number}
   */
  static snapFrameDelta(frameDtMs, stepMs, tolerance) {
    if (!(tolerance > 0) || !(stepMs > 0) || !(frameDtMs > 0)) return frameDtMs;
    const steps = Math.round(frameDtMs / stepMs);
    if (steps < 1) return frameDtMs;
    const target = steps * stepMs;
    return Math.abs(frameDtMs - target) <= stepMs * tolerance ? target : frameDtMs;
  }

  /**
   * Start the loop (idempotent).
   * Effects: Resets accumulator & timestamps; schedules first RAF.
   * Guard: No-op if already running.
   */
  start() {
    if (this._running) return;
    this._running = true;
    this._acc = 0;
    this._last = performance.now();
    this._rafId = requestAnimationFrame(this._tick);
  }

  /**
   * Stop the loop (idempotent).
   * Effects: Cancels outstanding RAF and marks not running.
   * Guard: No-op if not running.
   */
  stop() {
    if (!this._running) return;
    this._running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = 0;
  }

  /**
   * Internal RAF callback.
   * Flow:
   * 1. Compute frame delta.
   * 2. Accumulate (clamped) and perform up to maxSubSteps updates while accumulator >= step.
   * 3. Invoke draw once with raw frame delta (for transient visual effects).
   * 4. Queue next RAF if still running.
   * Paused Behavior: If shouldUpdate() returns false, accumulator is reset (prevents large jump on resume).
   * @param {number} now High-resolution timestamp from requestAnimationFrame.
   * @private
   */
  _tick(now) {
    const rawFrameDt = now - this._last;
    this._last = now;
    const frameDt = GameLoop.snapFrameDelta(rawFrameDt, this._stepMs, this._snapTolerance);

    const canUpdate = !this._shouldUpdate || this._shouldUpdate();
    let steps = 0;
    let updateCost = 0;
    if (canUpdate) {
      const maxCatchup = this._stepMs * this._maxSubSteps;
      this._acc += Math.min(frameDt, maxCatchup);
      const tUpdateStart = performance.now();
      // Epsilon absorbs float error so an accumulator one ulp short of a step (e.g. exact half
      // steps at 120 Hz) still runs the step this frame instead of slipping by a frame.
      while (this._acc + STEP_EPSILON_MS >= this._stepMs && steps < this._maxSubSteps) {
        const dtMs = this._stepMs;
        this._update(dtMs, dtMs / 1000);
        this._acc -= this._stepMs;
        steps++;
      }
      if (this._acc < 0) this._acc = 0;
      updateCost = performance.now() - tUpdateStart;
    } else {
      this._acc = 0;
    }

    const alpha = this._stepMs > 0 ? Math.min(1, Math.max(0, this._acc / this._stepMs)) : 0;
    /** @type {{
     *  frameDt:number, steps:number, updateMs:number, drawMs:number, alpha:number,
     *  stepMs:number, maxSubSteps:number, now:number
     * }} */
    const metrics = {
      frameDt,
      steps,
      updateMs: updateCost,
      alpha,
      stepMs: this._stepMs,
      maxSubSteps: this._maxSubSteps,
      now,
      drawMs: 0,
    };
    const tDrawStart = performance.now();
    try {
      this._draw.length > 1 ? this._draw(frameDt, metrics) : this._draw(frameDt);
    } catch (_e) {
      /* swallow draw errors to avoid breaking loop */
    }
    metrics.drawMs = performance.now() - tDrawStart;
    this._lastMetrics = metrics;
    if (this._onMetrics) {
      try {
        this._onMetrics(metrics);
      } catch (_e) {
        /* ignore metrics listener errors */
      }
    }
    if (this._running) this._rafId = requestAnimationFrame(this._tick);
  }
}

/**
 * @typedef {Object} GameLoopFrameMetrics
 * @property {number} frameDt Frame delta after timestep snapping (ms)
 * @property {number} steps Fixed update steps executed this frame
 * @property {number} updateMs Time spent in fixed updates (ms)
 * @property {number} drawMs Time spent in draw callback (ms)
 * @property {number} alpha Render extrapolation ratio accumulator/step, clamped to [0,1]
 * @property {number} stepMs Fixed timestep size (ms)
 * @property {number} maxSubSteps Max configured sub steps
 * @property {number} now RAF high-resolution timestamp
 */
