import { UIManager } from "../managers/UIManager.js";
import { AIAnalysisManager } from "../managers/AIAnalysisManager.js";
import { gameOverHeadline } from "./GameOverHeadline.js";
/** @typedef {import('../game.js').AIHorizon} AIHorizon */

/**
 * Facade consolidating UI side-effects required by the main game loop.
 * Keeps `game.js` focused on simulation by delegating DOM & accessibility details.
 * All methods defensively accept a full `AIHorizon` instance but tolerate missing
 * element refs (passing `null` to underlying UIManager helpers).
 */
export const GameUI = {
  /**
   * Hide the start/info overlay.
   * @param {AIHorizon} game
   */
  hideGameInfo(game) {
    UIManager.hideGameInfo(game.gameInfo || null);
  },
  /**
   * Present the game over screen and populate score elements; the headline reflects the run's
   * outcome in the player's language (see `gameOverHeadline`).
   * @param {AIHorizon} game
   * @param {boolean} submittedScore Whether a leaderboard submission just occurred.
   */
  showGameOver(game, submittedScore) {
    try {
      const title = document.getElementById("gameOverTitle");
      if (title) {
        const { text, lang } = gameOverHeadline(game._lastRunSummary);
        title.textContent = text;
        title.lang = lang;
      }
    } catch {
      /* headline optional */
    }
    try {
      const scoreEl = game.currentScoreEl || null;
      if (scoreEl) {
        if (typeof game.accuracy === "number") {
          scoreEl.dataset.accuracy = game.accuracy.toFixed(2);
        }
        if (typeof game.accuracyBonus === "number") {
          scoreEl.dataset.accuracyBonus = String(game.accuracyBonus);
        }
        if (typeof game.shotsFired === "number") {
          scoreEl.dataset.shotsFired = String(game.shotsFired);
        }
        if (typeof game.regularAsteroidsKilled === "number") {
          scoreEl.dataset.regularAsteroidsKilled = String(game.regularAsteroidsKilled);
        }
        if (typeof game.hardenedAsteroidsKilled === "number") {
          scoreEl.dataset.hardenedAsteroidsKilled = String(game.hardenedAsteroidsKilled);
        }
        try {
          scoreEl.textContent = String(game.score || 0);
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* dataset optional */
    }

    try {
      const okBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById("okBtn"));
      if (okBtn && AIAnalysisManager.IS_REMOTE) {
        okBtn.disabled = true;
        okBtn.hidden = true;
        okBtn.tabIndex = -1;
      }
      const title = document.getElementById("gameOverTitle");
      if (title && AIAnalysisManager.IS_REMOTE) title.hidden = true;
    } catch {
      /* non-critical pre-hide of the ok button and title (shown again with the debrief) */
    }

    UIManager.showGameOver(
      game.leaderboardScreen || null,
      game.restartBtn || null,
      game.currentScoreEl || null,
      game.score || 0,
      submittedScore,
      undefined,
      game.gameOverScreen || null
    );

    try {
      const postGame =
        game.gameOverScreen ||
        /** @type {HTMLElement|null} */ (document.getElementById("gameOverScreen"));
      const msg = /** @type {HTMLElement|null} */ (document.getElementById("postGameMessage"));
      const visible = !!(postGame && !postGame.classList.contains("hidden"));
      /** @param {HTMLElement} container */
      const renderDebrief = (container) =>
        AIAnalysisManager.render(
          container,
          {
            score: game.score || 0,
            accuracy: game.accuracy || 0,
            shotsFired: game.shotsFired || 0,
            regularAsteroidsKilled: game.regularAsteroidsKilled || 0,
            hardenedAsteroidsKilled: game.hardenedAsteroidsKilled || 0,
            bonusAsteroidsKilled: game.bonusAsteroidsKilled || 0,
            regularStarsCollected: game.regularStarsCollected || 0,
            bonusStarsCollected: game.bonusStarsCollected || 0,
            timerSeconds: game.timerSeconds || 60,
            timerRemaining: game.timerRemaining || 0,
          },
          game._lastRunSummary || null,
          AIAnalysisManager.IS_REMOTE,
          (result) => {
            if (result.isRemote && result.rawResponse) {
              try {
                game._lastAIAnalysis =
                  typeof result.rawResponse === "string"
                    ? JSON.parse(result.rawResponse)
                    : result.rawResponse;
              } catch {
                game._lastAIAnalysis = result.rawResponse;
              }
            } else {
              game._lastAIAnalysis = "";
            }
            // The next debrief can refer back to what this commander said; a debut that fell
            // back to the offline text is undone, so Altair introduces himself next time.
            const { _lastHistory: history, runHistory } = game;
            if (history && runHistory && !game.devTools?.autopilot) {
              if (result.isRemote) runHistory.rememberDebrief(history.commander, result.title);
              else if (history.debut) runHistory.cancelDebut();
            }
          },
          game._lastHistory || null
        );
      if (visible && msg) {
        renderDebrief(msg);
      } else if (postGame && msg) {
        const obs = new MutationObserver(() => {
          try {
            const nowVisible = !postGame.classList.contains("hidden");
            if (nowVisible) {
              renderDebrief(msg);
              try {
                obs.disconnect();
              } catch {
                /* ignoring observer disconnect failures */
              }
            }
          } catch {
            try {
              obs.disconnect();
            } catch {
              /* ignore observer disconnect */
            }
          }
        });
        try {
          obs.observe(postGame, { attributes: true, attributeFilter: ["class"] });
        } catch {
          /* ignore observer observe errors */
        }
      }
    } catch {
      /* non-critical post-game UI analysis render */
    }
  },
  /**
   * Hide the game over overlay.
   * @param {AIHorizon} game
   */
  hideGameOver(game) {
    UIManager.hideGameOver(game.leaderboardScreen || null, game.gameOverScreen || null);
  },
  /**
   * Hide the post-game overlay without touching the main modal.
   * @param {AIHorizon} game
   */
  hidePostGame(game) {
    UIManager.hidePostGame(game.gameOverScreen || null);
  },
  /**
   * Update the visible score.
   * @param {AIHorizon} game
   */
  setScore(game) {
    try {
      const total = game.score || 0;
      UIManager.setScore(game.currentScoreEl || null, total);
    } catch {
      UIManager.setScore(game.currentScoreEl || null, game.score || 0);
    }
  },
  /**
   * Update the visible countdown timer.
   * @param {AIHorizon} game
   */
  setTimer(game) {
    UIManager.setTimer(game.timerEl || null, game.timerRemaining);
  },
  /**
   * Ensure the Start button receives focus (accessibility & mobile reliability).
   * @param {AIHorizon} game
   */
  focusStart(game) {
    UIManager.focusWithRetry(game.startBtn || null);
  },
  /**
   * Ensure the Restart button receives focus (accessibility & mobile reliability).
   * @param {AIHorizon} game
   */
  focusRestart(game) {
    UIManager.focusWithRetry(game.restartBtn || null);
  },
  /**
   * Re-center leaderboard modal / panel (safe if not present).
   */
  recenterLeaderboard() {
    try {
      UIManager.recenterLeaderboard();
    } catch {
      /* ignore */
    }
  },
};
