// @ts-check
import { describe, it, expect, vi } from "vitest";
import {
  AIAnalysisAdapter,
  MAX_WEAKNESSES,
  missionInsights,
  missionVerdict,
  VERDICT_BONUS_ASTEROIDS,
  VERDICT_SHOT_ACCURACY,
} from "../js/adapters/AIAnalysisAdapter.js";

/**
 * @param {number} survivedSeconds
 * @param {{ bonusAsteroidsKilled?: number, shotsFiredAccuracy?: number }} [stats]
 */
function run(survivedSeconds, stats = {}) {
  return {
    timer: { totalSeconds: 90, survivedSeconds, missedSeconds: 90 - survivedSeconds },
    stats: { bonusAsteroidsKilled: 0, shotsFiredAccuracy: 0, ...stats },
  };
}

describe("missionVerdict", () => {
  it("reprimands an ejection before the finale starts", () => {
    expect(missionVerdict(run(41, { bonusAsteroidsKilled: 8, shotsFiredAccuracy: 1 }))).toBe(
      "reprimand"
    );
    expect(missionVerdict(run(74))).toBe("reprimand");
    expect(missionVerdict(run(75))).toBe("satisfactory");
  });

  it("commends a full mission with enough bonus asteroids or accuracy", () => {
    expect(missionVerdict(run(90, { bonusAsteroidsKilled: VERDICT_BONUS_ASTEROIDS }))).toBe(
      "commendation"
    );
    expect(missionVerdict(run(90, { shotsFiredAccuracy: VERDICT_SHOT_ACCURACY }))).toBe(
      "commendation"
    );
  });

  it("rates weak full missions and finale ejections as satisfactory", () => {
    expect(
      missionVerdict(
        run(90, {
          bonusAsteroidsKilled: VERDICT_BONUS_ASTEROIDS - 1,
          shotsFiredAccuracy: VERDICT_SHOT_ACCURACY - 0.01,
        })
      )
    ).toBe("satisfactory");
    expect(missionVerdict(run(89, { bonusAsteroidsKilled: 8, shotsFiredAccuracy: 1 }))).toBe(
      "satisfactory"
    );
  });

  it("returns null without a survived time", () => {
    expect(missionVerdict(null)).toBeNull();
    expect(missionVerdict({ score: 1 })).toBeNull();
    expect(missionVerdict({ timer: { survivedSeconds: null } })).toBeNull();
  });
});

describe("AIAnalysisAdapter verdict", () => {
  it("sends the verdict with the run summary", async () => {
    const remote = { postJSON: vi.fn(async () => null) };
    const adapter = new AIAnalysisAdapter({
      remoteAdapter: /** @type {any} */ (remote),
      endpoint: "/x",
    });
    const summary = run(30);
    await adapter.analyze({ runSummary: summary, speech: { voice: "male" } });
    expect(remote.postJSON).toHaveBeenCalledWith("/x", {
      ...summary,
      verdict: "reprimand",
      insights: missionInsights(summary),
      speech: { voice: "male" },
    });
  });

  it("uses a headline in the verdict's tone offline", async () => {
    const adapter = new AIAnalysisAdapter();
    const title = async (/** @type {any} */ summary) =>
      (await adapter.analyze({ runSummary: summary })).title;
    expect(await title(run(90, { bonusAsteroidsKilled: 8 }))).toMatch(/^👨‍🚀 Commendation/);
    expect(await title(run(90))).toMatch(/^👨‍🚀 Satisfactory/);
    expect(await title(run(41))).toBe(
      "👨‍🚀 Reprimand, pilot. You ejected after 41 seconds. Stay in the fight."
    );
    expect(await title(null)).toMatch(/^Mission debrief protocol concluded/);
  });

  it("lists the offline strength first, then tips with exact facts and a technique", async () => {
    const adapter = new AIAnalysisAdapter();
    const { bullets } = await adapter.analyze({ runSummary: REAL_RUN });
    expect(bullets).toEqual([
      "✅ Strong finale: 2450 points in the last 15 seconds.",
      "🎯 232 of 419 shots hit. Fire short bursts at targets.",
      "🪐 18 of 62 gray planets destroyed. Reach 2500 points early: they take half the hits.",
      "⭐ 26 of 138 stars collected. Grab stars between attacks.",
    ]);
    const ejected = (await adapter.analyze({ runSummary: ejectedAt(41) })).bullets;
    expect(ejected[1]).toBe("🚀 You ejected after 41 of 90 seconds. Dodge first, shoot second.");
  });

  it("puts the strength line before the tips of a remote debrief", () => {
    const adapter = new AIAnalysisAdapter();
    const { title, bullets } = adapter._transformRemoteResponse(
      JSON.stringify({
        feedback: "👨‍🚀 Commendation, pilot. 90 seconds flown.",
        "improvement-tip-1": "🎯 Tip one",
        strength: "✅ Strong finale",
        "improvement-tip-2": "🪐 Tip two",
      })
    );
    expect(title).toBe("👨‍🚀 Commendation, pilot. 90 seconds flown.");
    expect(bullets).toEqual(["✅ Strong finale", "🎯 Tip one", "🪐 Tip two"]);
  });
});

