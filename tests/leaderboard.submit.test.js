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
});
