// @ts-check
import { describe, it, expect } from "vitest";
import { UIManager } from "../js/managers/UIManager.js";
import { CONFIG } from "../js/constants.js";

/** Fake timer element that counts DOM-style mutations (node env: no `document`). */
function makeTimerEl() {
  let text = "";
  const classes = new Set();
  const el = {
    writes: 0,
    classOps: 0,
    styleOps: 0,
    get textContent() {
      return text;
    },
    set textContent(v) {
      el.writes++;
      text = String(v);
    },
    classList: {
      add: (/** @type {string} */ c) => {
        el.classOps++;
        classes.add(c);
      },
      remove: (/** @type {string} */ c) => {
        el.classOps++;
        classes.delete(c);
      },
      contains: (/** @type {string} */ c) => classes.has(c),
    },
    style: {
      setProperty: () => {
        el.styleOps++;
      },
    },
    parentElement: null,
  };
  return el;
}

describe("UIManager.setTimer memoization", () => {
  it("writes the text only when the displayed second changes", () => {
    const el = makeTimerEl();
    const timerEl = /** @type {any} */ (el);
    UIManager.setTimer(timerEl, 60.9);
    UIManager.setTimer(timerEl, 60.5);
    UIManager.setTimer(timerEl, 60.01);
    expect(el.writes).toBe(1);
    expect(el.textContent).toBe("1:00");
    UIManager.setTimer(timerEl, 59.99);
    expect(el.writes).toBe(2);
    expect(el.textContent).toBe("0:59");
  });

  it("applies finale styling once per state change instead of every tick", () => {
    const finale = CONFIG.GAME.FINALE_BONUS_WINDOW_SECONDS;
    const el = makeTimerEl();
    const timerEl = /** @type {any} */ (el);
    UIManager.setTimer(timerEl, finale + 5);
    const opsBefore = el.classOps;
    for (let i = 0; i < 30; i++) UIManager.setTimer(timerEl, finale - 0.5 - i * 0.001);
    expect(el.classList.contains("finale")).toBe(true);
    // One class add + one CSS variable batch for entering the finale, nothing per tick after.
    expect(el.classOps - opsBefore).toBe(1);
    expect(el.styleOps).toBe(4);
    UIManager.setTimer(timerEl, 0);
    expect(el.classList.contains("finale")).toBe(false);
  });

  it("re-applies styling after clearFinaleTimer resets the memo", () => {
    const finale = CONFIG.GAME.FINALE_BONUS_WINDOW_SECONDS;
    const el = makeTimerEl();
    const timerEl = /** @type {any} */ (el);
    UIManager.setTimer(timerEl, finale - 1);
    expect(el.classList.contains("finale")).toBe(true);
    UIManager.clearFinaleTimer(timerEl);
    expect(el.classList.contains("finale")).toBe(false);
    UIManager.setTimer(timerEl, finale - 1.001);
    expect(el.classList.contains("finale")).toBe(true);
  });

  it("tolerates a missing element", () => {
    expect(() => UIManager.setTimer(null, 10)).not.toThrow();
  });
});
