import { beforeEach, describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { LeaderboardManager } from "../js/managers/LeaderboardManager.js";

describe("LeaderboardManager game-summary persistence", () => {
  beforeEach(() => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "http://localhost/",
    });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;
  });

  it("should persist game-summary in local storage", async () => {
    const gameSummary = {
      timestamp: "2025-10-19T12:00:00.000Z",
      timer: {
        totalSeconds: 90,
        survivedSeconds: 45,
        toPlaySeconds: 45,
      },
      score: {
        playerBaseScore: 1000,
        playerBonus: 200,
        playerFinalScore: 1200,
      },
      stats: {
        starsCollected: 5,
        asteroidsKilled: 10,
        shotsFired: 50,
        shotsFiredAccuracy: 0.8,
      },
    };

    await LeaderboardManager.submit(1200, "ABC", {
      remote: false,
      accuracy: 0.8,
      gameSummary,
    });

    const entries = await LeaderboardManager.load({ remote: false });

    expect(entries.length).toBeGreaterThan(0);
    const entry = entries.find((e) => e.id === "ABC");
    expect(entry).toBeDefined();
    expect(entry.score).toBe(1200);
    expect(entry.accuracy).toBe(0.8);
    expect(entry["game-summary"]).toBeDefined();
    expect(entry["game-summary"].timestamp).toBe("2025-10-19T12:00:00.000Z");
    expect(entry["game-summary"].timer.totalSeconds).toBe(90);
    expect(entry["game-summary"].score.playerFinalScore).toBe(1200);
    expect(entry["game-summary"].stats.shotsFiredAccuracy).toBe(0.8);
  });

  it("should preserve game-summary when updating score", async () => {
    const firstSummary = {
      timestamp: "2025-10-19T12:00:00.000Z",
      score: { playerFinalScore: 1000 },
    };

    const secondSummary = {
      timestamp: "2025-10-19T13:00:00.000Z",
      score: { playerFinalScore: 1500 },
    };

    await LeaderboardManager.submit(1000, "XYZ", {
      remote: false,
      accuracy: 0.7,
      gameSummary: firstSummary,
    });

    await LeaderboardManager.submit(1500, "XYZ", {
      remote: false,
      accuracy: 0.9,
      gameSummary: secondSummary,
    });

    const entries = await LeaderboardManager.load({ remote: false });

    const xyzEntries = entries.filter((e) => e.id === "XYZ");
    expect(xyzEntries.length).toBe(1);
    expect(xyzEntries[0].score).toBe(1500);
    expect(xyzEntries[0].accuracy).toBe(0.9);
    expect(xyzEntries[0]["game-summary"]).toBeDefined();
    expect(xyzEntries[0]["game-summary"].timestamp).toBe("2025-10-19T13:00:00.000Z");
    expect(xyzEntries[0]["game-summary"].score.playerFinalScore).toBe(1500);
  });

  it("should handle entries without game-summary", async () => {
    await LeaderboardManager.submit(500, "AAA", {
      remote: false,
      accuracy: 0.6,
    });

    const entries = await LeaderboardManager.load({ remote: false });

    const entry = entries.find((e) => e.id === "AAA");
    expect(entry).toBeDefined();
    expect(entry.score).toBe(500);
    expect(entry.accuracy).toBe(0.6);
    expect(entry["game-summary"]).toBeUndefined();
  });
});
