/**
 * RNG – lightweight, seedable pseudo-random generator (mulberry32).
 *
 * Goals:
 * - Deterministic sequences for identical seeds (supports reproducible tests / replays).
 * - Zero allocations during generation (after construction).
 * - Convenience helpers (range, pick, sign) built atop a uniform float.
 *
 * Implementation & quality:
 * - Mulberry32 offers acceptable statistical quality for arcade gameplay (not cryptographically secure).
 * - Output of `nextFloat()` spans [0,1).
 *
 * Seeding options:
 * - Numeric: `new RNG(123)`.
 * - String: `RNG.fromString('seed')` (FNV‑1a hash to u32).
 * - Omitted: non‑deterministic seed (crypto if available, else hashed timestamps).
 */
export class RNG {
  /**
   * @param {number} [seed] - 32-bit unsigned seed; if omitted, a non-deterministic seed is chosen.
   */
  constructor(seed) {
    this._s = RNG._seed32(seed);
  }

  /** Create a RNG from a string (hashed to u32). */
  /** @param {string} str */
  static fromString(str) {
    let h = 2166136261 >>> 0; // FNV-1a
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return new RNG(h >>> 0);
  }

  /** Returns a float in (0, 1). */
  nextFloat() {
    let t = (this._s += 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in (0, max) */
  /** @param {number} max */
  nextInt(max) {
    return (this.nextFloat() * max) | 0;
  }

  /** Float in (min, max) */
  /** @param {number} min @param {number} max */
  range(min, max) {
    return min + (max - min) * this.nextFloat();
  }

  /** Pick a value from an array. */
  /** @template T @param {T[]} arr @returns {T} */
  pick(arr) {
    return arr[this.nextInt(arr.length)];
  }

  /** Returns -1 or 1 with equal probability. */
  sign() {
    return this.nextFloat() < 0.5 ? -1 : 1;
  }

  /** Replace the seed. */
  /** @param {number} seed */
  reseed(seed) {
    this._s = RNG._seed32(seed);
  }

  /** @param {any} seed */
  static _seed32(seed) {
    if (typeof seed === "number" && Number.isFinite(seed)) return seed >>> 0;
    // Try crypto if available for non-deterministic default
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      return buf[0] >>> 0;
    }
    // Fallback: hash time sources
    const t = (Date.now() ^ (performance && performance.now ? performance.now() : 0)) >>> 0;
    return Math.imul(t ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  }
}
