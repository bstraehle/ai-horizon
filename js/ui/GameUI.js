import { UIManager } from "../managers/UIManager.js";
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
   * Show the pause overlay.
   * @param {AIHorizon} game
   */
  showPause(game) {
    UIManager.showPause(game.pauseScreen || null);
  },
  /**
   * Hide the pause overlay.
   * @param {AIHorizon} game
   */
  hidePause(game) {
    UIManager.hidePause(game.pauseScreen || null);
  },
  /**
   * Present the game over screen and populate score elements.
   * @param {AIHorizon} game
   * @param {boolean} submittedScore Whether a leaderboard submission just occurred.
   */
  showGameOver(game, submittedScore) {
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
        if (typeof game.asteroidsKilled === "number") {
          scoreEl.dataset.asteroidsKilled = String(game.asteroidsKilled);
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
    UIManager.showGameOver(
      game.gameOverScreen || null,
      game.restartBtn || null,
      game.currentScoreEl || null,
      game.score || 0,
      submittedScore,
      undefined,
      game.postGameScreen || null
    );
  },
  /**
   * Hide the game over overlay.
   * @param {AIHorizon} game
   */
  hideGameOver(game) {
    UIManager.hideGameOver(game.gameOverScreen || null, game.postGameScreen || null);
  },
  /**
   * Hide the post-game overlay without touching the main modal.
   * @param {AIHorizon} game
   */
  hidePostGame(game) {
    UIManager.hidePostGame(game.postGameScreen || null);
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
