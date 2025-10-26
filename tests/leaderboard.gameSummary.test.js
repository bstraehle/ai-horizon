import { beforeEach, describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { LeaderboardManager } from "../js/managers/LeaderboardManager.js";

describe("LeaderboardManager game-summary and ai-analysis persistence as strings", () => {
  beforeEach(() => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "http://localhost/",
    });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;
  });

  it("should persist game-summary as a JSON string in local storage", async () => {
    const gameSummary = {
      timestamp: "2025-10-19T12:00:00.000Z",
      timer: {
        totalSeconds: 90,
        survivedSeconds: 45,
        missedSeconds: 45,
      },
      score: {
        playerBaseScore: 1000,
        playerAccuracyBonus: 200,
        playerBaseScoreFinale: 300,
        playerFinaleBonus: 300,
        playerFinalScore: 1200,
      },
      stats: {
        regularStarsCollected: 5,
        regularAsteroidsKilled: 10,
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
    expect(typeof entry["game-summary"]).toBe("string");
    const parsed = JSON.parse(entry["game-summary"]);
    expect(parsed.timestamp).toBe("2025-10-19T12:00:00.000Z");
    expect(parsed.timer.totalSeconds).toBe(90);
    expect(parsed.score.playerFinalScore).toBe(1200);
    expect(parsed.stats.shotsFiredAccuracy).toBe(0.8);
  });

  it("should preserve game-summary as string when updating score", async () => {
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
    expect(typeof xyzEntries[0]["game-summary"]).toBe("string");
    const parsed = JSON.parse(xyzEntries[0]["game-summary"]);
    expect(parsed.timestamp).toBe("2025-10-19T13:00:00.000Z");
    expect(parsed.score.playerFinalScore).toBe(1500);
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

  it("should persist ai-analysis as a JSON string in local storage", async () => {
    const aiAnalysis = {
      feedback: "Great performance!",
      "improvement-tip-1": "Focus on collecting bonus stars",
      "improvement-tip-2": "Improve asteroid accuracy",
      "improvement-tip-3": "Survive the full 90 seconds",
    };

    await LeaderboardManager.submit(1800, "DEF", {
      remote: false,
      accuracy: 0.85,
      aiAnalysis,
    });

    const entries = await LeaderboardManager.load({ remote: false });

    const entry = entries.find((e) => e.id === "DEF");
    expect(entry).toBeDefined();
    expect(entry.score).toBe(1800);
    expect(entry["ai-analysis"]).toBeDefined();
    expect(typeof entry["ai-analysis"]).toBe("string");
    const parsed = JSON.parse(entry["ai-analysis"]);
    expect(parsed.feedback).toBe("Great performance!");
    expect(parsed["improvement-tip-1"]).toBe("Focus on collecting bonus stars");
  });

  it("should preserve ai-analysis as string when updating score", async () => {
    const firstAnalysis = {
      feedback: "Good start",
      "improvement-tip-1": "First tip",
    };

    const secondAnalysis = {
      feedback: "Excellent improvement!",
      "improvement-tip-1": "Keep up the great work",
    };

    await LeaderboardManager.submit(1200, "GHI", {
      remote: false,
      accuracy: 0.75,
      aiAnalysis: firstAnalysis,
    });

    await LeaderboardManager.submit(1600, "GHI", {
      remote: false,
      accuracy: 0.88,
      aiAnalysis: secondAnalysis,
    });

    const entries = await LeaderboardManager.load({ remote: false });

    const ghiEntries = entries.filter((e) => e.id === "GHI");
    expect(ghiEntries.length).toBe(1);
    expect(ghiEntries[0].score).toBe(1600);
    expect(ghiEntries[0]["ai-analysis"]).toBeDefined();
    expect(typeof ghiEntries[0]["ai-analysis"]).toBe("string");
    const parsed = JSON.parse(ghiEntries[0]["ai-analysis"]);
    expect(parsed.feedback).toBe("Excellent improvement!");
    expect(parsed["improvement-tip-1"]).toBe("Keep up the great work");
  });

  it("should handle entries without ai-analysis", async () => {
    await LeaderboardManager.submit(700, "JKL", {
      remote: false,
      accuracy: 0.65,
    });

    const entries = await LeaderboardManager.load({ remote: false });

    const entry = entries.find((e) => e.id === "JKL");
    expect(entry).toBeDefined();
    expect(entry.score).toBe(700);
    expect(entry["ai-analysis"]).toBeUndefined();
  });

  it("should persist both game-summary and ai-analysis as JSON strings", async () => {
    const gameSummary = {
      timestamp: "2025-10-19T14:00:00.000Z",
      score: { playerFinalScore: 2000 },
    };

    const aiAnalysis = {
      feedback: "Outstanding performance!",
      "improvement-tip-1": "Perfect accuracy achieved",
    };

    await LeaderboardManager.submit(2000, "MNO", {
      remote: false,
      accuracy: 1.0,
      gameSummary,
      aiAnalysis,
    });

    const entries = await LeaderboardManager.load({ remote: false });

    const entry = entries.find((e) => e.id === "MNO");
    expect(entry).toBeDefined();
    expect(entry.score).toBe(2000);
    expect(entry.accuracy).toBe(1.0);
    expect(entry["game-summary"]).toBeDefined();
    expect(typeof entry["game-summary"]).toBe("string");
    expect(entry["ai-analysis"]).toBeDefined();
    expect(typeof entry["ai-analysis"]).toBe("string");
    const parsedSummary = JSON.parse(entry["game-summary"]);
    expect(parsedSummary.score.playerFinalScore).toBe(2000);
    const parsedAnalysis = JSON.parse(entry["ai-analysis"]);
    expect(parsedAnalysis.feedback).toBe("Outstanding performance!");
  });
});
