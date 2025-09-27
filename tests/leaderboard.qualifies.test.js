import { describe, it, expect } from "vitest";
import { LeaderboardManager } from "../js/managers/LeaderboardManager.js";

// Helper logic (updated):
//  - score must be > 0
//  - if the leaderboard is not full (< max entries) any positive score qualifies
//  - once full, score must strictly beat the cutoff (lowest score in current top max)

describe("LeaderboardManager.qualifiesForInitials", () => {
  it("rejects non-positive scores", () => {
    expect(LeaderboardManager.qualifiesForInitials(0, [])).toBe(false);
    expect(LeaderboardManager.qualifiesForInitials(-10, [])).toBe(false);
  });

  it("accepts any positive score when entries list empty", () => {
    expect(LeaderboardManager.qualifiesForInitials(5, [])).toBe(true);
  });

  it("accepts any positive score when board not full even if lower than all existing", () => {
    const entries = [
      { id: "AAA", score: 900 },
      { id: "BBB", score: 800 },
      { id: "CCC", score: 700 },
      { id: "DDD", score: 600 },
    ];
    // MAX_ENTRIES default is 25 so still not full
    expect(LeaderboardManager.qualifiesForInitials(10, entries)).toBe(true);
  });

  it("requires beating cutoff once board is full", () => {
    const max = 5;
    const entries = [
      { id: "AAA", score: 900 },
      { id: "BBB", score: 800 },
      { id: "CCC", score: 700 },
      { id: "DDD", score: 600 },
      { id: "EEE", score: 500 },
    ];
    // Full now (length == max). Cutoff is 500.
    expect(LeaderboardManager.qualifiesForInitials(500, entries, max)).toBe(false); // tie not enough
    expect(LeaderboardManager.qualifiesForInitials(501, entries, max)).toBe(true); // beats cutoff
    expect(LeaderboardManager.qualifiesForInitials(100, entries, max)).toBe(false); // well below
  });

  it("respects provided max cutoff slice when more than MAX_ENTRIES entries provided", () => {
    const max = 5;
    const entries = [
      { id: "A", score: 1000 },
      { id: "B", score: 900 },
      { id: "C", score: 800 },
      { id: "D", score: 700 },
      { id: "E", score: 600 },
      { id: "F", score: 10 }, // outside top 5 when max=5
    ];
    // Score 650 should qualify (beats 600 in top 5) but not rely on trailing lower score
    expect(LeaderboardManager.qualifiesForInitials(650, entries, max)).toBe(true);
    // Score 605 qualifies; 605 > 600
    expect(LeaderboardManager.qualifiesForInitials(605, entries, max)).toBe(true);
    // Score 600 does NOT strictly beat any top score (tie is not >)
    expect(LeaderboardManager.qualifiesForInitials(600, entries, max)).toBe(false);
  });

  it("fails open (returns true) if a sort error occurs (defensive path)", () => {
    // Provide entries with a getter that throws to simulate unexpected shape
    const badEntries = [
      {
        id: "A",
        get score() {
          throw new Error("boom");
        },
      },
      { id: "B", score: 10 },
      { id: "C", score: 5 },
    ];
    expect(LeaderboardManager.qualifiesForInitials(50, badEntries)).toBe(true);
  });
});
