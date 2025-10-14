/**
 * InputManager – one-time wiring of keyboard, pointer, touch and focus/accessibility listeners.
 * Purely delegates to supplied pre-bound handler callbacks.
 */
export class InputManager {
  /**
   * Attach all DOM listeners. Not idempotent; call once per game lifecycle.
   * @param {HTMLCanvasElement} canvas Main canvas
   * @param {HTMLElement} gameInfo Start/info overlay root
   * @param {HTMLElement} gameOverScreen Game over overlay root
   * @param {HTMLButtonElement} startBtn Start button
   * @param {HTMLButtonElement} restartBtn Restart button
   * @param {HTMLButtonElement|null} postGameOkBtn Post-game confirmation button
   * @param {HTMLElement|null} postGameScreen Post-game overlay root
   * @param {import('../types.js').GameInputHandlers} handlers Pre-bound handler callbacks
   */
  static setup(
    canvas,
    gameInfo,
    gameOverScreen,
    startBtn,
    restartBtn,
    postGameOkBtn,
    postGameScreen,
    handlers
  ) {
    window.addEventListener("keydown", handlers.handleKeyDown);
    window.addEventListener("keyup", handlers.handleKeyUp);
    window.addEventListener("keydown", handlers.handlePauseKeyDown);
    window.addEventListener("resize", handlers.handleResize);
    canvas.addEventListener("mousemove", handlers.handleMouseMove);
    canvas.addEventListener("mousedown", handlers.handleMouseDown);
    window.addEventListener("mouseup", handlers.handleMouseUp);
    canvas.addEventListener("mouseleave", handlers.handleMouseLeave);
    canvas.addEventListener("touchmove", handlers.handleTouchMove, { passive: false });
    canvas.addEventListener("touchstart", handlers.handleTouchStart, { passive: false });
    canvas.addEventListener("touchend", handlers.handleTouchEnd);
    canvas.addEventListener("touchcancel", handlers.handleTouchEnd);
    startBtn.addEventListener("click", handlers.handleStartClick);
    restartBtn.addEventListener("click", handlers.handleRestartClick);
    if (postGameOkBtn && handlers.handlePostGameOkClick) {
      postGameOkBtn.addEventListener("click", handlers.handlePostGameOkClick);
    }
    if (postGameOkBtn && handlers.handlePostGameOkKeyDown) {
      postGameOkBtn.addEventListener("keydown", handlers.handlePostGameOkKeyDown);
    }
    startBtn.addEventListener("keydown", handlers.handleStartKeyDown);
    restartBtn.addEventListener("keydown", handlers.handleRestartKeyDown);
    startBtn.addEventListener("blur", handlers.handleStartScreenFocusGuard, true);
    gameInfo.addEventListener("mousedown", handlers.handleStartScreenFocusGuard, true);
    gameInfo.addEventListener("touchstart", handlers.handleStartScreenFocusGuard, {
      passive: false,
    });
    restartBtn.addEventListener("blur", handlers.handleGameOverFocusGuard, true);
    gameOverScreen.addEventListener("mousedown", handlers.handleGameOverFocusGuard, true);
    gameOverScreen.addEventListener("touchstart", handlers.handleGameOverFocusGuard, {
      passive: true,
    });
    if (postGameOkBtn) {
      postGameOkBtn.addEventListener("blur", handlers.handleGameOverFocusGuard, true);
    }
    if (postGameScreen) {
      postGameScreen.addEventListener("mousedown", handlers.handleGameOverFocusGuard, true);
      postGameScreen.addEventListener("touchstart", handlers.handleGameOverFocusGuard, {
        passive: true,
      });
    }
    window.addEventListener("focus", handlers.handleWindowFocus);
    window.addEventListener("pageshow", handlers.handleWindowFocus);
    document.addEventListener("visibilitychange", handlers.handleVisibilityChange);
    document.addEventListener("focusin", handlers.handleDocumentFocusIn, true);
    window.addEventListener("scroll", handlers.handleScroll, { passive: true });
  }
}
