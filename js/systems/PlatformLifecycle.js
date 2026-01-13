// @ts-nocheck
import { CONFIG } from "../constants.js";
import { SpawnManager } from "../managers/SpawnManager.js";
import { SpriteManager } from "../managers/SpriteManager.js";
/** @typedef {import('../game.js').AIHorizon} AIHorizon */

/**
 * Soft reinitialize platform-dependent parameters without clearing active gameplay state.
 *
 * Called when the platform detection changes (e.g., window resize crossing mobile threshold)
 * to adjust game parameters for the new platform context while preserving current session.
 *
 * Adjustments Made:
 *  - Updates _isMobile flag and recalculates asteroid/star speeds from CONFIG.
 *  - Resets SpawnManager counters for fresh spawn scheduling.
 *  - Clears nebulaConfigs to trigger regeneration on next background draw.
 *  - Warms up star and asteroid pools with platform-appropriate parameters.
 *  - Recreates sprite atlas via SpriteManager.
 *
 * Performance:
 *  - Lightweight operation suitable for mid-game platform transitions.
 *  - Pool warmups are bounded and defensive (silently ignored if pools unavailable).
 *
 * @param {AIHorizon} game Game instance to reinitialize.
 * @param {boolean} nowMobile Whether the current platform is mobile.
 */
export function softReinitForPlatformChange(game, nowMobile) {
  game._isMobile = nowMobile;
  game.asteroidSpeed = game._isMobile
    ? CONFIG.SPEEDS.ASTEROID_MOBILE
    : CONFIG.SPEEDS.ASTEROID_DESKTOP;
  game.starSpeed = CONFIG.SPEEDS.STAR;

  SpawnManager.reset(game);
  game.nebulaConfigs = undefined;

  try {
    if (game.starPool && typeof game.starPool.warmUp === "function") {
      game.starPool.warmUp(16, 0, 0, 0, 0, game.starSpeed, false);
    }
    if (game.asteroidPool && typeof game.asteroidPool.warmUp === "function") {
      game.asteroidPool.warmUp(
        8,
        0,
        0,
        CONFIG.ASTEROID.MIN_SIZE,
        CONFIG.ASTEROID.MIN_SIZE,
        game.asteroidSpeed,
        false
      );
    }
  } catch {
    /* ignore */
  }

  if (SpriteManager && typeof SpriteManager.createSprites === "function") {
    try {
      game.sprites = SpriteManager.createSprites();
    } catch {
      /* ignore */
    }
  }
}
