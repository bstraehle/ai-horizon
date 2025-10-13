import { describe, it, expect } from "vitest";
import { ScoringManager } from "../js/managers/ScoringManager.js";

describe("ScoringManager hardened + regular mixed accuracy", () => {
  it("computes full hardened kills plus fractional remainder correctly", () => {
    const game = {
      score: 1000,
      shotsFired: 18,
      asteroidsKilled: 1,
      hardenedAsteroidsKilled: 1,
      hardenedAsteroidHitBullets: 13,
    };
    const r = ScoringManager.applyAccuracyBonus(game);
    const expectedAccuracy = 14 / 18;
    expect(r.accuracy).toBeCloseTo(expectedAccuracy, 10);
    expect(r.bonus).toBe(Math.round(1000 * expectedAccuracy));
  });
});
