import { describe, it, expect } from "vitest";
import { LeaderboardManager } from "../js/managers/LeaderboardManager.js";

describe("LeaderboardManager.formatRow / formatRows", () => {
  it("formats top three with medals", () => {
    const rows = [
      { id: "AAA", score: 1000 },
      { id: "BBB", score: 900 },
      { id: "CCC", score: 800 },
    ];
    const formatted = rows.map((e, i) => LeaderboardManager.formatRow(e, i));
    expect(formatted[0].medal).toBe("🥇");
    expect(formatted[1].medal).toBe("🥈");
    expect(formatted[2].medal).toBe("🥉");
  });

  it("uses number emojis for ranks 4-MAX_ENTRIES", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ id: "AAA", score: 1000 - i * 10 }));
    const r4 = LeaderboardManager.formatRow(rows[3], 3);
    expect(r4.medal).toBe("");
    expect(r4.icon).toBe("4️⃣");
    expect(r4.text).toContain("4️⃣");
    const r10 = LeaderboardManager.formatRow(rows[9], 9);
    expect(r10.medal).toBe("");
    expect(r10.icon).toBe("🔟");
    expect(r10.text).toContain("🔟");
  });

  it("falls back to ??? for invalid initials", () => {
    const row = LeaderboardManager.formatRow({ id: "player1", score: 50 }, 0);
    expect(row.badge).toBe("???");
    expect(row.text).toContain("???");
  });

  it("excludes rank numbers from text (emojis convey rank)", () => {
    const row = LeaderboardManager.formatRow({ id: "AAA", score: 1 }, 5); // index 5 => rank 6
    expect(row.rank).toBe(6);
    expect(row.text).toContain("AAA");
    expect(row.text).not.toContain("6 •");
  });

  it("formatRows caps at 100 entries", () => {
    const many = Array.from({ length: 150 }, (_, i) => ({ id: "AAA", score: i }));
    const lines = LeaderboardManager.formatRows(many);
    expect(lines.length).toBe(100);
  });
});
