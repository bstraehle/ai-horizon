// @ts-check
import { describe, it, expect } from "vitest";
import { SpawnManager } from "../js/managers/SpawnManager.js";

function makeGame(rng) {
  return {
    rng,
    view: { width: 300, height: 300 },
    asteroidSpeed: 100,
    starSpeed: 50,
    asteroidPool: null,
    starPool: null,
    asteroids: [],
    stars: [],
  };
}

describe("SpawnManager counters", () => {
  it("creates hardened asteroid every 11th asteroid", () => {
    const rng = { nextFloat: () => 0.0, range: (a, _b) => a };
    const g = makeGame(rng);

    // Create 12 asteroids via direct createAsteroid (bypass spawn probability)
    const results = [];
    for (let i = 0; i < 12; i++) {
      results.push(SpawnManager.createAsteroid(g));
    }

    const hardened = /** @type {any[]} */ (results).filter((a) => a.isHardened);
    // With the lowered threshold expect multiple hardened asteroids in 12 spawns
    expect(hardened.length).toBeGreaterThanOrEqual(2);
  });

  it("creates a red star after 10 yellow stars", () => {
    const rng = { nextFloat: () => 0.0, range: (a, _b) => a };
    const g = makeGame(rng);

    const results = [];
    for (let i = 0; i < 12; i++) results.push(SpawnManager.createStar(g));

    const red = results.filter((s) => s.isRed);
    // With the lowered yellow-before-red cadence, expect at least two red stars in 12 spawns
    expect(red.length).toBeGreaterThanOrEqual(2);
  });
});
