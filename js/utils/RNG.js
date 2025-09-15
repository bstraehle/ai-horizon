/**
 * RNG – lightweight, seedable pseudo-random number generator using mulberry32 core.
 *
 * Purpose
 * -------
 * Provide deterministic, reproducible random sequences for gameplay systems (spawning, variation,
 * particle jitter) without incurring allocations or depending on global Math.random. Supports
 * fixed seeds (test determinism) and convenient string hashing for human-friendly seeds.
 *
 * Algorithm
 * ---------
 * mulberry32: Fast, 32-bit state PRNG with acceptable distribution for arcade gameplay (NOT
 * cryptographically secure). Produces uniformly distributed floats in [0, 1).
 *
 * Seeding Modes
 * -------------
 * - Numeric: new RNG(123) — exact 32-bit seed.
 * - String: RNG.fromString('level-1') — FNV-1a hashed into 32-bit unsigned integer.
 * - Omitted / Non-numeric: Attempts secure entropy via crypto.getRandomValues; falls back to
 *   hashed timestamp mixing if unavailable.
 *
 * Determinism
 * -----------
 * Identical seeds yield identical sequences across platforms (bitwise operations defined). All
 * helper methods derive solely from nextFloat's output ensuring consistent streams.
 *
 * Methods & Bounds
 * ----------------
 * - nextFloat(): [0, 1) (never returns 1.0).
 * - nextInt(max): [0, max) integer (floor of float * max).
 * - range(min, max): [min, max) float.
 * - pick(array): Uniform element from array (throws if array empty indirectly via undefined access).
 * - sign(): Returns -1 or 1 with equal 0.5 probability.
 * - reseed(seed): Reset internal state to a new sequence.
 *
 * Failure Modes / Notes
 * ---------------------
 * - Supplying non-finite numeric seed coerces to non-deterministic path.
 * - Empty array to pick() returns undefined (caller responsibility to validate).
 * - Not suitable for fairness-critical or security-sensitive randomness.
 */
export class RNG {
  /**
   * Construct an RNG instance.
   * @param {number} [seed] Optional 32-bit unsigned seed; if omitted, a non-deterministic seed is chosen.
   */
  constructor(seed) {
    this._s = RNG._seed32(seed);
  }

  /**
   * Create an RNG from a string seed (FNV-1a hash -> u32).
   * @param {string} str
   * @returns {RNG}
   */
  static fromString(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return new RNG(h >>> 0);
  }

  /**
   * Next uniform float in [0, 1).
   * @returns {number}
   */
  nextFloat() {
    let t = (this._s += 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Integer in [0, max).
   * @param {number} max Exclusive upper bound (must be > 0 for meaningful output).
   * @returns {number}
   */
  nextInt(max) {
    return (this.nextFloat() * max) | 0;
  }

  /**
   * Float in [min, max).
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  range(min, max) {
    return min + (max - min) * this.nextFloat();
  }

  /**
   * Uniformly pick an element from an array.
   * @template T
   * @param {T[]} arr Non-empty array.
   * @returns {T}
   */
  pick(arr) {
    return arr[this.nextInt(arr.length)];
  }

  /**
   * Return -1 or 1 with 50% probability each.
   * @returns {1|-1}
   */
  sign() {
    return this.nextFloat() < 0.5 ? -1 : 1;
  }

  /**
   * Replace the current seed, restarting the sequence.
   * @param {number} seed New numeric seed.
   */
  reseed(seed) {
    this._s = RNG._seed32(seed);
  }

  /**
   * Internal 32-bit seed normalization helper.
   * @param {any} seed
   * @returns {number}
   * @private
   */
  static _seed32(seed) {
    if (typeof seed === "number" && Number.isFinite(seed)) return seed >>> 0;
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      return buf[0] >>> 0;
    }
    const t = (Date.now() ^ (performance && performance.now ? performance.now() : 0)) >>> 0;
    return Math.imul(t ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  }
}
