// @ts-check
import { describe, it, expect } from "vitest";
import {
  gameOverHeadline,
  GAME_OVER_HEADLINES,
  DEFAULT_GAME_OVER_HEADLINE,
} from "../js/ui/GameOverHeadline.js";

/**
 * @param {{ survived: number, score?: number, best?: number|null, bonus?: number, accuracy?: number }} o
 */
const run = ({ survived, score = 1000, best = 5000, bonus = 0, accuracy = 0 }) => ({
  timer: { totalSeconds: 90, survivedSeconds: survived },
  score: { playerFinalScore: score, leaderBoardHighScore: best },
  stats: { bonusAsteroidsKilled: bonus, shotsFiredAccuracy: accuracy },
});

/** @param {string} headline */
const outcomeOf = (headline) =>
  Object.entries(GAME_OVER_HEADLINES).find(([, lines]) => lines.includes(headline))?.[0];

describe("gameOverHeadline", () => {
  it("celebrates beating the leaderboard's top score above everything else", () => {
    expect(outcomeOf(gameOverHeadline(run({ survived: 90, score: 6000 })))).toBe("record");
    expect(outcomeOf(gameOverHeadline(run({ survived: 40, score: 6000 })))).toBe("record");
  });

  it("needs a known top score for a record", () => {
    expect(outcomeOf(gameOverHeadline(run({ survived: 40, score: 6000, best: 0 })))).toBe("down");
    expect(outcomeOf(gameOverHeadline(run({ survived: 40, score: 6000, best: null })))).toBe(
      "down"
    );
  });

  it("tells a commended full mission from a plain one", () => {
    expect(outcomeOf(gameOverHeadline(run({ survived: 90, bonus: 6 })))).toBe("ace");
    expect(outcomeOf(gameOverHeadline(run({ survived: 90, accuracy: 0.6 })))).toBe("ace");
    expect(outcomeOf(gameOverHeadline(run({ survived: 90 })))).toBe("survived");
  });

  it("separates going down in the finale from going down earlier", () => {
    expect(outcomeOf(gameOverHeadline(run({ survived: 75 })))).toBe("finale");
    expect(outcomeOf(gameOverHeadline(run({ survived: 89 })))).toBe("finale");
    expect(outcomeOf(gameOverHeadline(run({ survived: 74 })))).toBe("down");
    expect(outcomeOf(gameOverHeadline(run({ survived: 0, score: 0 })))).toBe("down");
  });

  it("varies the line with the score but repeats it for the same score", () => {
    const lines = new Set(
      [1000, 1001, 1002].map((score) => gameOverHeadline(run({ survived: 20, score })))
    );
    expect(lines.size).toBe(GAME_OVER_HEADLINES.down.length);
    expect(gameOverHeadline(run({ survived: 20, score: 1234 }))).toBe(
      gameOverHeadline(run({ survived: 20, score: 1234 }))
    );
  });

  it("falls back to Game Over without a usable summary", () => {
    expect(gameOverHeadline(null)).toBe(DEFAULT_GAME_OVER_HEADLINE);
    expect(gameOverHeadline({ timer: { survivedSeconds: null } })).toBe(DEFAULT_GAME_OVER_HEADLINE);
  });
});
