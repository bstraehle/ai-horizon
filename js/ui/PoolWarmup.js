import { CONFIG } from "../constants.js";
/** @typedef {import('../game.js').AIHorizon} AIHorizon */

/**
 * Warm object pools with representative instances to reduce first-frame latency.
 * Implementation is defensive; absence of a pool or warmUp method is silently ignored.
 * @param {AIHorizon} game
 */
export function warmUpPools(game) {
  if (!game) return;
  try {
    if (game.bulletPool && typeof game.bulletPool.warmUp === "function") {
      game.bulletPool.warmUp(64, 0, 0, CONFIG.BULLET.WIDTH, CONFIG.BULLET.HEIGHT, game.bulletSpeed);
    }

    if (game.asteroidPool && typeof game.asteroidPool.warmUp === "function") {
      const aW = CONFIG.ASTEROID.MIN_SIZE + CONFIG.ASTEROID.SIZE_VARIATION * 0.5;
      const aH = aW;
      game.asteroidPool.warmUp(
        32,
        0,
        CONFIG.ASTEROID.SPAWN_Y,
        aW,
        aH,
        game.asteroidSpeed,
        game.rng,
        false
      );
    }

    if (game.starPool && typeof game.starPool.warmUp === "function") {
      const sSize = CONFIG.STAR.MIN_SIZE + CONFIG.STAR.SIZE_VARIATION * 0.5;
      game.starPool.warmUp(32, 0, CONFIG.STAR.SPAWN_Y, sSize, sSize, game.starSpeed, false);
    }

    if (game.particlePool && typeof game.particlePool.warmUp === "function") {
      game.particlePool.warmUp(
        256,
        0,
        0,
        0,
        0,
        CONFIG.EXPLOSION.PARTICLE_LIFE,
        CONFIG.EXPLOSION.PARTICLE_LIFE,
        2,
        "#999"
      );
    }

    if (game.explosionPool && typeof game.explosionPool.warmUp === "function") {
      game.explosionPool.warmUp(
        16,
        0,
        0,
        CONFIG.EXPLOSION.SIZE,
        CONFIG.EXPLOSION.SIZE,
        CONFIG.EXPLOSION.LIFE,
        CONFIG.EXPLOSION.LIFE
      );
    }
  } catch (_) {
    /* intentionally empty */
  }
}
