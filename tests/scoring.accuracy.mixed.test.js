import { describe, it, expect } from "vitest";
import { ScoringManager } from "../js/managers/ScoringManager.js";

describe("ScoringManager hardened + regular mixed accuracy", () => {
  it("combines regular + hardened kills correctly", () => {
    const game = {
      score: 1000,
      shotsFired: 10,
      regularAsteroidsKilled: 1,
      hardenedAsteroidsKilled: 1,
    };
    const r = ScoringManager.applyAccuracyBonus(game);
    const expectedAccuracy = 2 / 10;
    expect(r.accuracy).toBeCloseTo(expectedAccuracy, 10);
    expect(r.bonus).toBe(Math.round(1000 * expectedAccuracy));
  });
});
