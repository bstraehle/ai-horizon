// @ts-nocheck
import { CONFIG } from "../constants.js";
import { RenderManager } from "../managers/RenderManager.js";
/** @typedef {import('../game.js').AIHorizon} AIHorizon */

/**
 * Per-frame draw orchestration extracted from AIHorizon.draw.
 * Handles performance sampling & paused-frame caching.
 * @param {AIHorizon} game
 * @param {number} frameDtMs
 */
export function drawGame(game, frameDtMs = CONFIG.TIME.STEP_MS) {
  const shouldTrack = !!(
    game.state &&
    typeof game.state.isRunning === "function" &&
    game.state.isRunning() &&
    !(typeof game.state.isPaused === "function" && game.state.isPaused())
  );
  if (game.performanceMonitor) {
    const maxSample = CONFIG.TIME.STEP_MS * CONFIG.TIME.MAX_SUB_STEPS * 1.5;
    const safeFrame = Math.min(frameDtMs, maxSample || frameDtMs || CONFIG.TIME.STEP_MS);
    game.performanceMonitor.sample(safeFrame, { active: shouldTrack });
  }
  if (game.state.isPaused()) {
    if (!game._pausedFrameRendered) {
      drawFrame(game);
      game._pausedFrameRendered = true;
    }
    return;
  }
  drawFrame(game);
}

/**
 * Draw a full frame (background + entities) via RenderManager.
 * @param {AIHorizon} game
 */
export function drawFrame(game) {
  RenderManager.draw(game);
}
