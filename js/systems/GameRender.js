// @ts-nocheck
import { CONFIG } from "../constants.js";
import { RenderManager } from "../managers/RenderManager.js";
/** @typedef {import('../game.js').AIHorizon} AIHorizon */

/**
 * Per-frame draw orchestration extracted from AIHorizon.draw.
 *
 * Handles performance sampling, render-time bookkeeping and paused-frame caching.
 * When paused, renders a single frame and caches it to avoid redundant draws.
 * When running, delegates to drawFrame for full scene rendering.
 *
 * Render-time bookkeeping (consumed by RenderManager / background):
 *  - `game._frameDtSec`: clamped real frame delta in seconds for render-side animations
 *    (starfield drift, popup fades) so their speed is independent of display refresh rate.
 *  - `game._renderExtrapolateSec`: seconds past the last simulated state (GameLoop alpha × step);
 *    linear motion is extrapolated by this amount so 120 Hz+ displays get smooth motion.
 *
 * Performance:
 *  - Adaptive-quality sampling lives in `samplePerformance` (post-draw metrics hook).
 *  - Caches paused frame to eliminate redundant rendering.
 *
 * @param {AIHorizon} game Game instance to render.
 * @param {number} [frameDtMs=CONFIG.TIME.STEP_MS] Frame delta time in milliseconds for performance sampling.
 */
export function drawGame(game, frameDtMs = CONFIG.TIME.STEP_MS) {
  const shouldTrack = isActivelyRunning(game);
  const safeFrame = clampFrameDelta(frameDtMs);
  game._frameDtSec = safeFrame > 0 ? safeFrame / 1000 : CONFIG.TIME.DEFAULT_DT;
  const metrics = game._frameMetrics;
  game._renderExtrapolateSec =
    shouldTrack && metrics && Number.isFinite(metrics.alpha)
      ? (metrics.alpha * CONFIG.TIME.STEP_MS) / 1000
      : 0;
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
  RenderManager.draw(game, game._renderExtrapolateSec || 0);
}

/**
 * Feed the adaptive PerformanceMonitor with the completed frame's metrics.
 *
 * Runs from the GameLoop metrics hook (after draw) so both signals are available: the frame delta
 * (dropped-frame detection) and the main-thread work (`updateMs + drawMs`, headroom detection).
 * Samples are marked inactive while paused / in menus so idle frames never trigger a tier change.
 *
 * @param {AIHorizon} game Game instance owning `performanceMonitor`.
 * @param {import('../core/GameLoop.js').GameLoopFrameMetrics} metrics Completed frame metrics.
 */
export function samplePerformance(game, metrics) {
  if (!game.performanceMonitor || !metrics) return;
  game.performanceMonitor.sample(clampFrameDelta(metrics.frameDt), {
    active: isActivelyRunning(game),
    workMs: (metrics.updateMs || 0) + (metrics.drawMs || 0),
  });
}

/**
 * True while gameplay is advancing (running and not paused).
 * @param {AIHorizon} game
 * @returns {boolean}
 */
function isActivelyRunning(game) {
  return !!(
    game.state &&
    typeof game.state.isRunning === "function" &&
    game.state.isRunning() &&
    !(typeof game.state.isPaused === "function" && game.state.isPaused())
  );
}

/**
 * Cap a frame delta so a single stall (tab switch, GC pause) cannot dominate rolling averages.
 * @param {number} frameDtMs
 * @returns {number}
 */
function clampFrameDelta(frameDtMs) {
  const maxSample = CONFIG.TIME.STEP_MS * CONFIG.TIME.MAX_SUB_STEPS * 1.5;
  return Math.min(frameDtMs, maxSample || frameDtMs || CONFIG.TIME.STEP_MS);
}
