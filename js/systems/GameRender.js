// @ts-nocheck
import { CONFIG } from "../constants.js";
import { RenderManager } from "../managers/RenderManager.js";
/** @typedef {import('../game.js').AIHorizon} AIHorizon */

/**
 * Per-frame draw orchestration extracted from AIHorizon.draw.
 *
 * Handles performance sampling and paused-frame caching to optimize rendering.
 * When paused, renders a single frame and caches it to avoid redundant draws.
 * When running, delegates to drawFrame for full scene rendering.
 *
 * Performance:
 *  - Samples frame time for PerformanceMonitor (capped to prevent outlier spikes).
 *  - Only tracks metrics when game is actively running (not paused).
 *  - Caches paused frame to eliminate redundant rendering.
 *
 * @param {AIHorizon} game Game instance to render.
 * @param {number} [frameDtMs=CONFIG.TIME.STEP_MS] Frame delta time in milliseconds for performance sampling.
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
 *
 * Delegates all rendering to RenderManager.draw which handles:
 *  - Background layers (starfield, nebula).
 *  - All game entities (player, asteroids, bullets, stars, explosions, particles).
 *  - UI overlays and score popups.
 *
 * @param {AIHorizon} game Game instance containing all renderable state.
 */
export function drawFrame(game) {
  RenderManager.draw(game);
}
