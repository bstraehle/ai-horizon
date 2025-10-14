import { CONFIG } from "../constants.js";
import { InputManager } from "../managers/InputManager.js";
import { UIManager } from "../managers/UIManager.js";
/** @typedef {import('../game.js').AIHorizon} AIHorizon */

/**
 * Centralizes input handler binding & DOM listener setup previously embedded in `game.js`.
 * Two phases:
 *  1. bind(game): ensures stable method identities for add/removeEventListener.
 *  2. setup(game): registers DOM + document/window listeners via `InputManager`.
 */
export const InputBindings = {
  /**
   * Bind handler methods to the game instance; must be invoked before `setup`.
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
    game.handlePostGameOkClick = game.handlePostGameOkClick.bind(game);
    game.handlePostGameOkKeyDown = game.handlePostGameOkKeyDown.bind(game);
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
    // @ts-ignore dynamically augmenting instance
    game.movementKeys = new Set(CONFIG.INPUT.MOVEMENT_CODES);
    game.handleGuardClick = game.handleGuardClick.bind(game);
  },
  /**
   * Register DOM & global listeners using the already bound methods.
   * @param {AIHorizon} game
   */
  setup(game) {
    InputManager.setup(
      /** @type {HTMLCanvasElement} */ (game.canvas),
      /** @type {HTMLElement} */ (game.gameInfo || document.createElement("div")),
      /** @type {HTMLElement} */ (game.gameOverScreen || document.createElement("div")),
      /** @type {HTMLButtonElement} */ (game.startBtn || document.createElement("button")),
      /** @type {HTMLButtonElement} */ (game.restartBtn || document.createElement("button")),
      /** @type {HTMLButtonElement|null} */ (game.okBtn || null),
      /** @type {HTMLElement|null} */ (game.postGameScreen || null),
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
        handlePostGameOkClick: game.handlePostGameOkClick,
        handlePostGameOkKeyDown: game.handlePostGameOkKeyDown,
        handleStartKeyDown: game.handleStartKeyDown,
        handleRestartKeyDown: game.handleRestartKeyDown,
        handleStartScreenFocusGuard: game.handleStartScreenFocusGuard,
        handleGameOverFocusGuard: game.handleGameOverFocusGuard,
        handleWindowFocus: () =>
          UIManager.handleWindowFocus(
            /** @type {HTMLElement|null} */ (game.gameInfo || null),
            /** @type {HTMLButtonElement|null} */ (game.startBtn || null),
            /** @type {HTMLElement|null} */ (game.gameOverScreen || null),
            /** @type {HTMLButtonElement|null} */ (game.restartBtn || null),
            /** @type {HTMLElement|null} */ (game.postGameScreen || null),
            /** @type {HTMLButtonElement|null} */ (game.okBtn || null)
          ),
        handleVisibilityChange: game.handleVisibilityChange,
        handleDocumentFocusIn: (/** @type {FocusEvent} */ e) =>
          UIManager.handleDocumentFocusIn(
            e,
            /** @type {HTMLElement|null} */ (game.gameInfo || null),
            /** @type {HTMLButtonElement|null} */ (game.startBtn || null),
            /** @type {HTMLElement|null} */ (game.gameOverScreen || null),
            /** @type {HTMLButtonElement|null} */ (game.restartBtn || null),
            /** @type {HTMLElement|null} */ (game.postGameScreen || null),
            /** @type {HTMLButtonElement|null} */ (game.okBtn || null)
          ),
        handleScroll: game.handleScroll,
        handlePauseKeyDown: game.handlePauseKeyDown,
      }
    );
  },
};
