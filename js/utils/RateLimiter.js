/**
 * RateLimiter – fixed-interval gate for discrete repeatable actions (e.g. firing, spawning).
 *
 * Responsibilities:
 * - Enforce a minimum elapsed time between successful attempts.
 * - Provide a side‑effect free probe (`try`) that signals allowance via boolean result.
 *
 * Design notes:
 * - Optional injected time source improves determinism in unit tests & replay scenarios.
 * - `try(fn)` pattern keeps call sites concise (no separate branch when allowed).
 */
export class RateLimiter {
  /**
   * @param {number} intervalMs - Minimum time between allowed calls.
   * @param {() => number} [getTimeMs] - Function returning the current time in milliseconds; defaults to performance.now/Date.now.
   */
  constructor(intervalMs, getTimeMs) {
    this._interval = intervalMs | 0;
    this._nextAt = 0;
    this._now =
      typeof getTimeMs === "function"
        ? getTimeMs
        : () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  }

  /**
   * Attempt to execute a function if the limiter allows it.
   * @param {() => void} [fn]
   * @returns {boolean} true if executed, false otherwise
   */
  try(fn) {
    const now = this._now();
    if (now >= this._nextAt) {
      this._nextAt = now + this._interval;
      if (fn) fn();
      return true;
    }
    return false;
  }

  /** Reset the limiter to allow an immediate next call. */
  reset() {
    this._nextAt = 0;
  }

  /**
   * Update the interval (milliseconds) used by this limiter.
   * @param {number} intervalMs
   */
  setInterval(intervalMs) {
    this._interval = intervalMs | 0;
  }
}
