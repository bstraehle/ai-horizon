import { describe, it, expect } from "vitest";
import { LeaderboardManager } from "../js/managers/LeaderboardManager.js";

// The helper logic (documented in code):
//  - score must be > 0
//  - < 3 existing entries => any positive score qualifies
//  - otherwise must beat at least one of the current top MAX_ENTRIES scores

describe("LeaderboardManager.qualifiesForInitials", () => {
  it("rejects non-positive scores", () => {
    expect(LeaderboardManager.qualifiesForInitials(0, [])).toBe(false);
    expect(LeaderboardManager.qualifiesForInitials(-10, [])).toBe(false);
  });

  it("accepts any positive score when entries list empty", () => {
    expect(LeaderboardManager.qualifiesForInitials(5, [])).toBe(true);
  });

  it("accepts any positive score when fewer than 3 entries exist even if lower than existing", () => {
    const entries = [
      { id: "AAA", score: 500 },
      { id: "BBB", score: 400 },
    ];
    expect(LeaderboardManager.qualifiesForInitials(10, entries)).toBe(true); // lower but under bootstrap threshold
  });

  it("requires beating at least one entry when 3 or more entries exist", () => {
    const entries = [
      { id: "AAA", score: 900 },
      { id: "BBB", score: 800 },
      { id: "CCC", score: 700 },
    ];
    expect(LeaderboardManager.qualifiesForInitials(650, entries)).toBe(false); // below all
    expect(LeaderboardManager.qualifiesForInitials(750, entries)).toBe(true); // beats 700
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
