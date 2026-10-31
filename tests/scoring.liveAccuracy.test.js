// @ts-check
import { describe, it, expect } from "vitest";
import { ScoringManager } from "../js/managers/ScoringManager.js";
import { GameUI } from "../js/ui/GameUI.js";

describe("live accuracy next to the score", () => {
  it("counts regular kills plus planet bullet hits per shot, capped at 100%", () => {
    expect(ScoringManager.accuracy({})).toBe(0);
    expect(ScoringManager.accuracy({ shotsFired: 0, regularAsteroidsKilled: 3 })).toBe(0);
    const game = {
      shotsFired: 20,
      regularAsteroidsKilled: 4,
      hardenedAsteroidHitBullets: 6,
      bonusAsteroidHitBullets: 2,
    };
    expect(ScoringManager.accuracy(game)).toBe(0.5);
    expect(ScoringManager.accuracy({ shotsFired: 2, regularAsteroidsKilled: 5 })).toBe(1);
    const scored = { ...game, score: 1000 };
    expect(ScoringManager.applyAccuracyBonus(scored).accuracy).toBe(0.5);
  });

  it("shows the score with the rounded accuracy so far and skips unchanged writes", () => {
    let text = "";
    let writes = 0;
    const el = {
      get textContent() {
        return text;
      },
      set textContent(v) {
        text = v;
        writes++;
      },
    };
    const game = /** @type {any} */ ({ currentScoreEl: el, score: 4443, shotsFired: 0 });
    GameUI.setScore(game);
    expect(el.textContent).toBe("4443 | 0%");
    game.shotsFired = 3;
    game.regularAsteroidsKilled = 2;
    GameUI.setScore(game);
    expect(el.textContent).toBe("4443 | 67%");
    GameUI.setScore(game);
    expect(writes).toBe(2);
  });
});
