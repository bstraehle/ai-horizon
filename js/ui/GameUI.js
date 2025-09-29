import { UIManager } from "../managers/UIManager.js";
/** @typedef {import('../game.js').AIHorizon} AIHorizon */

// Lightweight facade over UIManager to keep game.js slimmer.
export const GameUI = {
  /** @param {AIHorizon} game */
  hideGameInfo(game) {
    UIManager.hideGameInfo(game.gameInfo || null);
  },
  /** @param {AIHorizon} game */
  showPause(game) {
    UIManager.showPause(game.pauseScreen || null);
  },
  /** @param {AIHorizon} game */
  hidePause(game) {
    UIManager.hidePause(game.pauseScreen || null);
  },
  /** @param {AIHorizon} game @param {boolean} submittedScore */
  showGameOver(game, submittedScore) {
    UIManager.showGameOver(
      game.gameOverScreen || null,
      game.restartBtn || null,
      game.finalScoreEl || null,
      game.score || 0,
      submittedScore,
      undefined
    );
  },
  /** @param {AIHorizon} game */
  hideGameOver(game) {
    UIManager.hideGameOver(game.gameOverScreen || null);
  },
  /** @param {AIHorizon} game */
  setScore(game) {
    UIManager.setScore(game.currentScoreEl || null, game.score || 0);
  },
  /** @param {AIHorizon} game */
  setTimer(game) {
    UIManager.setTimer(game.timerEl || null, game.timerRemaining);
  },
  /** @param {AIHorizon} game */
  focusStart(game) {
    UIManager.focusWithRetry(game.startBtn || null);
  },
  /** @param {AIHorizon} game */
  focusRestart(game) {
    UIManager.focusWithRetry(game.restartBtn || null);
  },
  recenterLeaderboard() {
    try {
      UIManager.recenterLeaderboard();
    } catch {
      /* ignore */
    }
  },
};
