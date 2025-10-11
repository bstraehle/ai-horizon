import { CONFIG } from "../constants.js";
import { Asteroid } from "../entities/Asteroid.js";
import { Star } from "../entities/Star.js";
/** @typedef {import('../types.js').RNGLike} RNGLike */
/** @typedef {import('../types.js').Pool<Asteroid>} AsteroidPool */
/** @typedef {import('../types.js').Pool<Star>} StarPool */

/** @typedef {{ width:number, height:number }} ViewSize */

/**
 * @typedef {Object} SpawnGameSlice
 * @property {RNGLike} rng
 * @property {ViewSize} view
 * @property {number} asteroidSpeed
 * @property {number} starSpeed
 * @property {boolean} [_isMobile]
 * @property {boolean} [_isLowPowerMode]
 * @property {number} [_spawnRateScale]
 * @property {AsteroidPool | null | undefined} [asteroidPool]
 * @property {StarPool | null | undefined} [starPool]
 * @property {Asteroid[]} asteroids
 * @property {Star[]} stars
 */

/**
 * @typedef {Object} AsteroidCreateSlice
 * @property {RNGLike} rng
 * @property {ViewSize} view
 * @property {number} asteroidSpeed
 * @property {AsteroidPool | null | undefined} [asteroidPool]
 * @property {number} [_normalAsteroidCount]
 * @property {number} [timeSec]
 */

/**
 * @typedef {Object} StarCreateSlice
 * @property {RNGLike} rng
 * @property {ViewSize} view
 * @property {number} starSpeed
 * @property {StarPool | null | undefined} [starPool]
 * @property {number} [_yellowStarCount]
 */

/**
 * SpawnManager – probabilistic spawner for asteroids & stars.
 * Uses Poisson approximation: p = 1 - exp(-lambda * dt).
 * Tracks cadence counters (indestructible asteroids, red stars) and supports pools.
 * Per-game state isolated in WeakMap (no surface mutations).
 */
/**
 * Per-game spawn state:
 * @typedef {{
 *   yellowCount: number,
 *   normalAsteroidCount: number,
 *   planetIndex: number,
 *   planetUsed: Set<number>,
 *   goldenSpawned: number,
 *   goldenWindow: number
 * }} SpawnState
 */
export class SpawnManager {
  /** @type {WeakMap<object, SpawnState>} */
  static #STATE = new WeakMap();

