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
 * @property {number} dtSec - seconds
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
 * Allocation: Creates one shallow object; nested references (ctx, view, background objects) are reused.
 * Immutability Contract: Callers MUST treat the returned object and its nested properties as read-only.
 * Field Summary:
 *  - ctx: Canvas 2D context used for draw calls.
 *  - view: { width, height, dpr } describing the logical viewport.
 *  - running / paused / gameOver: FSM-derived phase flags.
 *  - animTime: Cumulative time in ms since game start (monotonic per session).
 *  - timeSec: Same as animTime but seconds.
 *  - dtSec: Delta time of last fixed update step.
 *  - timerRemaining / timerSeconds: Countdown state (may be undefined when feature disabled).
 *  - isMobile: Platform heuristic for adaptive spawning / speeds.
 *  - rng: Deterministic RNG interface for background / effects.
 *  - background: { nebulaConfigs, starField } for background rendering.
 * @param {any} game Game instance (AIHorizon) providing source state.
 * @returns {GameContext}
 */
export function getGameContext(game) {
  return {
    ctx: game.ctx,
    view: game.view,

    running: game.state.isRunning(),
    paused: game.state.isPaused(),
    gameOver: typeof game.state.isGameOver === "function" && game.state.isGameOver(),
    animTime: game.timeMs,
    timeSec: game.timeSec,
    dtSec: game._lastDtSec || CONFIG.TIME.DEFAULT_DT,
    timerRemaining: typeof game.timerRemaining === "number" ? game.timerRemaining : undefined,
    timerSeconds: typeof game.timerSeconds === "number" ? game.timerSeconds : undefined,

    isMobile: game._isMobile,
    isLowPower: !!game._isLowPowerMode,

    starfieldScale: typeof game._starfieldScale === "number" ? game._starfieldScale : 1,

    rng: game.rng,

    background: {
      nebulaConfigs: game.nebulaConfigs,
      starField: game.starField,
    },
  };
}
