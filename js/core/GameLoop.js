import { CONFIG } from "../constants.js";

/**
 * GameLoop – fixed timestep accumulator loop.
 *
 * Rationale:
 * - Deterministic physics / updates independent of display refresh.
 * - Uses an accumulator to run N fixed-size update steps per frame (clamped by `maxSubSteps`).
 * - Excess accumulated time beyond the clamp is discarded to avoid spiral of death under stalls.
 *
 * Flow per RAF tick:
 * 1. Accumulate elapsed time (capped by `stepMs * maxSubSteps`).
 * 2. While accumulator >= step -> run update(dtMs, dtSec), subtract step.
 * 3. Call draw(frameDtMs) exactly once with the real frame delta (for interpolation / FX if desired).
 */
export class GameLoop {
  /**
   * @param {{
   *   update: (dtMs:number, dtSec:number) => void,
   *   draw: (frameDtMs:number) => void,
   *   shouldUpdate?: () => boolean,
   *   stepMs?: number,
   *   maxSubSteps?: number
   * }} opts
   */
  constructor(opts) {
    this._update = opts.update;
    this._draw = opts.draw;
    this._shouldUpdate = opts.shouldUpdate || null;
    this._stepMs = opts.stepMs || CONFIG.TIME.STEP_MS;
    this._maxSubSteps = Math.max(1, opts.maxSubSteps || CONFIG.TIME.MAX_SUB_STEPS);
    this._acc = 0; // ms accumulated toward next fixed step
    this._last = 0; // last frame timestamp
    this._running = false;
    this._rafId = 0;
    this._tick = this._tick.bind(this);
  }

  /** Start the loop (idempotent). */
  start() {
    if (this._running) return;
    this._running = true;
    this._acc = 0;
    this._last = performance.now();
    this._rafId = requestAnimationFrame(this._tick);
  }

  /** Stop the loop (idempotent). */
  stop() {
    if (!this._running) return;
    this._running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = 0;
  }

  /**
   * Internal RAF callback.
   * @param {number} now High-resolution timestamp from requestAnimationFrame.
   * @private
   */
  _tick(now) {
    const frameDt = now - this._last;
    this._last = now;

    const canUpdate = !this._shouldUpdate || this._shouldUpdate();
    if (canUpdate) {
      const maxCatchup = this._stepMs * this._maxSubSteps;
      this._acc += Math.min(frameDt, maxCatchup);
      let steps = 0;
      while (this._acc >= this._stepMs && steps < this._maxSubSteps) {
        const dtMs = this._stepMs;
        this._update(dtMs, dtMs / 1000);
        this._acc -= this._stepMs;
        steps++;
      }
    } else {
      this._acc = 0;
    }

    this._draw(frameDt);
    if (this._running) this._rafId = requestAnimationFrame(this._tick);
  }
}
