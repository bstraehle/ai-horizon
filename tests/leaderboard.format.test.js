import { describe, it, expect } from "vitest";
import { LeaderboardManager } from "../js/managers/LeaderboardManager.js";

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

  it("uses fire for ranks 4-10 and thumbs for ranks 11-25", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ id: "AAA", score: 1000 - i * 10 }));
    const r4 = LeaderboardManager.formatRow(rows[3], 3); // rank 4
    expect(r4.medal).toBe("");
    expect(r4.icon).toBe("👏");
    expect(r4.text).toContain("👏");
    const r11 = LeaderboardManager.formatRow(rows[10], 10); // rank 11
    expect(r11.medal).toBe("");
    expect(r11.icon).toBe("👍");
    expect(r11.thumb).toBe(true); // backward compatibility
    expect(r11.text).toContain("👍");
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
