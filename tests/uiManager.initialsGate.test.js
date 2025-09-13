import { describe, it, expect, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import LeaderboardManager from "../js/managers/LeaderboardManager.js";
import { UIManager } from "../js/managers/UIManager.js";

// Helper to build the Game Over overlay DOM structure used by UIManager.showGameOver
function setupDOM() {
  const dom = new JSDOM(
    `<!doctype html><html><body>
    <div id="gameOverScreen" class="game-over-overlay">
      <div class="initials-entry hidden">
        <label id="initialsLabel" class="hidden" for="initialsInput">Initials</label>
        <input id="initialsInput" class="hidden" maxlength="3" />
        <button id="submitScoreBtn" class="hidden">Submit</button>
      </div>
      <button id="restartBtn">Play Again</button>
      <ol id="leaderboardList"></ol>
      <div id="finalScore"></div>
    </div>
  </body></html>`,
    { url: "http://localhost/" }
  );
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = dom.window.localStorage;
  return dom;
}

// Ensure remote mode isn't making network calls in tests.
LeaderboardManager.IS_REMOTE = false;

describe("UIManager.showGameOver initials gating", () => {
  beforeEach(() => {
    setupDOM();
    // Reset cached leaderboard state between tests
    LeaderboardManager._cacheEntries = [];
  });

  it("shows initials form when leaderboard has space (fewer than MAX_ENTRIES)", () => {
    LeaderboardManager._cacheEntries = [{ id: "AAA", score: 300 }];
    const score = 250; // any positive score should qualify because list not full
    UIManager.showGameOver(
      document.getElementById("gameOverScreen"),
      document.getElementById("restartBtn"),
      document.getElementById("finalScore"),
      score
    );
    const initialsInput = document.getElementById("initialsInput");
    expect(initialsInput.classList.contains("hidden")).toBe(false);
  });

  it("hides initials form when score does not enter top MAX_ENTRIES", () => {
    // Fill leaderboard with higher scores
    LeaderboardManager._cacheEntries = [
      { id: "AAA", score: 900 },
      { id: "BBB", score: 800 },
      { id: "CCC", score: 700 },
    ];
    const score = 100; // not high enough
    UIManager.showGameOver(
      document.getElementById("gameOverScreen"),
      document.getElementById("restartBtn"),
      document.getElementById("finalScore"),
      score
    );
    const initialsInput = document.getElementById("initialsInput");
    expect(initialsInput.classList.contains("hidden")).toBe(true);
  });

  it("shows initials form when score displaces lowest qualifying entry", () => {
    LeaderboardManager._cacheEntries = [
      { id: "AAA", score: 900 },
      { id: "BBB", score: 800 },
      { id: "CCC", score: 100 },
    ];
    const score = 500; // should displace 100
    UIManager.showGameOver(
      document.getElementById("gameOverScreen"),
      document.getElementById("restartBtn"),
      document.getElementById("finalScore"),
      score
    );
    const initialsInput = document.getElementById("initialsInput");
    expect(initialsInput.classList.contains("hidden")).toBe(false);
  });

  it("respects explicit allowInitials=false override even if qualifying", () => {
    LeaderboardManager._cacheEntries = [{ id: "AAA", score: 10 }];
    const score = 999; // would qualify
    UIManager.showGameOver(
      document.getElementById("gameOverScreen"),
      document.getElementById("restartBtn"),
      document.getElementById("finalScore"),
      score,
      false,
      false // override
    );
    const initialsInput = document.getElementById("initialsInput");
    expect(initialsInput.classList.contains("hidden")).toBe(true);
  });

  it("respects explicit allowInitials=true override even if not qualifying", () => {
    LeaderboardManager._cacheEntries = [
      { id: "AAA", score: 900 },
      { id: "BBB", score: 800 },
      { id: "CCC", score: 700 },
    ];
    const score = 100; // does not qualify
    UIManager.showGameOver(
      document.getElementById("gameOverScreen"),
      document.getElementById("restartBtn"),
      document.getElementById("finalScore"),
      score,
      false,
      true // override
    );
    const initialsInput = document.getElementById("initialsInput");
    expect(initialsInput.classList.contains("hidden")).toBe(false);
  });
});
