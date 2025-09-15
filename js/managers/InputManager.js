/**
 * InputManager – centralized setup for all user input bindings (keyboard, mouse, touch, focus guards).
 *
 * Purpose:
 * - Attach DOM event listeners once and keep `game.js` lean.
 * - Provide an easily testable surface that only depends on passed handler callbacks.
 * - Encapsulate accessibility related listeners (focus management) alongside raw input.
 *
 * Notes:
 * - This module does not perform any game logic; it simply wires browser events to bound handlers.
 * - All handlers are expected to be pre-bound to the game instance (see Game.bindEventHandlers()).
 */
export class InputManager {
  /**
   * Setup all event listeners.
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLElement} gameInfo
   * @param {HTMLElement} gameOverScreen
   * @param {HTMLButtonElement} startBtn
   * @param {HTMLButtonElement} restartBtn
   * @param {import('../types.js').GameInputHandlers} handlers - Bound handler functions from the game instance.
   */
  static setup(canvas, gameInfo, gameOverScreen, startBtn, restartBtn, handlers) {
    // Keyboard events
    window.addEventListener("keydown", handlers.handleKeyDown);
    window.addEventListener("keyup", handlers.handleKeyUp);
    // Global keydown for pause/resume
    window.addEventListener("keydown", handlers.handlePauseKeyDown);
    // Window resize (debounced via rAF in handler)
    window.addEventListener("resize", handlers.handleResize);
    // Mouse events
    canvas.addEventListener("mousemove", handlers.handleMouseMove);
    canvas.addEventListener("mousedown", handlers.handleMouseDown);
    window.addEventListener("mouseup", handlers.handleMouseUp);
    canvas.addEventListener("mouseleave", handlers.handleMouseLeave);
    // Touch events for mobile
    canvas.addEventListener("touchmove", handlers.handleTouchMove, { passive: false });
    canvas.addEventListener("touchstart", handlers.handleTouchStart, { passive: false });
    canvas.addEventListener("touchend", handlers.handleTouchEnd);
    canvas.addEventListener("touchcancel", handlers.handleTouchEnd);
    // Button events
    startBtn.addEventListener("click", handlers.handleStartClick);
    restartBtn.addEventListener("click", handlers.handleRestartClick);
    // Keyboard accessibility for buttons
    startBtn.addEventListener("keydown", handlers.handleStartKeyDown);
    restartBtn.addEventListener("keydown", handlers.handleRestartKeyDown);
    // Focus guards
    startBtn.addEventListener("blur", handlers.handleStartScreenFocusGuard, true);
    gameInfo.addEventListener("mousedown", handlers.handleStartScreenFocusGuard, true);
    gameInfo.addEventListener("touchstart", handlers.handleStartScreenFocusGuard, {
      passive: false,
    });
    restartBtn.addEventListener("blur", handlers.handleGameOverFocusGuard, true);
    gameOverScreen.addEventListener("mousedown", handlers.handleGameOverFocusGuard, true);
    // Allow passive touchstart so leaderboard scroll works on mobile
    gameOverScreen.addEventListener("touchstart", handlers.handleGameOverFocusGuard, {
      passive: true,
    });
    // Restore focus on overlay buttons when returning to the tab/window
    window.addEventListener("focus", handlers.handleWindowFocus);
    window.addEventListener("pageshow", handlers.handleWindowFocus);
    document.addEventListener("visibilitychange", handlers.handleVisibilityChange);
    // When focus shifts inside the document (after app switch, etc.), ensure overlay button regains focus
    document.addEventListener("focusin", handlers.handleDocumentFocusIn, true);
    // Update canvas rect on scroll (affects touch/mouse offsets)
    window.addEventListener("scroll", handlers.handleScroll, { passive: true });
  }
}
