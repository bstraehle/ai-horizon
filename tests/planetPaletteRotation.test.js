// @ts-check
import { describe, it, expect } from "vitest";
import { SpawnManager } from "../js/managers/SpawnManager.js";
import { CONFIG } from "../js/constants.js";

function makeRng() {
  return {
    _i: 0,
    nextFloat() {
      this._i = (this._i + 0.37) % 1;
      return this._i;
    },
    /**
     * @param {number} a
     * @param {number} _b
     */
    range(a, _b) {
      return a;
    },
  };
}

function makeGame() {
  const rng = makeRng();
  /** @type {any} */
  const g = {
    rng,
    view: { width: 300, height: 300 },
    asteroidSpeed: 100,
    starSpeed: 50,
    asteroidPool: null,
    starPool: null,
    asteroids: [],
    stars: [],
  };
  return g;
}

describe("Planet palette rotation", () => {
  it("cycles through all planet palettes without repetition until exhausted", () => {
    const g = makeGame();
    // Create hardened asteroids until we've collected one per palette
    const n = (CONFIG.COLORS.ASTEROID_HARDENED || []).length || 0;
    const names = [];
    const maxIter = 200; // safety cap to avoid infinite loop
    let iter = 0;
    while (names.length < n && iter < maxIter) {
      const a = SpawnManager.createAsteroid(g);
      g.asteroids.push(a);
      if (a.isHardened) {
        names.push(a._palette && a._palette.NAME);
      }
      iter++;
    }
    // Expect we gathered one palette per planet and they are unique
    const unique = new Set(names.filter(Boolean));
    expect(names.length).toBe(n);
    expect(unique.size).toBe(n);
  });
});
