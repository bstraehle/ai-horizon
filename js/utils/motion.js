/**
 * motion – shared accessibility switch for decorative motion.
 *
 * Reads `prefers-reduced-motion: reduce` once (memoized; false outside a browser) so render-side
 * flourishes (ship banking, pickup pulses, screen shake) can be skipped for users who asked for
 * less motion, without every entity re-querying `matchMedia`.
 */

/** @type {boolean | null} */
let cached = null;

/**
 * @returns {boolean} True when the user prefers reduced motion.
 */
export function prefersReducedMotion() {
  if (cached === null) {
    try {
      cached =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        !!window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      cached = false;
    }
  }
  return cached;
}

/**
 * Override the memoized preference (tests / settings UI).
 * @param {boolean | null} value `null` re-reads the media query on next access.
 */
export function setReducedMotion(value) {
  cached = value;
}
