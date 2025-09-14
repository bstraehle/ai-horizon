import { CONFIG } from "../constants.js";

/** Fixed-timestep game loop with accumulator. */
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

  start() {
    if (this._running) return;
    this._running = true;
    this._acc = 0;
    this._last = performance.now();
    this._rafId = requestAnimationFrame(this._tick);
  }

  stop() {
    if (!this._running) return;
    this._running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = 0;
  }

  /**
   * @param {number} now
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
