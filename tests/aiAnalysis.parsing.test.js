import { beforeEach, describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { LeaderboardManager } from "../js/managers/LeaderboardManager.js";

describe("AI Analysis persisted as JSON string", () => {
  beforeEach(() => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "http://localhost/",
    });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;
  });

  it("should store ai-analysis as JSON string when passed as object", async () => {
    const aiAnalysis = {
      feedback: "Great performance!",
      "improvement-tip-1": "Focus on collecting bonus stars",
      "improvement-tip-2": "Improve asteroid accuracy",
    };

    await LeaderboardManager.submit(1800, "OBJ", {
      remote: false,
      accuracy: 0.85,
      aiAnalysis,
    });

    const entries = await LeaderboardManager.load({ remote: false });
    const entry = entries.find((e) => e.id === "OBJ");

    expect(entry).toBeDefined();
    expect(entry["ai-analysis"]).toBeDefined();
    expect(typeof entry["ai-analysis"]).toBe("string");
    const parsed = JSON.parse(entry["ai-analysis"]);
    expect(parsed.feedback).toBe("Great performance!");
    expect(parsed["improvement-tip-1"]).toBe("Focus on collecting bonus stars");
  });

  it("should handle ai-analysis that is already a JSON string", async () => {
    const aiAnalysis = {
      feedback: "Excellent work!",
      "improvement-tip-1": "Keep up the accuracy",
      "improvement-tip-2": "Work on survival time",
      "improvement-tip-3": "Focus on bonus items",
    };

    await LeaderboardManager.submit(2000, "PSR", {
      remote: false,
      accuracy: 0.95,
      aiAnalysis,
    });

    const entries = await LeaderboardManager.load({ remote: false });
    const entry = entries.find((e) => e.id === "PSR");

    expect(entry).toBeDefined();
    expect(entry["ai-analysis"]).toBeDefined();
    expect(typeof entry["ai-analysis"]).toBe("string");
    const parsed = JSON.parse(entry["ai-analysis"]);
    expect(parsed.feedback).toBe("Excellent work!");
    expect(Object.keys(parsed).length).toBeGreaterThan(0);
  });

  it("should preserve all properties of ai-analysis object as JSON string", async () => {
    const aiAnalysis = {
      feedback: "Outstanding performance!",
      "improvement-tip-1": "Tip 1",
      "improvement-tip-2": "Tip 2",
      "improvement-tip-3": "Tip 3",
      "improvement-tip-4": "Tip 4",
      "improvement-tip-5": "Tip 5",
    };

    await LeaderboardManager.submit(2500, "MUL", {
      remote: false,
      accuracy: 1.0,
      aiAnalysis,
    });

    const entries = await LeaderboardManager.load({ remote: false });
    const entry = entries.find((e) => e.id === "MUL");

    expect(entry).toBeDefined();
    expect(entry["ai-analysis"]).toBeDefined();
    expect(typeof entry["ai-analysis"]).toBe("string");
    const parsed = JSON.parse(entry["ai-analysis"]);
    expect(parsed["improvement-tip-1"]).toBe("Tip 1");
    expect(parsed["improvement-tip-2"]).toBe("Tip 2");
    expect(parsed["improvement-tip-3"]).toBe("Tip 3");
    expect(parsed["improvement-tip-4"]).toBe("Tip 4");
    expect(parsed["improvement-tip-5"]).toBe("Tip 5");
  });
});
