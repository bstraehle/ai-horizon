import { describe, it, expect } from "vitest";
import { ScoringManager } from "../js/managers/ScoringManager.js";
import { CONFIG } from "../js/constants.js";

describe("ScoringManager milestone bonuses", () => {
  it("adds base points under threshold with no bonus", () => {
    const game = { score: 0 };
    const r = ScoringManager.add(game, 100);
    expect(r.base).toBe(100);
    expect(r.bonusCount).toBe(0);
    expect(game.score).toBe(100);
  });

  it("awards single bonus when crossing threshold", () => {
    const game = { score: CONFIG.GAME.SCORING_BONUS_THRESHOLD - 10 };
    const r = ScoringManager.add(game, 20); // crosses once
    expect(r.bonusCount).toBe(1);
    expect(r.bonusPoints).toBe(CONFIG.GAME.SCORING_BONUS_POINTS);
    expect(game.score).toBe(
      CONFIG.GAME.SCORING_BONUS_THRESHOLD - 10 + 20 + CONFIG.GAME.SCORING_BONUS_POINTS
    );
  });

  it("awards multiple bonuses when crossing multiple thresholds in one increment", () => {
    const game = { score: 0 };
    const big = CONFIG.GAME.SCORING_BONUS_THRESHOLD * 2 + 100; // crosses two full thresholds
    const r = ScoringManager.add(game, big);
    expect(r.bonusCount).toBe(2);
    expect(r.bonusPoints).toBe(2 * CONFIG.GAME.SCORING_BONUS_POINTS);
    expect(game.score).toBe(big + 2 * CONFIG.GAME.SCORING_BONUS_POINTS);
  });

  it("awards exactly one bonus when starting mid-late into a bucket and crossing next", () => {
    const game = {
      score: CONFIG.GAME.SCORING_BONUS_THRESHOLD + (CONFIG.GAME.SCORING_BONUS_THRESHOLD - 50),
    }; // e.g., 1950 when threshold 1000
    const r = ScoringManager.add(game, 60); // cross into 2000+ territory once
    expect(r.bonusCount).toBe(1);
    expect(game.score).toBe(
      CONFIG.GAME.SCORING_BONUS_THRESHOLD +
        (CONFIG.GAME.SCORING_BONUS_THRESHOLD - 50) +
        60 +
        CONFIG.GAME.SCORING_BONUS_POINTS
    );
  });
});
