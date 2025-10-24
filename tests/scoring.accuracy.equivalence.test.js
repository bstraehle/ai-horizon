import { describe, it, expect } from "vitest";
import { ScoringManager } from "../js/managers/ScoringManager.js";

describe("Accuracy based on kills (upgrade-agnostic)", () => {
  it("10 kills over 10 shots => 100%", () => {
    const game = {
      score: 1000,
      shotsFired: 10,
      regularAsteroidsKilled: 0,
      hardenedAsteroidsKilled: 10,
    };
    const r = ScoringManager.applyAccuracyBonus(game);
    expect(r.accuracy).toBeCloseTo(1.0, 10);
    expect(r.bonus).toBe(1000);
    expect(game.score).toBe(2000);
  });

  it("partial kills reflect kill ratio directly", () => {
    const game = {
      score: 500,
      shotsFired: 8,
      regularAsteroidsKilled: 0,
      hardenedAsteroidsKilled: 4,
    };
    const r = ScoringManager.applyAccuracyBonus(game);
    expect(r.accuracy).toBeCloseTo(0.5, 10);
    expect(r.bonus).toBe(250);
    expect(game.score).toBe(750);
  });
});
