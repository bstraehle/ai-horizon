import { beforeEach, describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { LeaderboardManager } from "../js/managers/LeaderboardManager.js";

describe("LeaderboardManager remote save", () => {
  beforeEach(() => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "http://localhost/",
    });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.localStorage = dom.window.localStorage;
  });

  it("emits event and updates in-memory cache (no localStorage write)", async () => {
    const serverPayload = {
      version: 1,
      scores: [
        { id: "XYZ", score: 999 },
        { id: "ABC", score: 100 },
      ],
    };

    // Mock fetch to respond to PUT with 200 and the payload
    globalThis.fetch = async (_url, _opts) => ({ ok: true, json: async () => serverPayload });

    let eventDetail = null;
    window.addEventListener("leaderboard:updated", (e) => {
      eventDetail = e.detail;
    });

    const entries = [{ id: "XYZ", score: 999 }];
    const res = await LeaderboardManager.save(entries, { remote: true });
    expect(res).toBeTruthy();

    // Remote save should NOT persist to localStorage anymore
    const raw = localStorage.getItem(LeaderboardManager.KEY_LEADERBOARD);
    expect(raw).toBeNull();

    // Event dispatched with normalized entries
    expect(eventDetail).not.toBeNull();
    expect(Array.isArray(eventDetail)).toBe(true);
    expect(eventDetail[0].id).toBe(String(serverPayload.scores[0].id));
    expect(eventDetail[0].score).toBe(Number(serverPayload.scores[0].score));
  });
});
