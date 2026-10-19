// @ts-check
import { describe, it, expect, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import { AIAnalysisManager } from "../js/managers/AIAnalysisManager.js";

describe("AIAnalysisManager.render", () => {
  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><div id="msg"></div><button id="okBtn"></button>');
    globalThis.window = /** @type {any} */ (dom.window);
    globalThis.document = dom.window.document;
  });

  it("shows the headline and an unnumbered list of emoji-led lines", async () => {
    const msg = /** @type {HTMLElement} */ (document.getElementById("msg"));
    const done = new Promise((resolve) => {
      AIAnalysisManager.render(
        msg,
        {},
        { timer: { survivedSeconds: 41 }, stats: {} },
        false,
        resolve
      );
    });
    await done;
    expect(msg.querySelector("p")?.textContent).toMatch(/^👨‍🚀 Reprimand, pilot\./);
    expect(msg.querySelector("ol")).toBeNull();
    const items = Array.from(msg.querySelectorAll("ul > li"), (li) => li.textContent);
    expect(items[0]).toMatch(/^🚀 You ejected after 41 of 90 seconds\./);
  });
});
