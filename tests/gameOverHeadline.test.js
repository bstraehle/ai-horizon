// @ts-check
import { describe, it, expect } from "vitest";
import {
  gameOverHeadline,
  headlineOutcome,
  GAME_OVER_HEADLINES,
  DEFAULT_GAME_OVER_HEADLINE,
} from "../js/ui/GameOverHeadline.js";
import { DEBRIEF_LABELS } from "../js/adapters/AIAnalysisAdapter.js";

/**
 * @param {{ survived: number, score?: number, best?: number|null, bonus?: number, accuracy?: number, locale?: string|null }} o
 */
const run = ({
  survived,
  score = 1000,
  best = 5000,
  bonus = 0,
  accuracy = 0,
  locale = "en-US",
}) => ({
  timer: { totalSeconds: 90, survivedSeconds: survived },
  score: { playerFinalScore: score, leaderBoardHighScore: best },
  stats: { bonusAsteroidsKilled: bonus, shotsFiredAccuracy: accuracy },
  device: { locale },
});

describe("headlineOutcome", () => {
  it("celebrates beating the leaderboard's top score above everything else", () => {
    expect(headlineOutcome(run({ survived: 90, score: 6000 }))).toBe("record");
    expect(headlineOutcome(run({ survived: 40, score: 6000 }))).toBe("record");
  });

  it("needs a known top score for a record", () => {
    expect(headlineOutcome(run({ survived: 40, score: 6000, best: 0 }))).toBe("down");
    expect(headlineOutcome(run({ survived: 40, score: 6000, best: null }))).toBe("down");
  });

  it("tells a commended full mission from a plain one", () => {
    expect(headlineOutcome(run({ survived: 90, bonus: 6 }))).toBe("ace");
    expect(headlineOutcome(run({ survived: 90, accuracy: 0.6 }))).toBe("ace");
    expect(headlineOutcome(run({ survived: 90 }))).toBe("survived");
  });

  it("separates going down in the finale from going down earlier", () => {
    expect(headlineOutcome(run({ survived: 75 }))).toBe("finale");
    expect(headlineOutcome(run({ survived: 89 }))).toBe("finale");
    expect(headlineOutcome(run({ survived: 74 }))).toBe("down");
    expect(headlineOutcome(run({ survived: 0, score: 0 }))).toBe("down");
  });

  it("returns null without a usable summary", () => {
    expect(headlineOutcome(null)).toBeNull();
    expect(headlineOutcome({ timer: { survivedSeconds: null } })).toBeNull();
  });
});

describe("gameOverHeadline", () => {
  it("speaks the player's language, with the lang to tag the heading", () => {
    expect(gameOverHeadline(run({ survived: 20 }))).toEqual({ text: "Ship Down", lang: "en" });
    expect(gameOverHeadline(run({ survived: 90, locale: "de-DE" }))).toEqual({
      text: "Mission abgeschlossen",
      lang: "de",
    });
    expect(gameOverHeadline(run({ survived: 80, locale: "pt_BR" }))).toEqual({
      text: "Por pouco!",
      lang: "pt",
    });
  });

  it("falls back to English for other or missing locales", () => {
    expect(gameOverHeadline(run({ survived: 20, locale: "ja-JP" }))).toEqual({
      text: "Ship Down",
      lang: "en",
    });
    expect(gameOverHeadline(run({ survived: 20, locale: null }))).toEqual({
      text: "Ship Down",
      lang: "en",
    });
  });

  it("falls back to Game Over without a usable summary", () => {
    expect(gameOverHeadline(null)).toEqual({ text: DEFAULT_GAME_OVER_HEADLINE, lang: "en" });
  });

  it("covers every outcome in every debrief language", () => {
    const outcomes = Object.keys(GAME_OVER_HEADLINES.en).sort();
    expect(Object.keys(GAME_OVER_HEADLINES).sort()).toEqual(Object.keys(DEBRIEF_LABELS).sort());
    for (const lines of Object.values(GAME_OVER_HEADLINES)) {
      expect(Object.keys(lines).sort()).toEqual(outcomes);
      for (const text of Object.values(lines)) expect(text.trim()).toBeTruthy();
    }
  });
});
