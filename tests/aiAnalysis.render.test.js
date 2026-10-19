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

  it("shows the headline, then labelled Well done / Next mission lists", async () => {
    const msg = /** @type {HTMLElement} */ (document.getElementById("msg"));
    const run = {
      timer: { totalSeconds: 90, survivedSeconds: 41 },
      stats: {
        bonusAsteroidsEncountered: 4,
        bonusAsteroidsKilled: 4,
        hardenedAsteroidsEncountered: 4,
      },
    };
    await new Promise((resolve) => {
      AIAnalysisManager.render(msg, {}, run, false, resolve);
    });
    expect(msg.querySelector("p")?.textContent).toMatch(/^👨‍🚀 Reprimand, pilot\./);
    const sections = Array.from(msg.querySelectorAll(".debrief > section"), (s) => ({
      className: s.className,
      heading: s.querySelector("h3")?.textContent,
      items: Array.from(s.querySelectorAll("ul > li"), (li) => li.textContent),
      note: s.querySelector(".debrief-note")?.textContent,
    }));
    expect(sections).toEqual([
      {
        className: "debrief-section debrief-done",
        heading: "Well done",
        items: ["Bonus asteroids: 4 / 4"],
        note: undefined,
      },
      {
        className: "debrief-section debrief-next",
        heading: "Next mission",
        items: ["Survival: 41 / 90 s. Dodge first, shoot second."],
        note: "Everything else is on target.",
      },
    ]);
  });
});
