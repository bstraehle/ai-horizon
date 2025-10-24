import { describe, it, expect } from "vitest";
import { ScoringManager } from "../js/managers/ScoringManager.js";

describe("Accuracy based on hits (upgrade-aware)", () => {
  it("10 hits over 10 shots => 100%", () => {
    const game = {
      score: 1000,
      shotsFired: 10,
      regularAsteroidsKilled: 0,
      hardenedAsteroidHitBullets: 10,
    };
    const r = ScoringManager.applyAccuracyBonus(game);
    expect(r.accuracy).toBeCloseTo(1.0, 10);
    expect(r.bonus).toBe(1000);
    expect(game.score).toBe(2000);
  });

  it("partial hits reflect hit ratio directly", () => {
    const game = {
      score: 500,
      shotsFired: 8,
      regularAsteroidsKilled: 0,
      hardenedAsteroidHitBullets: 4,
    };
    const r = ScoringManager.applyAccuracyBonus(game);
    expect(r.accuracy).toBeCloseTo(0.5, 10);
    expect(r.bonus).toBe(250);
    expect(game.score).toBe(750);
  });
});
