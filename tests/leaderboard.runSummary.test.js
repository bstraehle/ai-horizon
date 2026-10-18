import { describe, expect, it, vi } from "vitest";
import { CONFIG } from "../js/constants.js";

vi.mock("@aws-sdk/client-dynamodb", () => ({ DynamoDBClient: class {} }));
vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: () => ({ send: vi.fn() }) },
  GetCommand: class {},
  UpdateCommand: class {},
}));
vi.mock("@aws-sdk/client-sns", () => ({ SNSClient: class {}, PublishCommand: class {} }));

const { RULES, checkRunSummary } = await import("../server/lambda/leaderboard.js");

/** Real production run (desktop, full 90 s, finale bonus, 9 milestones), device data removed. */
const REAL_RUN = {
  timestamp: "2026-10-18T17:36:02.936Z",
  timer: {
    totalSeconds: 90,
    survivedSeconds: 90,
    missedSeconds: 0,
    totalSecondsFinale: 15,
    survivedSecondsFinale: 15,
    missedSecondsFinale: 0,
  },
  score: {
    playerBaseScore: 9275,
    playerAccuracyBonus: 5136,
    playerBaseScoreFinale: 1225,
    playerFinaleBonus: 1225,
    playerFinalScore: 14411,
    leaderBoardHighScore: 12947,
    differencePlayerFinalScoreToLeaderBoardHighScore: -1464,
  },
  stats: {
    regularStarsEncountered: 172,
    regularStarsCollected: 48,
    regularStarsCollectedAccuracy: 0.28,
    bonusStarsEncountered: 34,
    bonusStarsCollected: 22,
    bonusStarsCollectedAccuracy: 0.65,
    regularAsteroidsEncountered: 350,
    regularAsteroidsKilled: 50,
    regularAsteroidsKilledAccuracy: 0.14,
    hardenedAsteroidsEncountered: 70,
    hardenedAsteroidsKilled: 25,
    hardenedAsteroidsKilledAccuracy: 0.36,
    bonusAsteroidsEncountered: 8,
    bonusAsteroidsKilled: 7,
    bonusAsteroidsKilledAccuracy: 0.88,
    shotsFiredTotal: 419,
    shotsFiredHitTarget: 232,
    shotsFiredAccuracy: 0.55,
  },
};

/**
 * @param {(run: any) => void} [tamper]
 * @param {number} [score]
 */
function entry(tamper, score = 14411) {
  const run = structuredClone(REAL_RUN);
  if (tamper) tamper(run);
  return { id: "BJS", score, accuracy: 232 / 419, "game-summary": JSON.stringify(run) };
}

describe("leaderboard run-summary check", () => {
  it("mirrors the game's scoring and spawn rules from js/constants.js", () => {
    const G = CONFIG.GAME;
    expect(RULES).toEqual({
      TIMER_SECONDS: G.TIMER_SECONDS,
      FINALE_WINDOW_SECONDS: G.FINALE_BONUS_WINDOW_SECONDS,
      STAR_SCORE: G.STAR_SCORE,
      STAR_SCORE_BONUS: G.STAR_SCORE_BONUS,
      ASTEROID_SCORE: G.ASTEROID_SCORE,
      ASTEROID_SCORE_HARDENED: G.ASTEROID_SCORE_HARDENED,
      ASTEROID_SCORE_BONUS: G.ASTEROID_SCORE_BONUS,
      MILESTONE_THRESHOLD: G.SCORING_BONUS_THRESHOLD,
      MILESTONE_POINTS: G.SCORING_BONUS_POINTS,
      SHOT_COOLDOWN_MS: G.SHOT_COOLDOWN,
      HARDENED_HITS: CONFIG.ASTEROID.HARDENED_HITS,
      UPGRADED_HITS_FACTOR: G.BULLET_UPGRADE_HARDENED_HITS_FACTOR,
      STAR_SPAWN_RATE_MAX: Math.max(
        G.STAR_SPAWN_RATE,
        G.STAR_SPAWN_RATE_DESKTOP,
        G.STAR_SPAWN_RATE_MOBILE
      ),
      ASTEROID_SPAWN_RATE_MAX: Math.max(
        G.ASTEROID_SPAWN_RATE,
        G.ASTEROID_SPAWN_RATE_DESKTOP,
        G.ASTEROID_SPAWN_RATE_MOBILE
      ),
      STARS_BEFORE_BONUS: G.STAR_NORMAL_BEFORE_BONUS,
      ASTEROIDS_BEFORE_HARDENED: G.ASTEROID_NORMAL_BEFORE_HARDENED,
      BONUS_ASTEROID_COUNT: G.BONUS_ASTEROID_COUNT,
      BONUS_INTERVAL_SECONDS: G.BONUS_INTERVAL_SECONDS,
    });
  });

  it("accepts a real run whose stats add up to the score", () => {
    expect(checkRunSummary(entry())).toBeNull();
  });

  it.each([
    ["missing summary", "missing run summary", () => ({ id: "BJS", score: 14411 })],
    ["edited score", "score does not match summary", () => entry(undefined, 14412)],
    [
      "edited summary total",
      "score does not match summary",
      () => entry((r) => (r.score.playerFinalScore = 99999)),
    ],
    [
      "extra collected star",
      "base score does not match stats",
      () => entry((r) => (r.stats.regularStarsCollected += 1)),
    ],
    [
      "inflated base score",
      "base score does not match stats",
      () => entry((r) => (r.score.playerBaseScore += 250)),
    ],
    [
      "inflated accuracy bonus",
      "accuracy bonus",
      () => entry((r) => (r.score.playerAccuracyBonus += 100)),
    ],
    [
      "finale bonus not matching finale base",
      "finale bonus",
      () => entry((r) => (r.score.playerFinaleBonus += 25)),
    ],
    [
      "more kills than spawns",
      "asteroid counts",
      () => entry((r) => (r.stats.bonusAsteroidsKilled = 9)),
    ],
    [
      "shots beyond the fire cooldown",
      "too many shots",
      () => entry((r) => (r.stats.shotsFiredTotal = 600)),
    ],
    [
      "planets killed with too few hits",
      "hit counts",
      () => entry((r) => (r.stats.shotsFiredHitTarget = 100)),
    ],
    [
      "impossible spawn count",
      "too many asteroids",
      () => entry((r) => (r.stats.regularAsteroidsEncountered = 2000)),
    ],
    [
      "broken bonus-star cadence",
      "star cadence",
      () => entry((r) => (r.stats.bonusStarsEncountered = 80)),
    ],
    [
      "timer beyond 90 s",
      "timer out of range",
      () => entry((r) => (r.timer.survivedSeconds = 120)),
    ],
    [
      "negative counter",
      "malformed run summary",
      () => entry((r) => (r.stats.regularAsteroidsKilled = -1)),
    ],
  ])("rejects %s (%s)", (_label, reason, make) => {
    expect(checkRunSummary(make())).toBe(reason);
  });
});
