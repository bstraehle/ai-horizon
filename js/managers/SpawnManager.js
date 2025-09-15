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
 * SpawnManager – probabilistic entity factory for asteroids & collectible stars.
 *
 * Responsibilities:
 * - Convert configured per‑second spawn rates into per‑tick Bernoulli trials using a Poisson process approximation:
 *     p(spawn in dt) = 1 - exp(-lambda * dt)
 * - Track cadence counters enabling rarer variants:
 *     - Indestructible (planet) asteroids after N normal spawns.
 *     - Red bonus stars after M yellow stars.
 * - Provide deterministic output when supplied a seeded RNG.
 * - Support object pools seamlessly (acquire vs new) without leaking pool semantics to callers.
 *
 * Design notes:
 * - Per‑game spawn state stored in a WeakMap keyed by the game instance: avoids mutating the game object surface.
 * - Planet palette selection cycles through available themes non‑repetitively before repeating.
 */
/**
 * Per-game spawn state:
 * @typedef {{
 *   yellowCount: number,
 *   normalAsteroidCount: number,
 *   planetIndex: number,
 *   planetUsed: Set<number>
 * }} SpawnState
 */
export class SpawnManager {
  /** @type {WeakMap<object, SpawnState>} */
  static #STATE = new WeakMap();

  /**
   * Get or create per-game spawn counters.
   * @param {object} game
   */
  static #state(game) {
    let st = this.#STATE.get(game);
    if (!st) {
      // normalAsteroidCount: cadence counter for indestructible spawns
      // yellowCount: cadence counter for red stars
      // planetIndex: next index in ASTEROID_PLANETS to use
      // planetUsed: Set<number> indexes used in current cycle
      st = { yellowCount: 0, normalAsteroidCount: 0, planetIndex: 0, planetUsed: new Set() };
      this.#STATE.set(game, st);
    }
    return st;
  }

  /**
   * Reset spawn counters for the given game instance.
   * Safe to call at start/reset.
   * @param {object} game
   */
  static reset(game) {
    this.#STATE.delete(game);
  }
  /**
   * Randomly spawn asteroids and collectible stars.
   * @param {SpawnGameSlice} game - Minimal game slice.
   * @param {number} [dtSec=CONFIG.TIME.DEFAULT_DT] - Delta time in seconds for this update tick.
   * @returns {void}
   */
  static spawnObjects(game, dtSec) {
    const dt = typeof dtSec === "number" ? dtSec : CONFIG.TIME.DEFAULT_DT;
    const rng = game.rng;
    // Prefer platform-specific spawn rates when the game object provides
    // a mobile hint. Fall back to the legacy global rates for tests and
    // callers that don't include the flag.
    const isMobile = typeof game._isMobile === "boolean" ? game._isMobile : null;
    const asteroidRate =
      isMobile === true
        ? CONFIG.GAME.ASTEROID_SPAWN_RATE_MOBILE
        : isMobile === false
          ? CONFIG.GAME.ASTEROID_SPAWN_RATE_DESKTOP
          : CONFIG.GAME.ASTEROID_SPAWN_RATE;
    const starRate =
      isMobile === true
        ? CONFIG.GAME.STAR_SPAWN_RATE_MOBILE
        : isMobile === false
          ? CONFIG.GAME.STAR_SPAWN_RATE_DESKTOP
          : CONFIG.GAME.STAR_SPAWN_RATE;

    const pAst = 1 - Math.exp(-asteroidRate * dt);
    const pStar = 1 - Math.exp(-starRate * dt);
    if (rng.nextFloat() < pAst) game.asteroids.push(this.createAsteroid(game));
    if (rng.nextFloat() < pStar) game.stars.push(this.createStar(game));
  }

  /**
   * Create a new asteroid using game state for dimensions and speeds.
   * @param {AsteroidCreateSlice} game
   * @returns {Asteroid}
   */
  static createAsteroid(game) {
    const rng = game.rng;
    const st = /** @type {any} */ (this.#state(game));
    // Determine indestructible asteroid cadence from config before selecting sizes
    const asteroidThreshold = CONFIG.GAME.ASTEROID_NORMAL_BEFORE_INDESTRUCTIBLE | 0 || 10;
    const count = st.normalAsteroidCount | 0;
    const isIndestructible = count >= asteroidThreshold;
    st.normalAsteroidCount = isIndestructible ? 0 : count + 1;

    // Base size then apply size factor depending on type
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
    // If this is an indestructible asteroid, pick the next planet palette in a sequential
    // non-repeating cycle per game instance. We track usage with a bitmask and an index.
    let paletteOverride = null;
    if (isIndestructible) {
      const planets = CONFIG.COLORS.ASTEROID_PLANETS;
      if (Array.isArray(planets) && planets.length > 0) {
        const n = planets.length;
        // If all used in this cycle, reset the set
        if ((st.planetUsed.size || 0) >= n) st.planetUsed.clear();

        // Find next unused starting from planetIndex
        let idx = st.planetIndex | 0;
        for (let i = 0; i < n; i++) {
          const j = (idx + i) % n;
          if (!st.planetUsed.has(j)) {
            idx = j;
            break;
          }
        }
        paletteOverride = planets[idx];
        // Mark used
        st.planetUsed.add(idx);
        // Advance planetIndex for next time
        st.planetIndex = (idx + 1) % n;
      }
    }

    return game.asteroidPool
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
  }

  /**
   * Create a new collectible star using game state for dimensions and speeds.
   * @param {StarCreateSlice} game
   * @returns {Star}
   */
  static createStar(game) {
    const rng = game.rng;
    const st = /** @type {any} */ (this.#state(game));
    const size = CONFIG.STAR.MIN_SIZE + rng.nextFloat() * CONFIG.STAR.SIZE_VARIATION;
    const width = size;
    const height = size;
    // rng.range may be unavailable on foreign RNGLike implementations; guard it.
    const jitter = typeof rng.range === "function" ? rng.range(0, CONFIG.STAR.SPEED_VARIATION) : 0;
    const speed = game.starSpeed + jitter;
    const minX = CONFIG.STAR.HORIZONTAL_MARGIN / 2;
    const maxX = Math.max(minX, game.view.width - width - CONFIG.STAR.HORIZONTAL_MARGIN / 2);
    const x = minX + rng.nextFloat() * (maxX - minX);
    // Determine if this star should be a red bonus star
    // Determine red star cadence from config (number of yellow stars before a red appears).
    const starThreshold = CONFIG.GAME.STAR_YELLOW_BEFORE_RED | 0 || 10;
    const count = st.yellowCount | 0;
    const isRed = count >= starThreshold;
    // Track yellows: after `starThreshold` yellows, spawn one red and reset
    st.yellowCount = isRed ? 0 : count + 1;

    return game.starPool
      ? game.starPool.acquire(x, CONFIG.STAR.SPAWN_Y, width, height, speed, isRed)
      : new Star(x, CONFIG.STAR.SPAWN_Y, width, height, speed, isRed);
  }
}
