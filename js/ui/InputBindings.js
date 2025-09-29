import { CONFIG } from "../constants.js";
import { InputManager } from "../managers/InputManager.js";
import { UIManager } from "../managers/UIManager.js";
/** @typedef {import('../game.js').AIHorizon} AIHorizon */

// Centralizes binding + setup previously embedded in game.js
export const InputBindings = {
  /** Bind handler methods to game instance (was game.bindEventHandlers).
   * @param {AIHorizon} game
   */
  bind(game) {
    game.handleKeyDown = game.handleKeyDown.bind(game);
    game.handleKeyUp = game.handleKeyUp.bind(game);
    game.handleMouseMove = game.handleMouseMove.bind(game);
    game.handleMouseDown = game.handleMouseDown.bind(game);
    game.handleMouseUp = game.handleMouseUp.bind(game);
    game.handleMouseLeave = game.handleMouseLeave.bind(game);
    game.handleTouchMove = game.handleTouchMove.bind(game);
    game.handleTouchStart = game.handleTouchStart.bind(game);
    game.handleTouchEnd = game.handleTouchEnd.bind(game);
    game.handleStartClick = game.handleStartClick.bind(game);
    game.handleRestartClick = game.handleRestartClick.bind(game);
    game.handleStartKeyDown = game.handleStartKeyDown.bind(game);
    game.handleRestartKeyDown = game.handleRestartKeyDown.bind(game);
    game.resizeCanvas = game.resizeCanvas.bind(game);
    game.handleResize = game.handleResize.bind(game);
    game.handleStartScreenFocusGuard = game.handleStartScreenFocusGuard.bind(game);
    game.handleGameOverFocusGuard = game.handleGameOverFocusGuard.bind(game);
    game.handlePauseKeyDown = game.handlePauseKeyDown.bind(game);
    game.shouldTogglePause = game.shouldTogglePause.bind(game);
    game.handleScroll = game.handleScroll.bind(game);
    game.handleVisibilityChange = game.handleVisibilityChange.bind(game);
    game.shoot = game.shoot.bind(game);
    // @ts-ignore - augmenting instance dynamically
    game.movementKeys = new Set(CONFIG.INPUT.MOVEMENT_CODES);
    game.handleGuardClick = game.handleGuardClick.bind(game);
  },
  /** Setup DOM listeners (was game.setupEventListeners).
   * @param {AIHorizon} game
   */
  setup(game) {
    InputManager.setup(
      /** @type {HTMLCanvasElement} */ (game.canvas),
      /** @type {HTMLElement} */ (game.gameInfo || document.createElement("div")),
      /** @type {HTMLElement} */ (game.gameOverScreen || document.createElement("div")),
      /** @type {HTMLButtonElement} */ (game.startBtn || document.createElement("button")),
      /** @type {HTMLButtonElement} */ (game.restartBtn || document.createElement("button")),
      {
        handleKeyDown: game.handleKeyDown,
        handleKeyUp: game.handleKeyUp,
        handleResize: game.handleResize,
        handleMouseMove: game.handleMouseMove,
        handleMouseDown: game.handleMouseDown,
        handleMouseUp: game.handleMouseUp,
        handleMouseLeave: game.handleMouseLeave,
        handleTouchMove: game.handleTouchMove,
        handleTouchStart: game.handleTouchStart,
        handleTouchEnd: game.handleTouchEnd,
        handleStartClick: game.handleStartClick,
        handleRestartClick: game.handleRestartClick,
        handleStartKeyDown: game.handleStartKeyDown,
        handleRestartKeyDown: game.handleRestartKeyDown,
        handleStartScreenFocusGuard: game.handleStartScreenFocusGuard,
        handleGameOverFocusGuard: game.handleGameOverFocusGuard,
        handleWindowFocus: () =>
          UIManager.handleWindowFocus(
            /** @type {HTMLElement|null} */ (game.gameInfo || null),
            /** @type {HTMLButtonElement|null} */ (game.startBtn || null),
            /** @type {HTMLElement|null} */ (game.gameOverScreen || null),
            /** @type {HTMLButtonElement|null} */ (game.restartBtn || null)
          ),
        handleVisibilityChange: game.handleVisibilityChange,
        handleDocumentFocusIn: (e) =>
          UIManager.handleDocumentFocusIn(
            e,
            /** @type {HTMLElement|null} */ (game.gameInfo || null),
            /** @type {HTMLButtonElement|null} */ (game.startBtn || null),
            /** @type {HTMLElement|null} */ (game.gameOverScreen || null),
            /** @type {HTMLButtonElement|null} */ (game.restartBtn || null)
          ),
        handleScroll: game.handleScroll,
        handlePauseKeyDown: game.handlePauseKeyDown,
      }
    );
  },
};
