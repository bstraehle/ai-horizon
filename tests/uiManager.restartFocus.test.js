import { describe, it, expect, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import { UIManager } from "../js/managers/UIManager.js";
import { LeaderboardManager } from "../js/managers/LeaderboardManager.js";

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

LeaderboardManager.IS_REMOTE = false;

describe("UIManager.restartBtn focus persistence", () => {
  beforeEach(() => {
    setupDOM();
    LeaderboardManager._cacheEntries = []; // ensure initials stay hidden when score is 0
  });

  it("reclaims focus on restart button blur when submit/initials hidden", () => {
    const score = 0; // ensures initials UI stays hidden
    UIManager.showGameOver(
      document.getElementById("gameOverScreen"),
      document.getElementById("restartBtn"),
      document.getElementById("finalScore"),
      score
    );
    const restartBtn = document.getElementById("restartBtn");
    expect(document.activeElement).toBe(restartBtn);

    // Simulate blur caused by a mousedown on overlay background.
    const blurEvent = new window.FocusEvent("blur", { bubbles: true });
    restartBtn.dispatchEvent(blurEvent);

    // After guard, focus should still be on restartBtn.
    expect(document.activeElement).toBe(restartBtn);
  });
});
