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
   * Attach all required DOM event listeners for keyboard, mouse, touch, and accessibility focus guards.
   *
   * Design:
   * - Centralizes binding logic so the main Game object remains uncluttered.
   * - Expects the provided handler methods to be pre-bound to the game instance (no implicit `this`).
   * - Uses passive listeners where scrolling performance benefits (touchstart on leaderboard, window scroll).
   *
   * Idempotency:
   * - Not inherently idempotent: calling twice will register duplicate listeners. Call exactly once per Game lifecycle.
   * - A future enhancement could track an attached flag or return an unsubscribe closure.
   *
   * Performance / Behavior Notes:
   * - Mouse/touch move handlers may fire at high frequency; upstream handlers should minimize allocations.
   * - Resize handler expected to internally debounce / rAF schedule heavy work.
   * - Focus guard listeners assist keyboard + mobile ergonomics; they are lightweight conditional checks.
   *
   * Cleanup Strategy (Not implemented here):
   * - A complementary `teardown` could mirror these addEventListener calls with removeEventListener for hot-reload scenarios.
   *
   * @param {HTMLCanvasElement} canvas The main game canvas receiving pointer events.
   * @param {HTMLElement} gameInfo Start/info overlay root element.
   * @param {HTMLElement} gameOverScreen Game over overlay root element.
   * @param {HTMLButtonElement} startBtn Start/play button element.
   * @param {HTMLButtonElement} restartBtn Restart button element.
   * @param {import('../types.js').GameInputHandlers} handlers Object containing pre-bound handler callbacks.
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
