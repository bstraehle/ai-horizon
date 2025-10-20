import { describe, it, expect } from "vitest";
import { LeaderboardManager } from "../js/managers/LeaderboardManager.js";

describe("LeaderboardManager accuracy and date formatting", () => {
  it("includes accuracy in formatted text for rank 1", () => {
    const entry = { id: "AAA", score: 1000, accuracy: 0.85 };
    const formatted = LeaderboardManager.formatRow(entry, 0);
    expect(formatted.accuracyFormatted).toBe("85%");
    expect(formatted.text).toContain("85%");
    expect(formatted.text).toContain("🥇");
  });

  it("includes accuracy in formatted text for rank 4", () => {
    const entry = { id: "BBB", score: 800, accuracy: 0.72 };
    const formatted = LeaderboardManager.formatRow(entry, 3);
    expect(formatted.accuracyFormatted).toBe("72%");
    expect(formatted.text).toContain("72%");
    expect(formatted.text).toContain("4️⃣");
  });

  it("includes accuracy in formatted text for rank 10", () => {
    const entry = { id: "CCC", score: 500, accuracy: 0.95 };
    const formatted = LeaderboardManager.formatRow(entry, 9);
    expect(formatted.accuracyFormatted).toBe("95%");
    expect(formatted.text).toContain("95%");
    expect(formatted.text).toContain("1️⃣0️⃣");
  });

  it("includes date in formatted text", () => {
    const entry = { id: "DDD", score: 600, date: "2025-10-18" };
    const formatted = LeaderboardManager.formatRow(entry, 5);
    expect(formatted.dateFormatted).toBe("2025-10-18");
    expect(formatted.text).toContain("2025-10-18");
  });

  it("includes both accuracy and date in formatted text", () => {
    const entry = { id: "EEE", score: 700, accuracy: 0.88, date: "2025-10-18" };
    const formatted = LeaderboardManager.formatRow(entry, 4);
    expect(formatted.accuracyFormatted).toBe("88%");
    expect(formatted.dateFormatted).toBe("2025-10-18");
    expect(formatted.text).toContain("88%");
    expect(formatted.text).toContain("2025-10-18");
    expect(formatted.text).toContain("5️⃣");
  });

  it("works without accuracy and date", () => {
    const entry = { id: "FFF", score: 400 };
    const formatted = LeaderboardManager.formatRow(entry, 6);
    expect(formatted.accuracyFormatted).toBe("");
    expect(formatted.dateFormatted).toBe("");
    expect(formatted.text).not.toContain("%");
    expect(formatted.text).toContain("7️⃣");
  });
});
