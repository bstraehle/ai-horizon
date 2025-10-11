// @ts-nocheck
import { CONFIG } from "../constants.js";
import { BackgroundManager } from "../managers/BackgroundManager.js";
import { getGameContext } from "../core/GameContext.js";
import { RNG } from "../utils/RNG.js";
/** @typedef {import('../game.js').AIHorizon} AIHorizon */

/**
 * Initialize background (nebula configs + starfield) using current game context & performance flags.
 * @param {AIHorizon} game
 */
export function initBackgroundLifecycle(game) {
  try {
    const isGameOver =
      game && game.state && typeof game.state.isGameOver === "function" && game.state.isGameOver();
    if (isGameOver && game.nebulaConfigs && game.starField) {
      return;
    }
  } catch {
    /* ignore state checks; fall through to init */
  }
  const ctx = getGameContext(game);
  ctx.starfieldScale = game._starfieldScale;
  ctx.isLowPower = game._isLowPowerMode;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(CONFIG.RNG.SEED_PARAM)) {
      let seed = (Date.now() >>> 0) ^ 0;
      try {
        if (typeof performance !== "undefined" && typeof performance.now === "function") {
          seed = (seed ^ (Math.floor(performance.now()) & 0xffffffff)) >>> 0;
        }
      } catch {
        /* ignore */
      }
      seed = (seed ^ ((Math.random() * 0xffffffff) >>> 0)) >>> 0;
      ctx.rng = new RNG(seed);
    }
  } catch {
    ctx.rng = new RNG();
  }
  const { nebulaConfigs, starField } = BackgroundManager.init(ctx);
  if (nebulaConfigs) game.nebulaConfigs = nebulaConfigs;
  game.starField = starField;
}

/**
 * Draw only the background (nebula/starfield layers) for the current frame.
 * @param {AIHorizon} game
 */
export function drawBackgroundLifecycle(game) {
  BackgroundManager.draw(getGameContext(game));
}
