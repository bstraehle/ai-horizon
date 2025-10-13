import { describe, it, expect } from "vitest";
import { ScoringManager } from "../js/managers/ScoringManager.js";

function makeGame({
  score = 0,
  shotsFired = 0,
  asteroidsKilled = 0,
  hardenedAsteroidsKilled = 0,
  hardenedAsteroidHitBullets = 0,
} = {}) {
  return {
    score,
    shotsFired,
    asteroidsKilled,
    hardenedAsteroidsKilled,
    hardenedAsteroidHitBullets,
  };
}

describe("ScoringManager.applyAccuracyBonus", () => {
  it("applies no bonus when no shots fired", () => {
    const game = makeGame({ score: 1000, shotsFired: 0, asteroidsKilled: 0 });
    const r = ScoringManager.applyAccuracyBonus(game);
    expect(r.bonus).toBe(0);
    expect(game.score).toBe(1000);
  });

  it("applies proportional bonus based on accuracy", () => {
    const game = makeGame({ score: 1000, shotsFired: 10, asteroidsKilled: 7 });
    const { bonus, accuracy, newScore } = ScoringManager.applyAccuracyBonus(game);
    expect(Math.abs(accuracy - 0.7)).toBeLessThan(1e-9);
    expect(bonus).toBe(700);
    expect(newScore).toBe(1700);
  });

  it("counts every hardened bullet hit (per-bullet accuracy model)", () => {
    const game = makeGame({
      score: 500,
      shotsFired: 5,
      asteroidsKilled: 2,
      hardenedAsteroidHitBullets: 10,
    });
    const { bonus, accuracy, newScore } = ScoringManager.applyAccuracyBonus(game);
    expect(accuracy).toBeCloseTo(1.0, 10);
    expect(bonus).toBe(500);
    expect(newScore).toBe(1000);
  });

  it("is idempotent (second call no extra bonus)", () => {
    const game = makeGame({ score: 1000, shotsFired: 4, asteroidsKilled: 4 });
    const first = ScoringManager.applyAccuracyBonus(game);
    const second = ScoringManager.applyAccuracyBonus(game);
    expect(first.bonus).toBe(1000);
    expect(second.applied).toBe(false);
    expect(game.score).toBe(2000);
  });
});
