import { describe, it, expect } from "vitest";
import { ScoringManager } from "../js/managers/ScoringManager.js";

describe("ScoringManager accuracy includes bonus asteroid hits", () => {
  it("10 bonus hits over 10 shots => 100%", () => {
    const game = {
      score: 1000,
      shotsFired: 10,
      regularAsteroidsKilled: 0,
      hardenedAsteroidHitBullets: 0,
      bonusAsteroidHitBullets: 10,
    };
    const r = ScoringManager.applyAccuracyBonus(game);
    expect(r.accuracy).toBeCloseTo(1.0, 10);
    expect(r.bonus).toBe(1000);
  });

  it("mix of regular and bonus hits adds correctly", () => {
    const game = {
      score: 500,
      shotsFired: 8,
      regularAsteroidsKilled: 2,
      hardenedAsteroidHitBullets: 0,
      bonusAsteroidHitBullets: 2,
    };
    const r = ScoringManager.applyAccuracyBonus(game);
    expect(r.accuracy).toBeCloseTo(4 / 8, 10);
    expect(r.bonus).toBe(Math.round(500 * (4 / 8)));
  });
});
