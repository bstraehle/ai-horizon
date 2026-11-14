import { CONFIG } from "../constants.js";
import { Particle } from "../entities/Particle.js";
import { SpawnManager } from "../managers/SpawnManager.js";
import { ScoringManager } from "../managers/ScoringManager.js";
import { BackgroundManager } from "../managers/BackgroundManager.js";
/** @typedef {import('../game.js').AIHorizon} AIHorizon */
/**
 * What an explosion destroyed: a rock gets the standard blast, the others a bigger one
 * (CONFIG.EXPLOSION.BLASTS).
 * @typedef {"rock"|"planet"|"bonus"|"ship"} BlastKind
 */

/**
 * Extra sparks of a bigger blast, thrown out radially: gray like the standard cloud and, with an
 * accent, every other one in the accent colour. Draws only from the visual RNG (never the game
 * RNG), scaled and capped by the performance tier like the standard cloud.
 * @param {any} game
 * @param {number} x
 * @param {number} y
 * @param {{ sparks: number, sparkSpeed: number, sparkLife: number }} blast
 * @param {string|null} accent
 */
function addBlastSparks(game, x, y, blast, accent) {
  const E = CONFIG.EXPLOSION;
  const visual = game.visualRng;
  const rand = () => (visual ? visual.nextFloat() : Math.random());
  const budget = Number.isFinite(game._particleBudget)
    ? game._particleBudget
    : Number.POSITIVE_INFINITY;
  const count = Math.round(blast.sparks * (game._performanceParticleMultiplier || 1));
  for (let i = 0; i < count; i++) {
    if (game.particles.length >= budget) break;
    const angle = rand() * CONFIG.TWO_PI;
    const speed = blast.sparkSpeed * (0.35 + 0.65 * rand());
    const life = blast.sparkLife * (0.6 + 0.4 * rand());
    const size = E.PARTICLE_SIZE_MIN + rand() * E.PARTICLE_SIZE_VARIATION;
    const gray = Particle.quantizeGray(
      E.PARTICLE_GRAY_MIN + rand() * (E.PARTICLE_GRAY_MAX - E.PARTICLE_GRAY_MIN)
    );
    game.particles.push(
      game.particlePool.acquire(
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        life,
        life,
        size,
        accent && i % 2 === 0 ? accent : Particle.sparkColor(gray)
      )
    );
  }
}

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
    const upgraded = ScoringManager.bulletUpgradeActive(game);
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
   * Particle grays are drawn from the RNG (keeps seeded runs reproducible) then snapped to the
   * discrete palette so the shared particle sprite cache stays small.
   *
   * `kind` scales the blast to what was destroyed: a planet, a bonus planet or the player's ship
   * gets a wider, longer flash (CONFIG.EXPLOSION.BLASTS; bonus planets and the ship with a ring
   * in the run's accent colour) and extra sparks on top of the standard cloud. The standard
   * cloud draws from the game RNG identically for every kind and the extra sparks draw from the
   * visual RNG, so a bigger blast never shifts a seeded run.
   * @param {AIHorizon} game
   * @param {number} x
   * @param {number} y
   * @param {BlastKind} [kind="rock"]
   * @param {number} [bodySize=0] Width of the destroyed body; planets scale their blast to it.
   */
  createExplosion(game, x, y, kind = "rock", bodySize = 0) {
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
      const gray = Particle.quantizeGray(
        rng.range(CONFIG.EXPLOSION.PARTICLE_GRAY_MIN, CONFIG.EXPLOSION.PARTICLE_GRAY_MAX)
      );
      particles.push(
        particlePool.acquire(
          x,
          y,
          vx,
          vy,
          CONFIG.EXPLOSION.PARTICLE_LIFE,
          CONFIG.EXPLOSION.PARTICLE_LIFE,
          size,
          Particle.sparkColor(gray)
        )
      );
    }
    const blast = kind === "rock" ? null : CONFIG.EXPLOSION.BLASTS[kind];
    if (!blast) {
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
      return;
    }
    const size = Math.max(
      CONFIG.EXPLOSION.SIZE,
      Math.round(blast.size || bodySize * blast.sizeFactor)
    );
    const accent = !blast.accent
      ? null
      : BackgroundManager.getCurrentNebulaPalette() === "blue"
        ? CONFIG.COLORS.ACCENT.BLUE
        : CONFIG.COLORS.ACCENT.RED;
    explosions.push(
      explosionPool.acquire(x - size / 2, y - size / 2, size, size, blast.life, blast.life, accent)
    );
    addBlastSparks(game, x, y, blast, accent);
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
