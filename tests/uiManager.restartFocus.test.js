import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { JSDOM } from "jsdom";
import { UIManager } from "../js/managers/UIManager.js";
import { LeaderboardManager } from "../js/managers/LeaderboardManager.js";
import { FocusManager } from "../js/managers/FocusManager.js";

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

describe("UIManager.restartBtn focus persistence", () => {
  beforeEach(() => {
    setupDOM();
    LeaderboardManager._cacheEntries = []; // ensure initials stay hidden when score is 0
  });

  it("reclaims focus on restart button blur when submit/initials hidden", () => {
    const score = 0; // ensures initials UI stays hidden
    UIManager.showGameOver(
      document.getElementById("leaderboardScreen"),
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

describe("UIManager.handleDocumentFocusIn on the leaderboard overlay", () => {
  /** @type {import("vitest").MockInstance} */
  let focusSpy;
  const originalElement = globalThis.Element;

  beforeEach(() => {
    const dom = setupDOM();
    globalThis.Element = dom.window.Element;
    const group = document.createElement("div");
    group.innerHTML = `<a id="lbAbout" href="about.html">About</a>`;
    document.getElementById("leaderboardScreen").appendChild(group);
    FocusManager.unlock();
    focusSpy = vi.spyOn(UIManager, "focusWithRetry").mockImplementation(() => {});
  });

  afterEach(() => {
    focusSpy.mockRestore();
    globalThis.Element = originalElement;
  });

  /** @param {Element} target */
  const focusIn = (target) =>
    UIManager.handleDocumentFocusIn(
      /** @type {any} */ ({ target }),
      null,
      null,
      document.getElementById("leaderboardScreen"),
      document.getElementById("restartBtn")
    );

  it("lets the About/Privacy links keep focus", () => {
    focusIn(document.getElementById("lbAbout"));
    expect(focusSpy).not.toHaveBeenCalled();
  });

  it("still redirects other focus targets to the restart button", () => {
    focusIn(document.getElementById("leaderboardList"));
    expect(focusSpy).toHaveBeenCalledWith(document.getElementById("restartBtn"));
  });
});
