import { CONFIG } from "../constants.js";

/**
 * @typedef {Object} ViewRect
 * @property {number} width
 * @property {number} height
 * @property {number} [dpr]
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
 * @property {import('../types.js').RNGLike} rng
 * @property {{ nebulaConfigs?: any, starField: any }} background
 */

/**
 * Build a minimal, read-only snapshot of game state for managers.
 * Keeps managers decoupled from the Game class while avoiding broad refactors.
 *
 * @param {any} game
 * @returns {GameContext}
 */
export function getGameContext(game) {
  return {
    // Canvas & drawing
    ctx: game.ctx,
    view: game.view,

    // State & time
    running: game.state.isRunning(),
    paused: game.state.isPaused(),
    gameOver: typeof game.state.isGameOver === "function" && game.state.isGameOver(),
    animTime: game.timeMs,
    timeSec: game.timeSec,
    dtSec: game._lastDtSec || CONFIG.TIME.DEFAULT_DT,
    timerRemaining: typeof game.timerRemaining === "number" ? game.timerRemaining : undefined,
    timerSeconds: typeof game.timerSeconds === "number" ? game.timerSeconds : undefined,

    // Platform
    isMobile: game._isMobile,

    // Deterministic randomness
    rng: game.rng,

    // Background-related state used by BackgroundManager.draw
    background: {
      nebulaConfigs: game.nebulaConfigs,
      starField: game.starField,
    },
  };
}
