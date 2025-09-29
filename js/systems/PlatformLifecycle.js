// @ts-nocheck
import { CONFIG } from "../constants.js";
import { SpawnManager } from "../managers/SpawnManager.js";
import { SpriteManager } from "../managers/SpriteManager.js";
/** @typedef {import('../game.js').AIHorizon} AIHorizon */

/**
 * Soft reinitialize platform-dependent parameters without clearing active gameplay state.
 * Adjusts speeds, spawn manager counters, partial pool warmups, and sprite atlas.
 * @param {AIHorizon} game
 * @param {boolean} nowMobile
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
