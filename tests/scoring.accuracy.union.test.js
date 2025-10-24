import { describe, it, expect } from "vitest";
import { ScoringManager } from "../js/managers/ScoringManager.js";

// Guard against double-counting bonus hits (subset of hardened hits)
describe("ScoringManager accuracy union(hardened, bonus) no double-count", () => {
  it("treats bonus hits as subset of hardened hits (union via max)", () => {
    const game = {
      score: 1000,
      shotsFired: 10,
      regularAsteroidsKilled: 0,
      hardenedAsteroidHitBullets: 10,
      bonusAsteroidHitBullets: 10, // also counted in hardened
    };
    const r = ScoringManager.applyAccuracyBonus(game);
    expect(r.accuracy).toBeCloseTo(1.0, 10);
    expect(r.bonus).toBe(1000);
    expect(game.score).toBe(2000);
  });

  it("uses max(hardened, bonus) when both present (e.g., hardened=6, bonus=4 => 6 unique hits)", () => {
    const game = {
      score: 500,
      shotsFired: 10,
      regularAsteroidsKilled: 0,
      hardenedAsteroidHitBullets: 6,
      bonusAsteroidHitBullets: 4,
    };
    const r = ScoringManager.applyAccuracyBonus(game);
    expect(r.accuracy).toBeCloseTo(0.6, 10);
    expect(r.bonus).toBe(Math.round(500 * 0.6));
    expect(game.score).toBe(500 + Math.round(500 * 0.6));
  });
});
