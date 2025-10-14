import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import { handleGameOver } from "../js/ui/GameOver.js";
import { LeaderboardManager } from "../js/managers/LeaderboardManager.js";

function setupDom() {
  return new JSDOM(
    `<!doctype html><html><body>
    <canvas id="gameCanvas"></canvas>
    <div id="leaderboardScreen" class="game-over-screen hidden">
      <div class="game-over-content">
        <div id="leaderboard" class="leaderboard"><ol id="leaderboardList"></ol></div>
        <button id="restartBtn" type="button">Play Again</button>
      </div>
    </div>
    <div id="initialsScreen" class="game-over-screen hidden">
      <div class="game-over-content">
        <div class="initials-entry">
          <label id="initialsLabel" for="initialsInput">Initials</label>
          <input id="initialsInput" maxlength="3" />
          <button id="submitScoreBtn" type="button">Submit</button>
        </div>
      </div>
    </div>
    <div id="finalScore"></div>
  </body></html>`,
    { url: "http://localhost/" }
  );
}

describe("Restart button cooldown after submitting initials", () => {
  /** @type {JSDOM|null} */
  let dom = null;
  let cleanup = null;

  beforeEach(() => {
    dom = setupDom();
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

    // Ensure player qualifies for initials entry
    LeaderboardManager._cacheEntries = []; // empty board -> qualifies
    LeaderboardManager._pendingLoadPromise = null;

    cleanup = () => {
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

  afterEach(() => cleanup && cleanup());

  it("blocks immediate restart triggered by same tap after submit", async () => {
    const restartBtn = document.getElementById("restartBtn");
    const initialsScreen = document.getElementById("initialsScreen");
    const initialsInput = /** @type {HTMLInputElement} */ (
      document.getElementById("initialsInput")
    );
    const submitBtn = document.getElementById("submitScoreBtn");
    const leaderboardScreen = document.getElementById("leaderboardScreen");

    // Force initials screen visible (qualification logic handled by handleGameOver)
    initialsScreen.classList.remove("hidden");

    let restarted = 0;

    const game = {
      score: 999,
      leaderboardListEl: document.getElementById("leaderboardList"),
      restartBtn: restartBtn,
      startBtn: { focus: () => {} },
      leaderboardScreen: leaderboardScreen,
      finalScoreEl: document.getElementById("finalScore"),
      /** Mimic restart handler (respect cooldown dataset) */
      handleRestartClick() {
        if (
          this.restartBtn &&
          this.restartBtn.dataset &&
          this.restartBtn.dataset.cooldown === "1"
        ) {
          return; // suppressed by cooldown
        }
        restarted++;
      },
    };

    // Attach restart handler
    restartBtn.addEventListener("click", () => game.handleRestartClick());

    // Wire up submission listeners
    handleGameOver(game);

    // handleGameOver hides the inline `.initials-entry` variant defensively; unhide elements so we can simulate a user submission.
    initialsInput.classList.remove("hidden");
    submitBtn.classList.remove("hidden");
    const label = document.getElementById("initialsLabel");
    if (label) label.classList.remove("hidden");

    // Enter valid initials and submit
    initialsInput.value = "ABC";
    submitBtn.dispatchEvent(new window.Event("click", { bubbles: true, cancelable: true }));

    // Immediately attempt restart (simulates pointerup/click landing on new button)
    restartBtn.dispatchEvent(new window.Event("click", { bubbles: true, cancelable: true }));

    expect(restarted).toBe(0); // first attempt suppressed by cooldown

    // Simulate pointerup clearing cooldown
    window.dispatchEvent(new window.Event("pointerup", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10)); // allow timeout(clear) to run

    restartBtn.dispatchEvent(new window.Event("click", { bubbles: true, cancelable: true }));
    expect(restarted).toBe(1); // second attempt succeeds after cooldown cleared
  });
});
