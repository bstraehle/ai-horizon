import { describe, it, expect } from "vitest";
import { ScoringManager } from "../js/managers/ScoringManager.js";

function makeGame({
  score = 0,
  shotsFired = 0,
  regularAsteroidsKilled = 0,
  hardenedAsteroidsKilled = 0,
  hardenedAsteroidHitBullets = 0,
} = {}) {
  return {
    score,
    shotsFired,
    regularAsteroidsKilled,
    hardenedAsteroidsKilled,
    hardenedAsteroidHitBullets,
  };
}

describe("ScoringManager.applyAccuracyBonus", () => {
  it("applies no bonus when shots=0", () => {
    const game = makeGame({ score: 1000, shotsFired: 0, regularAsteroidsKilled: 0 });
    const r = ScoringManager.applyAccuracyBonus(game);
    expect(r.applied).toBe(false);
    expect(game.score).toBe(1000);
  });

  it("applies bonus when shots>0 and accuracy>0", () => {
    const game = makeGame({ score: 1000, shotsFired: 10, regularAsteroidsKilled: 7 });
    const { bonus, accuracy, newScore } = ScoringManager.applyAccuracyBonus(game);
    expect(Math.abs(accuracy - 0.7)).toBeLessThan(1e-9);
    expect(bonus).toBe(700);
    expect(newScore).toBe(1700);
  });

  it("counts hardened bullets as hits", () => {
    const game = makeGame({
      score: 1000,
      shotsFired: 10,
      regularAsteroidsKilled: 2,
      hardenedAsteroidHitBullets: 8,
    });
    const r = ScoringManager.applyAccuracyBonus(game);
    expect(r.accuracy).toBe(1.0);
    expect(r.bonus).toBe(1000);
  });

  it("caps accuracy at 100%", () => {
    const game = makeGame({ score: 1000, shotsFired: 4, regularAsteroidsKilled: 4 });
    const r = ScoringManager.applyAccuracyBonus(game);
    expect(r.accuracy).toBe(1.0);
    expect(r.bonus).toBe(1000);
  });

  it("is idempotent (second call no extra bonus)", () => {
    const game = makeGame({ score: 1000, shotsFired: 4, regularAsteroidsKilled: 4 });
    const first = ScoringManager.applyAccuracyBonus(game);
    const second = ScoringManager.applyAccuracyBonus(game);
    expect(first.bonus).toBe(1000);
    expect(second.applied).toBe(false);
    expect(game.score).toBe(2000);
  });
});
