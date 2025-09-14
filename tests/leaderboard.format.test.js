import { describe, it, expect } from "vitest";
import LeaderboardManager from "../js/managers/LeaderboardManager.js";

describe("LeaderboardManager.formatRow / formatRows", () => {
  it("formats top three with medals and no thumbs", () => {
    const rows = [
      { id: "AAA", score: 1000 },
      { id: "BBB", score: 900 },
      { id: "CCC", score: 800 },
    ];
    const formatted = rows.map((e, i) => LeaderboardManager.formatRow(e, i));
    expect(formatted[0].medal).toBe("🥇");
    expect(formatted[1].medal).toBe("🥈");
    expect(formatted[2].medal).toBe("🥉");
    expect(formatted[0].thumb).toBe(false);
    expect(formatted[2].thumb).toBe(false);
  });

  it("adds thumbs up for entries beyond third", () => {
    const rows = [
      { id: "AAA", score: 1000 },
      { id: "BBB", score: 900 },
      { id: "CCC", score: 800 },
      { id: "DDD", score: 700 },
    ];
    const r3 = LeaderboardManager.formatRow(rows[3], 3);
    expect(r3.medal).toBe("");
    expect(r3.thumb).toBe(true);
    expect(r3.text).toContain("👍");
  });

  it("falls back to ??? for invalid initials", () => {
    const row = LeaderboardManager.formatRow({ id: "player1", score: 50 }, 0);
    expect(row.badge).toBe("???");
    expect(row.text).toContain("???");
  });

  it("includes rank numbering starting at 1", () => {
    const row = LeaderboardManager.formatRow({ id: "AAA", score: 1 }, 5); // index 5 => rank 6
    expect(row.rank).toBe(6);
    expect(row.text).toContain("6 — AAA");
  });

  it("formatRows caps at 100 entries", () => {
    const many = Array.from({ length: 150 }, (_, i) => ({ id: "AAA", score: i }));
    const lines = LeaderboardManager.formatRows(many);
    expect(lines.length).toBe(100);
  });
});
