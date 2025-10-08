import { CONFIG } from "../constants.js";

/**
 * GameLoop – fixed timestep accumulator with frame interpolation hook.
 *
 * Goals:
 * - Keep simulation deterministic & stable across variable refresh displays.
 * - Bound catch‑up work to avoid the classic spiral‑of‑death on long frames.
 * - Expose raw frame delta separately for systems that want render‑time effects.
 *
 * Flow (per requestAnimationFrame tick):
 *   1. Accumulate clamped elapsed time (<= stepMs * maxSubSteps).
 *   2. While accumulator >= step: invoke update(stepMs) & decrement.
 *   3. Invoke draw(frameDtMs) exactly once.
 *
 * Notes:
 * - Interpolation of render‑only values can be layered in using remaining accumulator / step ratio if desired.
 * - `shouldUpdate` gate lets paused states continue rendering without advancing simulation.
 */
export class GameLoop {
  /**
   * @typedef {Object} GameLoopOptions
   * @property {(dtMs:number, dtSec:number)=>void} update Fixed-step simulation callback.
   * @property {(frameDtMs:number, metrics?:GameLoopFrameMetrics)=>void} draw Per-frame render callback.
   * @property {()=>boolean} [shouldUpdate] Predicate; when false, simulation pauses while draw still runs.
   * @property {number} [stepMs] Fixed timestep size in ms.
   * @property {number} [maxSubSteps] Maximum update steps processed per RAF (catch-up clamp).
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
    this._acc = 0;
    this._last = 0;
    this._running = false;
    this._rafId = 0;
    this._tick = this._tick.bind(this);
    this._onMetrics = typeof opts.onMetrics === "function" ? opts.onMetrics : null;
    /** @private */ this._lastMetrics = null;
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
    const frameDt = now - this._last;
    this._last = now;

    const canUpdate = !this._shouldUpdate || this._shouldUpdate();
    let steps = 0;
    let updateCost = 0;
    if (canUpdate) {
      const maxCatchup = this._stepMs * this._maxSubSteps;
      this._acc += Math.min(frameDt, maxCatchup);
      const tUpdateStart = performance.now();
      while (this._acc >= this._stepMs && steps < this._maxSubSteps) {
        const dtMs = this._stepMs;
        this._update(dtMs, dtMs / 1000);
        this._acc -= this._stepMs;
        steps++;
      }
      updateCost = performance.now() - tUpdateStart;
    } else {
      this._acc = 0;
    }

    const alpha = this._stepMs > 0 ? this._acc / this._stepMs : 0;
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
 * @property {number} frameDt Raw RAF delta (ms)
 * @property {number} steps Fixed update steps executed this frame
 * @property {number} updateMs Time spent in fixed updates (ms)
 * @property {number} drawMs Time spent in draw callback (ms)
 * @property {number} alpha Interpolation ratio accumulator/step (0..1)
 * @property {number} stepMs Fixed timestep size (ms)
 * @property {number} maxSubSteps Max configured sub steps
 * @property {number} now RAF high-resolution timestamp
 */
