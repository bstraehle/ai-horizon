import { beforeEach, describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { LeaderboardManager } from "../js/managers/LeaderboardManager.js";

describe("LeaderboardManager duplicate initials handling", () => {
  beforeEach(() => {
    // create a fresh DOM for each test; set a non-opaque origin so localStorage works
    const dom = new JSDOM(
      '<!doctype html><html><body><ol id="leaderboardList"></ol></body></html>',
      {
        url: "http://localhost/",
      }
    );
    // attach globals so code under test can access document/window/localStorage
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;

    // Clear any cached data
    LeaderboardManager._cacheEntries = null;
    LeaderboardManager._version = undefined;
  });

  it("should replace existing initials with higher score", async () => {
    // Submit first score with initials "ABC"
    await LeaderboardManager.submit(100, "ABC", { remote: false });

    // Submit higher score with same initials "ABC"
    await LeaderboardManager.submit(200, "ABC", { remote: false });

    const entries = await LeaderboardManager.load({ remote: false });

    // Should only have one entry for "ABC" with the higher score
    const abcEntries = entries.filter((e) => e.id === "ABC");
    expect(abcEntries.length).toBe(1);
    expect(abcEntries[0].score).toBe(200);
  });

  it("should keep existing initials with higher score when new score is lower", async () => {
    // Submit first score with initials "XYZ"
    await LeaderboardManager.submit(500, "XYZ", { remote: false });

    // Submit lower score with same initials "XYZ"
    await LeaderboardManager.submit(100, "XYZ", { remote: false });

    const entries = await LeaderboardManager.load({ remote: false });

    // Should only have one entry for "XYZ" with the higher score
    const xyzEntries = entries.filter((e) => e.id === "XYZ");
    expect(xyzEntries.length).toBe(1);
    expect(xyzEntries[0].score).toBe(500);
  });

  it("should handle multiple different initials correctly", async () => {
    // Submit scores for different players
    await LeaderboardManager.submit(300, "AAA", { remote: false });
    await LeaderboardManager.submit(200, "BBB", { remote: false });
    await LeaderboardManager.submit(400, "CCC", { remote: false });

    // Submit higher score for AAA
    await LeaderboardManager.submit(500, "AAA", { remote: false });

    const entries = await LeaderboardManager.load({ remote: false });

    // Should have exactly 3 entries total
    expect(entries.length).toBe(3);

    // Each player should appear only once
    const aaaEntries = entries.filter((e) => e.id === "AAA");
    const bbbEntries = entries.filter((e) => e.id === "BBB");
    const cccEntries = entries.filter((e) => e.id === "CCC");

    expect(aaaEntries.length).toBe(1);
    expect(bbbEntries.length).toBe(1);
    expect(cccEntries.length).toBe(1);

    // AAA should have the higher score
    expect(aaaEntries[0].score).toBe(500);

    // Should be sorted by score descending
    expect(entries[0].id).toBe("AAA");
    expect(entries[0].score).toBe(500);
    expect(entries[1].id).toBe("CCC");
    expect(entries[1].score).toBe(400);
    expect(entries[2].id).toBe("BBB");
    expect(entries[2].score).toBe(200);
  });

  it("should preserve accuracy when updating score", async () => {
    // Submit first score with initials "ZZZ" and accuracy
    await LeaderboardManager.submit(100, "ZZZ", { remote: false, accuracy: 0.75 });

    // Submit higher score with same initials "ZZZ" and different accuracy
    await LeaderboardManager.submit(200, "ZZZ", { remote: false, accuracy: 0.9 });

    const entries = await LeaderboardManager.load({ remote: false });

    // Should only have one entry for "ZZZ"
    const zzzEntries = entries.filter((e) => e.id === "ZZZ");
    expect(zzzEntries.length).toBe(1);
    expect(zzzEntries[0].score).toBe(200);
    expect(zzzEntries[0].accuracy).toBe(0.9);
  });

  it("should update date when replacing score", async () => {
    // Mock Date for consistent testing
    const firstDate = "2025-01-01";

    // Submit first score
    await LeaderboardManager.submit(100, "DDD", { remote: false }); // Manually set the date for testing
    let entries = await LeaderboardManager.load({ remote: false });
    entries[0].date = firstDate;
    await LeaderboardManager.save(entries, { remote: false });

    // Submit higher score (will get new date)
    await LeaderboardManager.submit(200, "DDD", { remote: false });

    entries = await LeaderboardManager.load({ remote: false });

    // Should only have one entry for "DDD" with newer date
    const dddEntries = entries.filter((e) => e.id === "DDD");
    expect(dddEntries.length).toBe(1);
    expect(dddEntries[0].score).toBe(200);
    expect(dddEntries[0].date).not.toBe(firstDate);
  });
});
