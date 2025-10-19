import { beforeEach, describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { LeaderboardManager } from "../js/managers/LeaderboardManager.js";

describe("AI Analysis JSON parsing", () => {
  beforeEach(() => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "http://localhost/",
    });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;
  });

  it("should store ai-analysis as JSON object when passed as object", async () => {
    const aiAnalysis = {
      feedback: "Great performance!",
      "specific-tip-1": "Focus on collecting bonus stars",
      "specific-tip-2": "Improve asteroid accuracy",
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
    expect(typeof entry["ai-analysis"]).toBe("object");
    expect(entry["ai-analysis"].feedback).toBe("Great performance!");
    expect(entry["ai-analysis"]["specific-tip-1"]).toBe("Focus on collecting bonus stars");
  });

  it("should handle ai-analysis that is already a parsed object", async () => {
    const aiAnalysis = {
      feedback: "Excellent work!",
      "specific-tip-1": "Keep up the accuracy",
      "specific-tip-2": "Work on survival time",
      "specific-tip-3": "Focus on bonus items",
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
    expect(typeof entry["ai-analysis"]).toBe("object");
    expect(entry["ai-analysis"].feedback).toBe("Excellent work!");
    expect(Object.keys(entry["ai-analysis"]).length).toBeGreaterThan(0);
  });

  it("should preserve all properties of ai-analysis object", async () => {
    const aiAnalysis = {
      feedback: "Outstanding performance!",
      "specific-tip-1": "Tip 1",
      "specific-tip-2": "Tip 2",
      "specific-tip-3": "Tip 3",
      "specific-tip-4": "Tip 4",
      "specific-tip-5": "Tip 5",
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
    expect(typeof entry["ai-analysis"]).toBe("object");
    expect(entry["ai-analysis"]["specific-tip-1"]).toBe("Tip 1");
    expect(entry["ai-analysis"]["specific-tip-2"]).toBe("Tip 2");
    expect(entry["ai-analysis"]["specific-tip-3"]).toBe("Tip 3");
    expect(entry["ai-analysis"]["specific-tip-4"]).toBe("Tip 4");
    expect(entry["ai-analysis"]["specific-tip-5"]).toBe("Tip 5");
  });
});
