import { describe, it, expect, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import { LeaderboardManager } from "../js/managers/LeaderboardManager.js";
import { UIManager } from "../js/managers/UIManager.js";

function setupDOM() {
  const dom = new JSDOM(
    `<!doctype html><html><body>
    <div id="leaderboardScreen" class="game-over-overlay">
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

LeaderboardManager.IS_REMOTE = false;

describe("UIManager.showGameOver initials gating", () => {
  beforeEach(() => {
    setupDOM();
    LeaderboardManager._cacheEntries = [];
  });

  it("shows initials form when leaderboard has space (fewer than MAX_ENTRIES)", () => {
    LeaderboardManager._cacheEntries = [{ id: "AAA", score: 300 }];
    const score = 250;
    UIManager.showGameOver(
      document.getElementById("leaderboardScreen"),
      document.getElementById("restartBtn"),
      document.getElementById("finalScore"),
      score
    );
    const initialsInput = document.getElementById("initialsInput");
    expect(initialsInput.classList.contains("hidden")).toBe(false);
  });

  it("hides initials form when board is full and score does not beat cutoff", () => {
    LeaderboardManager._cacheEntries = Array.from(
      { length: LeaderboardManager.MAX_ENTRIES },
      (_, i) => ({
        id: `A${String(i).padStart(2, "0")}`.slice(0, 3),
        score: (LeaderboardManager.MAX_ENTRIES - i) * 100,
      })
    );
    const score = 100;
    UIManager.showGameOver(
      document.getElementById("leaderboardScreen"),
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
    const score = 500;
    UIManager.showGameOver(
      document.getElementById("leaderboardScreen"),
      document.getElementById("restartBtn"),
      document.getElementById("finalScore"),
      score
    );
    const initialsInput = document.getElementById("initialsInput");
    expect(initialsInput.classList.contains("hidden")).toBe(false);
  });

  it("respects explicit allowInitials=false override even if qualifying", () => {
    LeaderboardManager._cacheEntries = [{ id: "AAA", score: 10 }];
    const score = 999;
    UIManager.showGameOver(
      document.getElementById("leaderboardScreen"),
      document.getElementById("restartBtn"),
      document.getElementById("finalScore"),
      score,
      false,
      false
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
    const score = 100;
    UIManager.showGameOver(
      document.getElementById("leaderboardScreen"),
      document.getElementById("restartBtn"),
      document.getElementById("finalScore"),
      score,
      false,
      true
    );
    const initialsInput = document.getElementById("initialsInput");
    expect(initialsInput.classList.contains("hidden")).toBe(false);
  });
});
