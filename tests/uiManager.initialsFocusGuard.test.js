import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import { UIManager } from "../js/managers/UIManager.js";
import { LeaderboardManager } from "../js/managers/LeaderboardManager.js";

/**
 * Build a DOM structure mimicking the initials overlay.
 */
function createDom() {
  return new JSDOM(
    `<!doctype html><html><body>
      <div id="gameOverScreen" class="game-over-screen hidden">
        <div class="game-over-content">
          <div id="leaderboard" class="leaderboard">
            <ol id="leaderboardList"></ol>
          </div>
          <button id="restartBtn" type="button">Play Again</button>
        </div>
      </div>
      <div id="initialsScreen" class="game-over-screen hidden">
        <div class="game-over-content">
          <div class="initials-entry">
            <label id="initialsLabel" for="initialsInput">Initials</label>
            <input id="initialsInput" type="text" maxlength="3" />
            <button id="submitScoreBtn" type="button">Submit</button>
          </div>
        </div>
      </div>
      <div id="finalScore"></div>
    </body></html>`,
    { url: "http://localhost/" }
  );
}

describe("UIManager initials submit focus guard", () => {
  /** @type {JSDOM|null} */
  let dom = null;
  /** @type {(() => void)|null} */
  let cleanup = null;

  beforeEach(() => {
    dom = createDom();
    const { window } = dom;
    global.window = window;
    global.document = window.document;
    global.Element = window.Element;
    global.HTMLElement = window.HTMLElement;
    global.Node = window.Node;
    global.getComputedStyle = window.getComputedStyle;
    window.scrollTo = window.scrollTo || (() => {});
    const raf = window.requestAnimationFrame || ((cb) => setTimeout(cb, 0));
    const caf = window.cancelAnimationFrame || ((id) => clearTimeout(id));
    window.requestAnimationFrame = raf;
    window.cancelAnimationFrame = caf;
    global.requestAnimationFrame = raf;
    global.cancelAnimationFrame = caf;

    LeaderboardManager._cacheEntries = [];
    LeaderboardManager._pendingLoadPromise = null;

    cleanup = () => {
      UIManager.teardownInitialsSubmitFocusGuard();
      dom?.window.close();
      delete global.window;
      delete global.document;
      delete global.Element;
      delete global.HTMLElement;
      delete global.Node;
      delete global.getComputedStyle;
      delete global.requestAnimationFrame;
      delete global.cancelAnimationFrame;
      dom = null;
      cleanup = null;
    };
  });

  afterEach(() => {
    if (cleanup) cleanup();
  });

  it("focuses submit button when clicking outside initials input", async () => {
    const gameOverScreen = document.getElementById("gameOverScreen");
    const restartBtn = document.getElementById("restartBtn");
    const finalScoreEl = document.getElementById("finalScore");

    UIManager.showGameOver(gameOverScreen, restartBtn, finalScoreEl, 500);

    const initialsScreen = document.getElementById("initialsScreen");
    const initialsInput = document.getElementById("initialsInput");
    const submitBtn = document.getElementById("submitScoreBtn");
    expect(initialsScreen.classList.contains("hidden")).toBe(false);
    initialsInput.focus();
    expect(document.activeElement).toBe(initialsInput);

    const background = initialsScreen.querySelector(".game-over-content");
    const backgroundTarget = document.createElement("div");
    background.appendChild(backgroundTarget);

    const event = new window.Event("mousedown", { bubbles: true, cancelable: true });
    backgroundTarget.dispatchEvent(event);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.activeElement).toBe(submitBtn);
  });

  it("does not override focus when interacting with initials input", async () => {
    const gameOverScreen = document.getElementById("gameOverScreen");
    const restartBtn = document.getElementById("restartBtn");
    const finalScoreEl = document.getElementById("finalScore");

    UIManager.showGameOver(gameOverScreen, restartBtn, finalScoreEl, 500);

    const initialsInput = document.getElementById("initialsInput");
    initialsInput.focus();

    const event = new window.Event("mousedown", { bubbles: true, cancelable: true });
    initialsInput.dispatchEvent(event);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.activeElement).toBe(initialsInput);
  });
});
