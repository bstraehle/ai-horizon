import { beforeEach, describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { LeaderboardManager } from "../js/managers/LeaderboardManager.js";

describe("LeaderboardManager submit + render", () => {
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
  });

  it("accepts 1-3 letter initials and renders them", async () => {
    const ok = await LeaderboardManager.submit(150, "ABC");
    expect(ok).toBeTruthy();
    const list = document.getElementById("leaderboardList");
    LeaderboardManager.render(list); // render triggers async load if needed
    // Wait a microtask to allow any async render path to finish
    await Promise.resolve();
    expect(list).not.toBeNull();
    expect(list.children.length).toBe(1);
    const li = list.children[0];
    expect(li.textContent).toContain("ABC");
    expect(li.textContent).toContain("150");
  });

  it("sends upgrade-token with a Bullet Upgrade run and shows ⚡ optimistically", async () => {
    /** @type {any[]} */
    const sent = [];
    const original = LeaderboardManager._createRepository;
    LeaderboardManager._createRepository = async () =>
      /** @type {any} */ ({
        loadRemote: async () => [],
        submitRemote: async (/** @type {any} */ entry) => {
          sent.push(entry);
          return { ok: false, accepted: false, entries: null };
        },
      });
    try {
      await LeaderboardManager.submit(300, "UPG", { remote: true, upgradeToken: "acct" });
    } finally {
      LeaderboardManager._createRepository = original;
    }
    expect(sent[0]["upgrade-token"]).toBe("acct");
    expect(sent[0].bulletUpgrade).toBe(true);
    expect(document.getElementById("leaderboardList")?.textContent).toContain("UPG ⚡");
  });

  it("rejects blocked or malformed initials without storing anything", async () => {
    expect(await LeaderboardManager.submit(150, "ASS")).toBe(false);
    expect(await LeaderboardManager.submit(150, "ab")).toBe(false);
    expect(localStorage.getItem(LeaderboardManager.KEY_LEADERBOARD)).toBeNull();
  });
});
