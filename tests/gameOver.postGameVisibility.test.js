import { describe, it, expect, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import { handleGameOver } from "../js/ui/GameOver.js";

// Minimal stubs used by GameOver.js
import { LeaderboardManager } from "../js/managers/LeaderboardManager.js";
LeaderboardManager.IS_REMOTE = false;

// Provide minimal API used by GameOver.js without pulling full game.
function createGame(score) {
  return {
    score,
    accuracy: 0.42,
    shotsFired: 10,
    asteroidsKilled: 5,
    hardenedAsteroidsKilled: 0,
    bonusAsteroidsKilled: 0,
    starsCollected: 3,
    bonusStarsCollected: 1,
    timerSeconds: 60,
    timerRemaining: 0,
    _lastRunSummary: null,
  };
}

function setupDOM() {
  const dom = new JSDOM(
    `<!doctype html><html><body>
    <div id="leaderboardScreen" class="game-over-screen hidden" hidden>
      <div class="game-over-content">
        <h2 id="gameOverTitle">Leaderboard</h2>
        <div id="leaderboard" class="leaderboard"><ol id="leaderboardList"></ol></div>
        <button id="restartBtn">Play Again</button>
      </div>
    </div>
    <div id="gameOverScreen" class="game-over-screen hidden" hidden>
      <div class="game-over-content">
        <h2 id="postGameTitle">Game Over</h2>
        <div class="initials-entry post-game-entry hidden">
          <div id="postGameMessage" class="post-game-message"></div>
          <button id="okBtn">Ok</button>
        </div>
      </div>
    </div>
    <div id="initialsScreen" class="game-over-screen hidden" hidden>
      <div class="game-over-content">
        <h2 id="gameOverTitle">Initials</h2>
        <div class="initials-entry hidden">
          <label id="initialsLabel" for="initialsInput" class="hidden">Enter your 3-letter initials</label>
          <input id="initialsInput" class="hidden" maxlength="3" />
          <button id="submitScoreBtn" class="hidden">Submit</button>
        </div>
      </div>
    </div>
  </body></html>`,
    { url: "http://localhost/" }
  );
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = dom.window.localStorage;
  return dom;
}

describe("GameOver post-game visibility regression", () => {
  beforeEach(() => {
    setupDOM();
    LeaderboardManager._cacheEntries = []; // ensure qualifies so initials may show/hide logic runs
  });

  it("shows post-game message entry (was previously hidden)", () => {
    const game = createGame(100); // positive score triggers initials logic path
    handleGameOver(game);
    const postGameScreen = document.getElementById("gameOverScreen");
    const postGameEntry = postGameScreen.querySelector(".initials-entry.post-game-entry");
    expect(postGameScreen.classList.contains("hidden")).toBe(false);
    expect(postGameEntry.classList.contains("hidden")).toBe(false);
  });
});
