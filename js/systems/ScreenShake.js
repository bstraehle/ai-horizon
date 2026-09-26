import { prefersReducedMotion } from "../utils/motion.js";

/**
 * ScreenShake – tiny render-side camera jolt for big impacts (planet kills, player death).
 *
 * State lives on the game object (`_shakeT` remaining seconds, `_shakeDur`, `_shakeMag` px) and is
 * advanced with the real frame delta inside the render pass, so it never touches the fixed-step
 * simulation or the seeded RNG. Disabled entirely under prefers-reduced-motion.
 *
 * Lifecycle: a shake only decays while frames render. The death jolt is triggered on the same tick
 * that stops the loop, so it stays pending across the game-over screens; `resetShake` is called
 * from the run reset (systems/ResetLifecycle) so it does not replay on the next spawn.
 */

/** @typedef {{ _shakeT?: number, _shakeDur?: number, _shakeMag?: number }} ShakeHost */

/**
 * Start (or intensify) a shake.
 * @param {ShakeHost} host Game instance.
 * @param {number} magnitude Peak offset in logical pixels.
 * @param {number} [duration=0.35] Seconds.
 */
export function triggerShake(host, magnitude, duration = 0.35) {
  if (!host || prefersReducedMotion()) return;
  const mag = Math.max(host._shakeMag || 0, magnitude);
  host._shakeMag = mag;
  host._shakeDur = duration;
  host._shakeT = duration;
}

/**
 * Cancel any pending shake so the next rendered frame is steady.
 * @param {ShakeHost} host Game instance.
 */
export function resetShake(host) {
  if (!host) return;
  host._shakeT = 0;
  host._shakeMag = 0;
}

/**
 * Advance the shake by `dtSec` and return the offset to apply this frame.
 * @param {ShakeHost} host
 * @param {number} dtSec Real frame delta (seconds).
 * @param {{ x:number, y:number }} out Reused output vector.
 * @returns {{ x:number, y:number }} `out`, zeroed when no shake is active.
 */
export function shakeOffset(host, dtSec, out) {
  const t = host && host._shakeT ? host._shakeT : 0;
  if (t <= 0) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  const dur = host._shakeDur || 0.35;
  const mag = host._shakeMag || 0;
  const k = Math.max(0, t / dur);
  const amp = mag * k * k;
  out.x = Math.sin(t * 61.3) * amp;
  out.y = Math.cos(t * 47.9) * amp;
  host._shakeT = Math.max(0, t - dtSec);
  if (host._shakeT === 0) host._shakeMag = 0;
  return out;
}
