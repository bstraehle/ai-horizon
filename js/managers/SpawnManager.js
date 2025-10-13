import { CONFIG } from "../constants.js";
import { BackgroundManager } from "./BackgroundManager.js";
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
 * @property {number} [starsSpawned]
 * @property {number} [bonusStarsSpawned]
 * @property {number} [asteroidsSpawned]
 * @property {number} [bonusAsteroidsSpawned]
 * @property {number} [hardenedAsteroidsSpawned]
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
 * Tracks cadence counters (hardened asteroids, red stars) and supports pools.
 * Per-game state isolated in WeakMap (no surface mutations).
 */
/**
 * Per-game spawn state:
 * @typedef {{
 *   yellowCount: number,
 *   normalAsteroidCount: number,
 *   planetIndex: number,
 *   planetUsed: Set<number>,
 *   bonusSpawned: number,
 *   nextBonusTimeSec: number,
 *   startTimeSec: number
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
        bonusSpawned: 0,
        nextBonusTimeSec: CONFIG.GAME.BONUS_INTERVAL_SECONDS | 0 || 15,
        startTimeSec:
          typeof (/** @type {any} */ (game).timeSec) === "number"
            ? Math.max(0, /** @type {any} */ (game).timeSec)
            : 0,
      };
      this.#STATE.set(game, st);
    }
    return st;
  }

  /** Reset per-game spawn cadence/palette state. @param {object} game */
  static reset(game) {
    const interval = CONFIG.GAME.BONUS_INTERVAL_SECONDS | 0 || 15;
    const currentSec =
      typeof (/** @type {any} */ (game).timeSec) === "number"
        ? Math.max(0, /** @type {any} */ (game).timeSec)
        : 0;
    const st = {
      yellowCount: 0,
      normalAsteroidCount: 0,
      planetIndex: 0,
      planetUsed: new Set(),
      bonusSpawned: 0,
      nextBonusTimeSec: interval,
      startTimeSec: currentSec,
    };
    this.#STATE.set(game, st);
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
    if (rng.nextFloat() < pAst) {
      const asteroid = this.createAsteroid(game);
      game.asteroids.push(asteroid);
      try {
        game.asteroidsSpawned = (game.asteroidsSpawned || 0) + 1;
        if (asteroid && asteroid.isBonus) {
          game.bonusAsteroidsSpawned = (game.bonusAsteroidsSpawned || 0) + 1;
        }
        if (asteroid && asteroid.isHardened) {
          game.hardenedAsteroidsSpawned = (game.hardenedAsteroidsSpawned || 0) + 1;
        }
      } catch {
        /* stats optional */
      }
    }
    if (rng.nextFloat() < pStar) {
      const star = this.createStar(game);
      game.stars.push(star);
      try {
        game.starsSpawned = (game.starsSpawned || 0) + 1;
        if (star && star.isRed) {
          game.bonusStarsSpawned = (game.bonusStarsSpawned || 0) + 1;
        }
      } catch {
        /* stats optional */
      }
    }
  }

  /** Create/acquire asteroid; manages cadence for hardened variant + palette cycling. @param {AsteroidCreateSlice} game @returns {Asteroid} */
  static createAsteroid(game) {
    const rng = game.rng;
    const st = /** @type {any} */ (this.#state(game));
    const asteroidThreshold = CONFIG.GAME.ASTEROID_NORMAL_BEFORE_HARDENED | 0 || 10;
    const count = st.normalAsteroidCount | 0;
    let isHardened = count >= asteroidThreshold;
    let isBonus = false;
    if (isHardened) {
      const maxBonus = CONFIG.GAME.BONUS_ASTEROID_COUNT | 0;
      const interval = CONFIG.GAME.BONUS_INTERVAL_SECONDS | 0 || 15;
      if (maxBonus > 0 && st.bonusSpawned < maxBonus && interval > 0) {
        const currentSec = typeof game.timeSec === "number" ? Math.max(0, game.timeSec) : 0;
        const start = st.startTimeSec | 0;
        const elapsed = Math.max(0, currentSec - start);
        if (elapsed >= (st.nextBonusTimeSec | 0)) {
          isBonus = true;
          st.bonusSpawned++;
          let next = st.nextBonusTimeSec | 0;
          do {
            next += interval;
          } while (next <= elapsed);
          st.nextBonusTimeSec = next;
        }
      }
    }
    st.normalAsteroidCount = isHardened ? 0 : count + 1;

    const baseSize = CONFIG.ASTEROID.MIN_SIZE + rng.nextFloat() * CONFIG.ASTEROID.SIZE_VARIATION;
    const sizeFactor = isHardened
      ? CONFIG.ASTEROID.HARDENED_SIZE_FACTOR
      : CONFIG.ASTEROID.REGULAR_SIZE_FACTOR;
    const width = Math.max(4, Math.round(baseSize * sizeFactor));
    const height = Math.max(4, Math.round(baseSize * sizeFactor));
    const speed = game.asteroidSpeed + rng.nextFloat() * CONFIG.ASTEROID.SPEED_VARIATION;
    const minX = CONFIG.ASTEROID.HORIZONTAL_MARGIN / 2;
    const maxX = Math.max(minX, game.view.width - width - CONFIG.ASTEROID.HORIZONTAL_MARGIN / 2);
    const x = minX + rng.nextFloat() * (maxX - minX);
    let paletteOverride = null;
    if (isBonus) {
      const nebulaPalette = BackgroundManager.getCurrentNebulaPalette();
      const useBlue = nebulaPalette === "blue";
      paletteOverride = useBlue ? CONFIG.COLORS.ASTEROID_BLUE : CONFIG.COLORS.ASTEROID_RED;
    } else if (isHardened) {
      const planets = CONFIG.COLORS.ASTEROID_HARDENED;
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
          isHardened,
          paletteOverride
        )
      : new Asteroid(
          x,
          CONFIG.ASTEROID.SPAWN_Y,
          width,
          height,
          speed,
          rng,
          isHardened,
          paletteOverride
        );
    if (isBonus) {
      try {
        asteroid.isBonus = true;
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
    const starThreshold = CONFIG.GAME.STAR_NORMAL_BEFORE_BONUS | 0 || 10;
    const count = st.yellowCount | 0;
    const isRed = count >= starThreshold;
    st.yellowCount = isRed ? 0 : count + 1;

    return game.starPool
      ? game.starPool.acquire(x, CONFIG.STAR.SPAWN_Y, width, height, speed, isRed)
      : new Star(x, CONFIG.STAR.SPAWN_Y, width, height, speed, isRed);
  }
}
