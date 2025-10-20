import { describe, it, expect, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import { handleGameOver } from "../js/ui/GameOver.js";
import { LeaderboardManager } from "../js/managers/LeaderboardManager.js";

LeaderboardManager.IS_REMOTE = false;

function setupDom() {
  const dom = new JSDOM(
    `<!doctype html><html><body>
    <div id="leaderboardScreen" class="game-over-screen hidden" hidden>
      <div class="game-over-content">
        <h2 id="gameOverTitle">Leaderboard</h2>
        <div id="leaderboard" class="leaderboard"><ol id="leaderboardList"></ol></div>
        <button id="restartBtn" type="button">Play Again</button>
      </div>
    </div>
    <div id="gameOverScreen" class="game-over-screen hidden" hidden>
      <div class="game-over-content">
        <h2 id="postGameTitle">Game Over</h2>
        <div class="initials-entry post-game-entry hidden">
          <div id="postGameMessage" class="post-game-message"></div>
          <button id="okBtn" type="button">Ok</button>
        </div>
      </div>
    </div>
    <div id="initialsScreen" class="game-over-screen hidden" hidden>
      <div class="game-over-content">
        <h2 id="initialsTitle">Initials</h2>
        <div class="initials-entry">
          <label id="initialsLabel" for="initialsInput" class="">Initials</label>
          <input id="initialsInput" maxlength="3" />
          <button id="submitScoreBtn" type="button">Submit</button>
        </div>
      </div>
    </div>
  </body></html>`,
    { url: "http://localhost/" }
  );
  global.window = dom.window;
  global.document = dom.window.document;
  global.Element = dom.window.Element;
  global.HTMLElement = dom.window.HTMLElement;
  global.Node = dom.window.Node;
  const raf = dom.window.requestAnimationFrame || ((cb) => setTimeout(cb, 0));
  global.requestAnimationFrame = raf;
  dom.window.requestAnimationFrame = raf;
  dom.window.scrollTo = () => {};
  global.window.scrollTo = () => {};
  return dom;
}

describe("Skipping initials entry", () => {
  beforeEach(() => {
    setupDom();
    LeaderboardManager._cacheEntries = [];
  });

  it("shows leaderboard when clicking submit without entering initials", () => {
    const restartBtn = document.getElementById("restartBtn");
    const initialsInput = /** @type {HTMLInputElement} */ (
      document.getElementById("initialsInput")
    );
    const submitBtn = document.getElementById("submitScoreBtn");
    const leaderboardScreen = document.getElementById("leaderboardScreen");
    const initialsScreen = document.getElementById("initialsScreen");

    // Make initials screen visible to simulate pre-submission state
    initialsScreen.classList.remove("hidden");

    const game = {
      score: 1000,
      leaderboardListEl: document.getElementById("leaderboardList"),
      restartBtn,
    };

    handleGameOver(game);

    // Click submit without entering initials (empty string)
    initialsInput.value = "";
    submitBtn.dispatchEvent(new window.Event("click", { bubbles: true, cancelable: true }));

    // Leaderboard should be visible
    expect(leaderboardScreen.classList.contains("hidden")).toBe(false);
    // Initials screen should be hidden
    expect(initialsScreen.classList.contains("hidden")).toBe(true);
  });

  it("does not submit score when skipping initials entry", async () => {
    const restartBtn = document.getElementById("restartBtn");
    const initialsInput = /** @type {HTMLInputElement} */ (
      document.getElementById("initialsInput")
    );
    const submitBtn = document.getElementById("submitScoreBtn");
    const initialsScreen = document.getElementById("initialsScreen");

    initialsScreen.classList.remove("hidden");

    const game = {
      score: 1000,
      leaderboardListEl: document.getElementById("leaderboardList"),
      restartBtn,
    };

    handleGameOver(game);

    // Clear any existing entries
    LeaderboardManager._cacheEntries = [];

    // Click submit without entering initials
    initialsInput.value = "";
    submitBtn.dispatchEvent(new window.Event("click", { bubbles: true, cancelable: true }));

    // Load entries and verify no score was submitted
    const entries = await LeaderboardManager.load({ remote: false });
    expect(entries.length).toBe(0);
  });
});
