import { describe, it, expect, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import { UIManager } from "../js/managers/UIManager.js";
import { CONFIG } from "../js/constants.js";

function setupDOM() {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>
    <div id="timerBox"><span id="timer"></span></div>
  </body></html>`);
  // @ts-expect-error - jsdom DOMWindow type differs from lib.dom Window in this environment
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  try {
    globalThis.localStorage = dom.window.localStorage;
  } catch (_) {
    /* ignore */
  }
}

describe("Timer finale flashing clears on game over", () => {
  beforeEach(() => {
    setupDOM();
  });

  it("removes 'finale' from #timerBox and #timer when showGameOver is invoked", () => {
    const timerEl = /** @type {HTMLElement} */ (document.getElementById("timer"));
    const timerBox = /** @type {HTMLElement} */ (document.getElementById("timerBox"));

    expect(timerEl).toBeTruthy();
    expect(timerBox).toBeTruthy();

    const finaleWindow = CONFIG.GAME.FINALE_BONUS_WINDOW_SECONDS || 10;
    const secondsRemaining = Math.max(0.1, finaleWindow - 0.1);
    UIManager.setTimer(timerEl, secondsRemaining);

    expect(timerBox.classList.contains("finale") || timerEl.classList.contains("finale")).toBe(
      true
    );

    UIManager.showGameOver(null, null, null, 0);

    expect(timerBox.classList.contains("finale")).toBe(false);
    expect(timerEl.classList.contains("finale")).toBe(false);
  });
});