  /** Get or create per-game spawn counters. @param {object} game */
  static #state(game) {
    let st = this.#STATE.get(game);
    if (!st) {
      st = {
        yellowCount: 0,
        normalAsteroidCount: 0,
        planetIndex: 0,
        planetUsed: new Set(),
        goldenSpawned: 0,
        goldenWindow: -1,
      };
      this.#STATE.set(game, st);
    }
    return st;
  }

  /** Reset per-game spawn cadence/palette state. @param {object} game */
  static reset(game) {
    this.#STATE.delete(game);
  }

  /**
   * Per-tick probabilistic spawn (asteroids & stars) using Poisson approximation.
   * @param {SpawnGameSlice} game
   * @param {number} [dtSec=CONFIG.TIME.DEFAULT_DT]
   */
  static spawnObjects(game, dtSec) {
    const dt = typeof dtSec === "number" ? dtSec : CONFIG.TIME.DEFAULT_DT;
    const rng = game.rng;
    const isMobile = typeof game._isMobile === "boolean" ? game._isMobile : null;
    const lowPower = !!game._isLowPowerMode;
    const treatAsMobile = isMobile === true || (lowPower && isMobile !== false);
    const asteroidBase = treatAsMobile
      ? CONFIG.GAME.ASTEROID_SPAWN_RATE_MOBILE
      : isMobile === false
        ? CONFIG.GAME.ASTEROID_SPAWN_RATE_DESKTOP
        : CONFIG.GAME.ASTEROID_SPAWN_RATE;
    const starBase = treatAsMobile
      ? CONFIG.GAME.STAR_SPAWN_RATE_MOBILE
      : isMobile === false
        ? CONFIG.GAME.STAR_SPAWN_RATE_DESKTOP
        : CONFIG.GAME.STAR_SPAWN_RATE;
    const spawnScale =
      typeof game._spawnRateScale === "number" && game._spawnRateScale > 0
        ? Math.max(0.1, Math.min(1, game._spawnRateScale))
        : 1;
    const asteroidRate = asteroidBase * spawnScale;
    const starRate = starBase * spawnScale;

    const pAst = 1 - Math.exp(-asteroidRate * dt);
    const pStar = 1 - Math.exp(-starRate * dt);
    if (rng.nextFloat() < pAst) game.asteroids.push(this.createAsteroid(game));
    if (rng.nextFloat() < pStar) game.stars.push(this.createStar(game));
  }

  /** Create/acquire asteroid; manages cadence for indestructible variant + palette cycling. @param {AsteroidCreateSlice} game @returns {Asteroid} */
  static createAsteroid(game) {
    const rng = game.rng;
    const st = /** @type {any} */ (this.#state(game));
    const asteroidThreshold = CONFIG.GAME.ASTEROID_NORMAL_BEFORE_INDESTRUCTIBLE | 0 || 10;
    const count = st.normalAsteroidCount | 0;
    let isIndestructible = count >= asteroidThreshold;
    let isGolden = false;
    if (isIndestructible) {
      const maxGolden = CONFIG.GAME.GOLDEN_ASTEROID_COUNT | 0;
      const prob =
        typeof CONFIG.GAME.GOLDEN_ASTEROID_PROB === "number"
          ? Math.max(0, Math.min(1, CONFIG.GAME.GOLDEN_ASTEROID_PROB))
          : 0.5;
      if (maxGolden > 0 && st.goldenSpawned < maxGolden) {
        const total = CONFIG.GAME.TIMER_SECONDS | 0 || 60;
        const elapsed =
          typeof game.timeSec === "number" ? Math.max(0, Math.min(game.timeSec, total)) : 0;
        const windowSize = Math.max(1, Math.floor(total / Math.max(1, maxGolden))); // e.g., 20s windows for 3
        const currentWindow = Math.floor(elapsed / windowSize);
        const canSpawnInWindow = currentWindow > (st.goldenWindow | 0);
        if (canSpawnInWindow && rng.nextFloat() < prob) {
          isGolden = true;
          st.goldenSpawned++;
          st.goldenWindow = currentWindow;
        }
      }
    }
    st.normalAsteroidCount = isIndestructible ? 0 : count + 1;

    const baseSize = CONFIG.ASTEROID.MIN_SIZE + rng.nextFloat() * CONFIG.ASTEROID.SIZE_VARIATION;
    const sizeFactor = isIndestructible
      ? CONFIG.ASTEROID.INDESTRUCTIBLE_SIZE_FACTOR
      : CONFIG.ASTEROID.REGULAR_SIZE_FACTOR;
    const width = Math.max(4, Math.round(baseSize * sizeFactor));
    const height = Math.max(4, Math.round(baseSize * sizeFactor));
    const speed = game.asteroidSpeed + rng.nextFloat() * CONFIG.ASTEROID.SPEED_VARIATION;
    const minX = CONFIG.ASTEROID.HORIZONTAL_MARGIN / 2;
    const maxX = Math.max(minX, game.view.width - width - CONFIG.ASTEROID.HORIZONTAL_MARGIN / 2);
    const x = minX + rng.nextFloat() * (maxX - minX);
    let paletteOverride = null;
    if (isGolden) {
      paletteOverride = CONFIG.COLORS.ASTEROID_GOLD || null;
    } else if (isIndestructible) {
      const planets = CONFIG.COLORS.ASTEROID_PLANETS;
      if (Array.isArray(planets) && planets.length > 0) {
        const n = planets.length;
        if ((st.planetUsed.size || 0) >= n) st.planetUsed.clear();

        let idx = st.planetIndex | 0;
        for (let i = 0; i < n; i++) {
          const j = (idx + i) % n;
          if (!st.planetUsed.has(j)) {
            idx = j;
            break;
          }
        }
        paletteOverride = planets[idx];
        st.planetUsed.add(idx);
        st.planetIndex = (idx + 1) % n;
      }
    }

    const asteroid = game.asteroidPool
      ? game.asteroidPool.acquire(
          x,
          CONFIG.ASTEROID.SPAWN_Y,
          width,
          height,
          speed,
          rng,
          isIndestructible,
          paletteOverride
        )
      : new Asteroid(
          x,
          CONFIG.ASTEROID.SPAWN_Y,
          width,
          height,
          speed,
          rng,
          isIndestructible,
          paletteOverride
        );
    if (isGolden) {
      try {
        asteroid.isGolden = true;
      } catch {
        /* ignore */
      }
    }
    return asteroid;
  }

  /** Create/acquire star; cadence spawns red variant after threshold. @param {StarCreateSlice} game @returns {Star} */
  static createStar(game) {
    const rng = game.rng;
    const st = /** @type {any} */ (this.#state(game));
    const size = CONFIG.STAR.MIN_SIZE + rng.nextFloat() * CONFIG.STAR.SIZE_VARIATION;
    const width = size;
    const height = size;
    const jitter = typeof rng.range === "function" ? rng.range(0, CONFIG.STAR.SPEED_VARIATION) : 0;
    const speed = game.starSpeed + jitter;
    const minX = CONFIG.STAR.HORIZONTAL_MARGIN / 2;
    const maxX = Math.max(minX, game.view.width - width - CONFIG.STAR.HORIZONTAL_MARGIN / 2);
    const x = minX + rng.nextFloat() * (maxX - minX);
    const starThreshold = CONFIG.GAME.STAR_YELLOW_BEFORE_RED | 0 || 10;
    const count = st.yellowCount | 0;
    const isRed = count >= starThreshold;
    st.yellowCount = isRed ? 0 : count + 1;

    return game.starPool
      ? game.starPool.acquire(x, CONFIG.STAR.SPAWN_Y, width, height, speed, isRed)
      : new Star(x, CONFIG.STAR.SPAWN_Y, width, height, speed, isRed);
  }
}
