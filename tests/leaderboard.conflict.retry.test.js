import { beforeEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { LeaderboardManager } from "../js/managers/LeaderboardManager.js";

describe("LeaderboardManager optimistic concurrency retry", () => {
  beforeEach(() => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "http://localhost/",
    });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;
    LeaderboardManager.IS_REMOTE = true;
    LeaderboardManager._cacheEntries = [];
    LeaderboardManager._pendingLoadPromise = null;
    LeaderboardManager._version = undefined;
  });

  it("retries when server responds with conflict and merges higher score", async () => {
    // Sequence:
    // 1. Initial load -> server returns version 2 with baseline scores
    // 2. First PUT -> conflict (server now at version 3, returns its version + scores)
    // 3. Second PUT -> success with incremented version 4 including merged higher score

    const fetchMock = vi
      .fn()
      // Initial GET (load)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: 2, scores: [{ id: "AAA", score: 100 }] }),
      })
      // First PUT attempt returns conflict JSON
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ conflict: true, version: 3, scores: [{ id: "AAA", score: 150 }] }),
      })
      // Second PUT attempt success with merged scores version 4
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          version: 4,
          scores: [
            { id: "BBB", score: 200 },
            { id: "AAA", score: 150 },
          ],
        }),
      });

    globalThis.fetch = fetchMock;

    await LeaderboardManager.load({ remote: true });
    const ok = await LeaderboardManager.save(
      [
        { id: "BBB", score: 200 },
        { id: "AAA", score: 150 },
      ],
      { remote: true }
    );

    expect(ok).toBe(true);
    const cached = LeaderboardManager.getCached();
    expect(cached[0].id).toBe("BBB");
    expect(cached[0].score).toBe(200);
    expect(LeaderboardManager._version).toBe(4);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
