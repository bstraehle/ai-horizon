import { beforeEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { LeaderboardManager } from "../js/managers/LeaderboardManager.js";

describe("LeaderboardManager remote submit", () => {
  beforeEach(() => {
    const dom = new JSDOM(
      '<!doctype html><html><body><ol id="leaderboardList"></ol></body></html>',
      { url: "http://localhost/" }
    );
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;
    LeaderboardManager._cacheEntries = null;
    LeaderboardManager._pendingLoadPromise = null;
  });

  it("sends only the new entry and publishes the server's list (no localStorage write)", async () => {
    const serverScores = [
      { id: "XYZ", score: 999 },
      { id: "ABC", score: 100 },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: 1, scores: [{ id: "XYZ", score: 999 }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ accepted: true, version: 2, scores: serverScores }),
      });
    globalThis.fetch = fetchMock;

    let eventDetail = null;
    window.addEventListener("leaderboard:updated", (e) => {
      eventDetail = e.detail;
    });

    const ok = await LeaderboardManager.submit(100, "ABC", { remote: true, accuracy: 0.5 });
    expect(ok).toBe(true);

    const [, init] = fetchMock.mock.calls[1];
    expect(init.method).toBe("PUT");
    const body = JSON.parse(init.body);
    expect(body.scores).toBeUndefined();
    expect(body.version).toBeUndefined();
    expect(body.entry).toMatchObject({ id: "ABC", score: 100, accuracy: 0.5 });

    expect(localStorage.getItem(LeaderboardManager.KEY_LEADERBOARD)).toBeNull();
    expect(eventDetail.map((e) => e.id)).toEqual(["XYZ", "ABC"]);
    expect(LeaderboardManager.getCached().map((e) => e.id)).toEqual(["XYZ", "ABC"]);
    expect(document.getElementById("leaderboardList").children).toHaveLength(2);
  });

  it("keeps the optimistic list and resolves false when the server rejects the entry", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ scores: [{ id: "XYZ", score: 999 }] }),
      })
      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) });

    const ok = await LeaderboardManager.submit(500, "ABC", { remote: true });

    expect(ok).toBe(false);
    expect(LeaderboardManager.getCached().map((e) => [e.id, e.score])).toEqual([
      ["XYZ", 999],
      ["ABC", 500],
    ]);
  });

  it("does not contact the server for blocked initials", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    expect(await LeaderboardManager.submit(500, "ASS", { remote: true })).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
