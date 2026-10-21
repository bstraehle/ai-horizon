// @ts-check
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { JSDOM } from "jsdom";
import { AIAnalysisManager } from "../js/managers/AIAnalysisManager.js";
import { setReducedMotion } from "../js/utils/motion.js";

/** A run ejected after 41 s (the offline debrief reprimands it). */
const RUN = {
  timer: { totalSeconds: 90, survivedSeconds: 41 },
  stats: {
    bonusAsteroidsEncountered: 4,
    bonusAsteroidsKilled: 4,
    hardenedAsteroidsEncountered: 4,
  },
  device: { locale: "en-US" },
};

/** @param {HTMLElement} msg */
const sectionsOf = (msg) =>
  Array.from(msg.querySelectorAll(".debrief > section"), (s) => ({
    className: s.className,
    heading: s.querySelector("h3")?.textContent,
    items: Array.from(s.querySelectorAll("ul > li"), (li) => li.textContent),
  }));

describe("AIAnalysisManager.render", () => {
  const original = { audio: AIAnalysisManager.audio };

  beforeEach(() => {
    const dom = new JSDOM(
      '<!doctype html><h2 id="gameOverTitle">Ship Down</h2><div id="msg"></div><button id="okBtn"></button>'
    );
    globalThis.window = /** @type {any} */ (dom.window);
    globalThis.document = dom.window.document;
  });

  afterEach(() => {
    AIAnalysisManager.audio = original.audio;
    setReducedMotion(null);
    vi.useRealTimers();
  });

  it("shows the sender and headline, then labelled Well done / Next mission lists", async () => {
    setReducedMotion(true);
    const msg = /** @type {HTMLElement} */ (document.getElementById("msg"));
    await new Promise((resolve) => {
      AIAnalysisManager.render(msg, {}, RUN, false, resolve);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(msg.querySelector(".debrief-from")?.textContent).toBe("Commander Vega");
    const headline = /** @type {HTMLElement} */ (msg.querySelector(".debrief-headline"));
    expect(headline.querySelector(".sr-only")?.textContent).toMatch(/^👨‍🚀 Reprimand, pilot\./);
    expect(headline.querySelector(".debrief-typed")?.getAttribute("aria-hidden")).toBe("true");
    expect(headline.querySelector(".debrief-typed")?.textContent).toBe(
      headline.querySelector(".sr-only")?.textContent
    );
    expect(msg.querySelector(".debrief")?.classList.contains("pending")).toBe(false);
    expect(sectionsOf(msg)).toEqual([
      {
        className: "debrief-section debrief-done",
        heading: "Well done",
        items: ["Bonus asteroids: 4 / 4"],
      },
      {
        className: "debrief-section debrief-next",
        heading: "Next mission",
        items: ["Survival: 41 / 90 s. Dodge first, shoot second."],
      },
    ]);
  });

  it("shows an incoming transmission with a crackle while a remote debrief loads", () => {
    const playTransmission = vi.fn();
    AIAnalysisManager.audio = /** @type {any} */ ({
      supported: true,
      muted: true,
      playTransmission,
      playSpeech: vi.fn(),
    });
    const msg = /** @type {HTMLElement} */ (document.getElementById("msg"));
    AIAnalysisManager.render(msg, {}, { ...RUN, device: { locale: "de-DE" } }, true);
    expect(msg.querySelector(".transmission-label")?.textContent).toBe("📡 Eingehende Übertragung");
    expect(msg.querySelector(".transmission-from")?.textContent).toBe("Kommandantin Vega");
    expect(msg.classList.contains("commander-vega")).toBe(true);
    expect(playTransmission).toHaveBeenCalledWith("vega");
    expect(msg.querySelector(".transmission")?.getAttribute("role")).toBe("status");
    const okBtn = /** @type {HTMLButtonElement} */ (document.getElementById("okBtn"));
    expect(okBtn.disabled).toBe(true);
    expect(okBtn.hidden).toBe(true);
    expect(/** @type {HTMLElement} */ (document.getElementById("gameOverTitle")).hidden).toBe(true);
  });

  it("names Captain Altair, in his colour and with his call tone, when he debriefs", async () => {
    const playTransmission = vi.fn();
    AIAnalysisManager.audio = /** @type {any} */ ({
      supported: true,
      muted: true,
      playTransmission,
      playSpeech: vi.fn(),
    });
    const msg = /** @type {HTMLElement} */ (document.getElementById("msg"));
    msg.classList.add("commander-vega");
    const history = { mission: 4, hooks: [], commander: /** @type {const} */ ("altair") };
    AIAnalysisManager.render(msg, {}, { ...RUN, device: { locale: "ko-KR" } }, true, null, history);
    expect(msg.querySelector(".transmission-from")?.textContent).toBe("알타이르 대위");
    expect(msg.className).toBe("commander-altair");
    expect(playTransmission).toHaveBeenCalledWith("altair");
    setReducedMotion(true);
    await new Promise((resolve) => {
      AIAnalysisManager.render(msg, {}, RUN, false, resolve, history);
    });
    expect(msg.querySelector(".debrief-from")?.textContent).toBe("Captain Altair");
  });

  it("shows the title and the Ok button again once the debrief arrives", async () => {
    setReducedMotion(true);
    const okBtn = /** @type {HTMLButtonElement} */ (document.getElementById("okBtn"));
    const title = /** @type {HTMLElement} */ (document.getElementById("gameOverTitle"));
    okBtn.hidden = true;
    okBtn.disabled = true;
    title.hidden = true;
    const msg = /** @type {HTMLElement} */ (document.getElementById("msg"));
    await new Promise((resolve) => {
      AIAnalysisManager.render(msg, {}, RUN, false, resolve);
    });
    expect(okBtn.hidden).toBe(false);
    expect(okBtn.disabled).toBe(false);
    expect(title.hidden).toBe(false);
  });

  it("types the headline out and reveals the sections when it is complete", async () => {
    setReducedMotion(false);
    vi.useFakeTimers();
    const msg = /** @type {HTMLElement} */ (document.getElementById("msg"));
    AIAnalysisManager.render(msg, {}, RUN, false);
    await vi.advanceTimersByTimeAsync(0);
    const typed = /** @type {HTMLElement} */ (msg.querySelector(".debrief-typed-shown"));
    const box = /** @type {HTMLElement} */ (msg.querySelector(".debrief-typed"));
    const full = String(msg.querySelector(".debrief-headline .sr-only")?.textContent);
    const debrief = /** @type {HTMLElement} */ (msg.querySelector(".debrief"));
    expect(box.classList.contains("typing")).toBe(true);
    expect(debrief.classList.contains("pending")).toBe(true);
    await vi.advanceTimersByTimeAsync(600);
    expect(typed.textContent?.length).toBeGreaterThan(0);
    expect(typed.textContent?.length).toBeLessThan(full.length);
    // The not-yet-typed rest stays in the layout (hidden), so the panel keeps its final size.
    expect(`${typed.textContent}${msg.querySelector(".debrief-typed-rest")?.textContent}`).toBe(
      full
    );
    expect(/** @type {HTMLButtonElement} */ (document.getElementById("okBtn")).disabled).toBe(
      false
    );
    await vi.advanceTimersByTimeAsync(4000);
    expect(typed.textContent).toBe(full);
    expect(box.classList.contains("typing")).toBe(false);
    expect(debrief.classList.contains("pending")).toBe(false);
  });
});
