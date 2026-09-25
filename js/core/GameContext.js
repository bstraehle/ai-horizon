import { CONFIG } from "../constants.js";

/**
 * @typedef {Object} ViewRect
 * @property {number} width
 * @property {number} height
 * @property {number} [dpr]
 * @property {number} [resolutionScale]
 */

/**
 * @typedef {Object} GameContext
 * @property {CanvasRenderingContext2D} ctx
 * @property {ViewRect} view
 * @property {boolean} running
 * @property {boolean} paused
 * @property {boolean} gameOver
 * @property {number} animTime - milliseconds
 * @property {number} timeSec - seconds
 * @property {number} dtSec - seconds since the previous rendered frame (falls back to the fixed step); drives render-side animation such as starfield drift
 * @property {number} [timerRemaining]
 * @property {number} [timerSeconds]
 * @property {boolean} isMobile
 * @property {boolean} isLowPower
 * @property {number} starfieldScale
 * @property {import('../types.js').RNGLike} rng
 * @property {{ nebulaConfigs?: any, starField: any }} background
 */

/**
 * getGameContext – construct a lightweight snapshot consumed by stateless managers (render, background, etc.).
 * Purpose: Provide only the fields external systems need while insulating internal mutable arrays & logic.
 * Allocation: Creates one shallow object plus a nested `background` object; nested references
 * (ctx, view, nebula/starfield data) are shared, not copied. Per-frame callers should prefer
 * `fillGameContext` with a retained target to avoid the allocation.
 * Immutability Contract: Callers MUST treat the returned object and its nested properties as read-only.
 * Field Summary:
 *  - ctx: Canvas 2D context used for draw calls.
 *  - view: { width, height, dpr } describing the logical viewport.
 *  - running / paused / gameOver: FSM-derived phase flags.
 *  - animTime: Cumulative time in ms since game start (monotonic per session).
 *  - timeSec: Same as animTime but seconds.
 *  - dtSec: Real delta of the last rendered frame (fixed step when unknown) for render-side motion.
 *  - timerRemaining / timerSeconds: Countdown state (may be undefined when feature disabled).
 *  - isMobile: Platform heuristic for adaptive spawning / speeds.
 *  - rng: RNG for visual-only effects (`game.visualRng` when present) so render-time randomness
 *    such as starfield respawn jitter never advances the simulation RNG.
 *  - background: { nebulaConfigs, starField } for background rendering.
 * @param {any} game Game instance (AIHorizon) providing source state.
 * @returns {GameContext}
 */
export function getGameContext(game) {
  return fillGameContext(game, /** @type {GameContext} */ ({ background: {} }));
}

/**
 * fillGameContext – refresh an existing snapshot object in place (allocation-free hot-path variant
 * of `getGameContext`). Every field is overwritten so stale values cannot leak between frames; any
 * extra properties callers attached to `target` (e.g. `suppressNebula`) are left untouched and must
 * be managed by the caller.
 * @param {any} game Game instance (AIHorizon) providing source state.
 * @param {GameContext} target Snapshot object to refresh; `target.background` is reused when present.
 * @returns {GameContext} The same `target` for chaining.
 */
export function fillGameContext(game, target) {
  target.ctx = game.ctx;
  target.view = game.view;

  target.running = game.state.isRunning();
  target.paused = game.state.isPaused();
  target.gameOver = typeof game.state.isGameOver === "function" && game.state.isGameOver();
  target.animTime = game.timeMs;
  target.timeSec = game.timeSec;
  target.dtSec = game._frameDtSec || game._lastDtSec || CONFIG.TIME.DEFAULT_DT;
  target.timerRemaining = typeof game.timerRemaining === "number" ? game.timerRemaining : undefined;
  target.timerSeconds = typeof game.timerSeconds === "number" ? game.timerSeconds : undefined;

  target.isMobile = game._isMobile;
  target.isLowPower = !!game._isLowPowerMode;

  target.starfieldScale = typeof game._starfieldScale === "number" ? game._starfieldScale : 1;

  target.rng = game.visualRng || game.rng;

  const background = target.background || (target.background = { starField: undefined });
  background.nebulaConfigs = game.nebulaConfigs;
  background.starField = game.starField;
  return target;
}
