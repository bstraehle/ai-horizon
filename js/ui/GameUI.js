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
      if (game.finalScoreEl) {
        if (typeof game.accuracy === "number") {
          game.finalScoreEl.dataset.accuracy = game.accuracy.toFixed(3);
        }
        if (typeof game.accuracyBonus === "number") {
          game.finalScoreEl.dataset.accuracyBonus = String(game.accuracyBonus);
        }
        if (typeof game.shotsFired === "number") {
          game.finalScoreEl.dataset.shotsFired = String(game.shotsFired);
        }
        if (typeof game.asteroidKills === "number") {
          game.finalScoreEl.dataset.asteroidKills = String(game.asteroidKills);
        }
        if (typeof game.hardenedAsteroidKills === "number") {
          game.finalScoreEl.dataset.hardenedAsteroidKills = String(game.hardenedAsteroidKills);
        }
      }
    } catch {
      /* dataset optional */
    }
    UIManager.showGameOver(
      game.gameOverScreen || null,
      game.restartBtn || null,
      game.finalScoreEl || null,
      game.score || 0,
      submittedScore,
      undefined
    );
  },
  /**
   * Hide the game over overlay.
   * @param {AIHorizon} game
   */
  hideGameOver(game) {
    UIManager.hideGameOver(game.gameOverScreen || null);
  },
  /**
   * Update the visible score.
   * @param {AIHorizon} game
   */
  setScore(game) {
    try {
      const total = game.score || 0;
      const bonusApplied = !!game._accuracyBonusApplied && (game.accuracyBonus || 0) > 0;
      if (bonusApplied) {
        const bonus = game.accuracyBonus || 0;
        const base = Math.max(0, total - bonus);
        UIManager.setScore(game.currentScoreEl || null, `${base}+${bonus}`);
      } else {
        UIManager.setScore(game.currentScoreEl || null, total);
      }
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
