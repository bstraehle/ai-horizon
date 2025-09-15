/**
 * RateLimiter – time gate enforcing a minimum interval between accepted actions.
 *
 * Purpose
 * -------
 * Wraps a monotonic time source to allow an operation only when the configured interval has fully
 * elapsed since the last permitted execution. Useful for throttling projectile fire, spawn waves,
 * network sync bursts, or UI interaction cooldowns.
 *
 * Behavior
 * --------
 * - try(fn?): If current time >= next allowed timestamp, schedules next window and optionally
 *   invokes the provided callback, returning true. Otherwise returns false with no side effects.
 * - reset(): Clears the internal schedule so the next try succeeds immediately.
 * - setInterval(ms): Adjusts the gating interval (does not retroactively modify already scheduled nextAt).
 *
 * Determinism
 * -----------
 * Deterministic when supplied with a deterministic `getTimeMs` function (e.g., a manual test clock).
 * Default time source uses `performance.now` (high‑resolution) or `Date.now` fallback.
 *
 * Performance
 * -----------
 * All operations O(1). Stores only scalar timestamps. No allocations after construction.
 *
 * Failure Modes / Edge Cases
 * --------------------------
 * - Negative interval coerced via bitwise OR to signed 32-bit integer then used (may allow rapid fire).
 * - Large intervals supported (int range); overflow in nextAt only for extreme values > ~2^53 ms.
 * - Callback exceptions propagate (no catch) preserving fail-fast semantics.
 */
export class RateLimiter {
  /**
   * @param {number} intervalMs Minimum elapsed milliseconds required between accepted attempts.
   * @param {() => number} [getTimeMs] Optional custom time source for deterministic testing.
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
   * Attempt a gated action.
   * Success Path: Updates internal next allowable timestamp and calls `fn` (if provided).
   * @param {() => void} [fn] Optional side-effect to execute when allowed.
   * @returns {boolean} True if action allowed (and executed), false if still cooling down.
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

  /** Reset cooldown so the very next try() succeeds immediately. */
  reset() {
    this._nextAt = 0;
  }

  /**
   * Change the enforced interval going forward (does not adjust already scheduled _nextAt).
   * @param {number} intervalMs New interval in ms.
   */
  setInterval(intervalMs) {
    this._interval = intervalMs | 0;
  }
}
