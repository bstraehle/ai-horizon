/**
 * RateLimiter – simple time-based gate for discrete actions (e.g., firing).
 *
 * Responsibilities:
 * - Enforce minimum interval between allowed actions.
 * - Provide a side-effect-free test (`try`) returning success boolean.
 *
 * Key decisions:
 * - Caller supplies optional fn to execute inline (avoids branching at call site).
 * - Uses provided time source for test determinism in unit tests.
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
