// @ts-check
import { describe, it, expect } from "vitest";
import { ScoringManager } from "../js/managers/ScoringManager.js";
import { CONFIG } from "../js/constants.js";

/**
 * @param {number} timerRemaining
 */
function makeGame(timerRemaining) {
  return { score: 0, timerRemaining };
}

describe("Finale bonus (last N seconds) doubles base scoring", () => {
  it("applies no multiplier earlier than the finale window", () => {
    const game = makeGame(CONFIG.GAME.FINALE_BONUS_WINDOW_SECONDS + 0.01);
    const r = ScoringManager.add(game, CONFIG.GAME.ASTEROID_SCORE);
    expect(r.appliedMultiplier).toBe(1);
    expect(r.base).toBe(CONFIG.GAME.ASTEROID_SCORE);
    expect(game.score).toBe(CONFIG.GAME.ASTEROID_SCORE);
  });

  it("applies 2x within the final window (>0 remaining)", () => {
    const game = makeGame(CONFIG.GAME.FINALE_BONUS_WINDOW_SECONDS - 0.1);
    const r = ScoringManager.add(game, CONFIG.GAME.ASTEROID_SCORE);
    expect(r.appliedMultiplier).toBe(CONFIG.GAME.FINALE_BONUS_MULTIPLIER);
    expect(r.base).toBe(CONFIG.GAME.ASTEROID_SCORE * CONFIG.GAME.FINALE_BONUS_MULTIPLIER);
    expect(game.score).toBe(CONFIG.GAME.ASTEROID_SCORE * CONFIG.GAME.FINALE_BONUS_MULTIPLIER);
  });

  it("doubles hardened asteroid and red star appropriately", () => {
    const game = makeGame(1.0);
    ScoringManager.add(game, CONFIG.GAME.ASTEROID_SCORE_HARDENED);
    ScoringManager.add(game, CONFIG.GAME.STAR_SCORE_BONUS);
    expect(game.score).toBe(
      CONFIG.GAME.ASTEROID_SCORE_HARDENED * CONFIG.GAME.FINALE_BONUS_MULTIPLIER +
        CONFIG.GAME.STAR_SCORE_BONUS * CONFIG.GAME.FINALE_BONUS_MULTIPLIER
    );
  });

  it("still triggers milestone bonuses based on the incremented total", () => {
    const game = makeGame(2.0);
    // Set score to just below threshold so a doubled increment crosses it.
    game.score =
      CONFIG.GAME.SCORING_BONUS_THRESHOLD -
      CONFIG.GAME.ASTEROID_SCORE * CONFIG.GAME.FINALE_BONUS_MULTIPLIER +
      1;
    const r = ScoringManager.add(game, CONFIG.GAME.ASTEROID_SCORE);
    expect(r.bonusCount).toBeGreaterThanOrEqual(1);
  });
});