/** Real production run (desktop, full 90 s, finale bonus), as in leaderboard.runSummary.test.js. */
const REAL_RUN = {
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
  },
  stats: {
    regularStarsEncountered: 172,
    regularStarsCollected: 48,
    bonusStarsEncountered: 34,
    bonusStarsCollected: 22,
    regularAsteroidsEncountered: 350,
    regularAsteroidsKilled: 50,
    hardenedAsteroidsEncountered: 70,
    hardenedAsteroidsKilled: 25,
    bonusAsteroidsEncountered: 8,
    bonusAsteroidsKilled: 7,
    shotsFiredTotal: 419,
    shotsFiredHitTarget: 232,
    shotsFiredAccuracy: 0.55,
  },
};

/** REAL_RUN's stats, but ejected after `seconds` (before the finale). @param {number} seconds */
function ejectedAt(seconds) {
  return {
    ...REAL_RUN,
    timer: {
      ...REAL_RUN.timer,
      survivedSeconds: seconds,
      missedSeconds: 90 - seconds,
      survivedSecondsFinale: 0,
      missedSecondsFinale: 15,
    },
    score: { ...REAL_RUN.score, playerBaseScoreFinale: 0, playerFinaleBonus: 0 },
  };
}

describe("missionInsights", () => {
  it("ranks the real run's weaknesses against realistic par shares, returning exact facts only", () => {
    const insights = /** @type {any} */ (missionInsights(REAL_RUN));
    // Estimated costs (internal): accuracy ~1820, gray planets 1300, white stars ~560 points.
    // Gray planets / white stars exclude the red planets / red stars their counters include.
    expect(insights.weaknesses).toEqual([
      { topic: "accuracy", emoji: "🎯", done: 232, total: 419 },
      { topic: "grayPlanets", emoji: "🪐", done: 18, total: 62 },
      { topic: "whiteStars", emoji: "⭐", done: 26, total: 138 },
    ]);
    // 1225 finale item points beat the ~915 expected at the pre-finale pace; shown doubled.
    expect(insights.strength).toEqual({
      topic: "finale",
      emoji: "🔥",
      done: 15,
      total: 15,
      points: 2450,
    });
  });

  it("makes an early ejection the top weakness", () => {
    const [top] = /** @type {any} */ (missionInsights(ejectedAt(41))).weaknesses;
    expect(top).toEqual({ topic: "survival", emoji: "🚀", done: 41, total: 90 });
  });

  it("still flags an early crash that scored nothing (minimum pace for seconds never flown)", () => {
    const crash = {
      timer: { totalSeconds: 90, survivedSeconds: 5, missedSeconds: 85, missedSecondsFinale: 15 },
      stats: { regularAsteroidsEncountered: 10, shotsFiredTotal: 4 },
      score: {},
    };
    expect(/** @type {any} */ (missionInsights(crash)).weaknesses).toEqual([
      { topic: "survival", emoji: "🚀", done: 5, total: 90 },
    ]);
  });

  it("keeps at most MAX_WEAKNESSES and drops topics already at par", () => {
    const insights = /** @type {any} */ (missionInsights(REAL_RUN));
    expect(insights.weaknesses).toHaveLength(MAX_WEAKNESSES);
    expect(insights.weaknesses.map((/** @type {any} */ i) => i.topic)).not.toContain("survival");
  });

  it("returns null without timer or stats", () => {
    expect(missionInsights(null)).toBeNull();
    expect(missionInsights({ timer: { survivedSeconds: 90 } })).toBeNull();
    expect(missionInsights({ stats: {} })).toBeNull();
  });
});
