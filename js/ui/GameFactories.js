import { CONFIG } from "../constants.js";
import { SpawnManager } from "../managers/SpawnManager.js";
/** @typedef {import('../game.js').AIHorizon} AIHorizon */

/**
 * Factory helpers for spawning & acquiring pooled game objects.
 * All methods rely on pools / RNG & performance tuning parameters stored on the game instance.
 */
export const GameFactories = {
  /**
   * Acquire a bullet from the pool, positioned at the player's cannon.
   * @param {AIHorizon} game
   * @returns {import('../entities/Bullet.js').Bullet}
   */
  createBullet(game) {
    const player = /** @type {any} */ (game.player);
    const pool = /** @type {any} */ (game.bulletPool);
    const upgraded =
      (CONFIG.GAME && CONFIG.GAME.BULLET_UPGRADE_SCORE | 0) > 0 &&
      typeof game.score === "number" &&
      game.score >= (CONFIG.GAME.BULLET_UPGRADE_SCORE | 0);
    const bw =
      upgraded && (CONFIG.BULLET.WIDTH_UPGRADED || 0) > 0
        ? CONFIG.BULLET.WIDTH_UPGRADED
        : CONFIG.BULLET.WIDTH;
    const bh =
      upgraded && (CONFIG.BULLET.HEIGHT_UPGRADED || 0) > 0
        ? CONFIG.BULLET.HEIGHT_UPGRADED
        : CONFIG.BULLET.HEIGHT;
    const bx = player.x + (player.width - bw) / 2 + CONFIG.BULLET.SPAWN_OFFSET;
    return pool.acquire(bx, player.y, bw, bh, game.bulletSpeed, upgraded ? "upgraded" : "normal");
  },
  /**
   * Spawn an explosion entity & its particle cloud subject to performance budget.
   * @param {AIHorizon} game
   * @param {number} x
   * @param {number} y
   */
  createExplosion(game, x, y) {
    const rng = /** @type {any} */ (game.rng);
    const particlePool = /** @type {any} */ (game.particlePool);
    const explosionPool = /** @type {any} */ (game.explosionPool);
    const particles = /** @type {any[]} */ (game.particles);
    const explosions = /** @type {any[]} */ (game.explosions);
    const perfMult = /** @type {number} */ (game._performanceParticleMultiplier || 1);
    const budget = Number.isFinite(game._particleBudget)
      ? /** @type {number} */ (game._particleBudget)
      : Number.POSITIVE_INFINITY;
    const particleCount = Math.max(0, Math.round(CONFIG.EXPLOSION.PARTICLE_COUNT * perfMult));
    for (let i = 0; i < particleCount; i++) {
      if (particles.length >= budget) break;
      const vx = (rng.nextFloat() - 0.5) * CONFIG.EXPLOSION.PARTICLE_SPEED_VAR;
      const vy = (rng.nextFloat() - 0.5) * CONFIG.EXPLOSION.PARTICLE_SPEED_VAR;
      const size =
        rng.range(0, CONFIG.EXPLOSION.PARTICLE_SIZE_VARIATION) + CONFIG.EXPLOSION.PARTICLE_SIZE_MIN;
      const gray = rng.range(40, 80);
      particles.push(
        particlePool.acquire(
          x,
          y,
          vx,
          vy,
          CONFIG.EXPLOSION.PARTICLE_LIFE,
          CONFIG.EXPLOSION.PARTICLE_LIFE,
          size,
          `hsl(0, 0%, ${gray}%)`
        )
      );
    }
    explosions.push(
      explosionPool.acquire(
        x - CONFIG.EXPLOSION.OFFSET,
        y - CONFIG.EXPLOSION.OFFSET,
        CONFIG.EXPLOSION.SIZE,
        CONFIG.EXPLOSION.SIZE,
        CONFIG.EXPLOSION.LIFE,
        CONFIG.EXPLOSION.LIFE
      )
    );
  },
  /**
   * Create a star (delegated to SpawnManager for central rules).
   * @param {AIHorizon} game
   */
  createStar(game) {
    return SpawnManager.createStar(/** @type {any} */ (game));
  },
  /**
   * Create an asteroid (delegated to SpawnManager).
   * @param {AIHorizon} game
   */
  createAsteroid(game) {
    return SpawnManager.createAsteroid(/** @type {any} */ (game));
  },
};
