/**
 * UIManager centralizes DOM updates and focus management for overlays and scores.
 */
import { LeaderboardManager } from "./LeaderboardManager.js";
export class UIManager {
  static _preserveFocus = false;

  /**
   * Safe Element check for non-browser environments.
   * @param {unknown} obj
   * @returns {obj is Element}
   */
  static isElement(obj) {
    return typeof Element !== "undefined" && obj instanceof Element;
  }

  /** Set the current score element.
   * @param {HTMLElement|null} currentScoreEl
   * @param {number|string} score
   */
  static setScore(currentScoreEl, score) {
    if (currentScoreEl) currentScoreEl.textContent = String(score);
  }

  /**
   * Update countdown timer (M:SS formatting, floor of remaining seconds).
   * Gracefully no‑ops if element missing.
   * @param {HTMLElement|null} timerEl Timer display element.
   * @param {number} secondsRemaining Seconds (float) remaining; negative values clamped to 0.
   */
  static setTimer(timerEl, secondsRemaining) {
    if (!timerEl) return;
    const s = Math.max(0, Math.floor(secondsRemaining));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    timerEl.textContent = `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  /** Show pause overlay.
   * @param {HTMLElement|null} pauseScreen
   */
  static showPause(pauseScreen) {
    if (pauseScreen) pauseScreen.classList.remove("hidden");
  }

  /** Hide pause overlay.
   * @param {HTMLElement|null} pauseScreen
   */
  static hidePause(pauseScreen) {
    if (pauseScreen) pauseScreen.classList.add("hidden");
  }

  /**
   * Show Game Over overlay, populate final score, conditionally display initials form, and manage focus.
   *
   * Behavior:
   * - Scrolls leaderboard list (if present) back to top to ensure high scores visible.
   * - Determines initials form visibility by consulting cached or freshly loaded leaderboard entries unless overridden.
   * - Chooses preferred focus target: initials input if visible & score > 0, else restart button.
   * - Optional scroll preservation (mobile friendliness) using focusPreserveScroll + retry strategy.
   * - Adds transient visual focus hint (js-force-focus) if programmatic focus is blocked by browser heuristics.
   *
   * Robustness:
   * - All DOM operations wrapped in try/catch (best effort for non-browser / partial DOM environments).
   *
   * @param {HTMLElement|null} gameOverScreen Overlay root element.
   * @param {HTMLElement|null} restartBtn Restart button element.
   * @param {HTMLElement|null} finalScoreEl Element displaying final score.
   * @param {number} score Final numeric score.
   * @param {boolean} [preserveScroll=false] Attempt to keep page scroll position stable while focusing.
   * @param {boolean|undefined} [allowInitials] Explicit override for initials visibility (bypasses qualification logic).
   */
  /**
   * @param {HTMLElement|null} gameOverScreen
   * @param {HTMLElement|null} restartBtn
   * @param {HTMLElement|null} finalScoreEl
   * @param {number} score
   * @param {boolean} [preserveScroll=false]
   * @param {boolean|undefined} [allowInitials]
   */
  static showGameOver(
    gameOverScreen,
    restartBtn,
    finalScoreEl,
    score,
    preserveScroll = false,
    allowInitials = undefined
  ) {
    if (finalScoreEl) finalScoreEl.textContent = String(score);
    if (gameOverScreen) gameOverScreen.classList.remove("hidden");
    try {
      const leaderboard = /** @type {HTMLElement|null} */ (
        document.getElementById("leaderboardList")
      );
      if (leaderboard) {
        try {
          if (typeof leaderboard.scrollTo === "function") leaderboard.scrollTo(0, 0);
          else leaderboard.scrollTop = 0;
        } catch (_) {
          try {
            leaderboard.scrollTop = 0;
          } catch (_) {
            void 0;
          }
        }
      }
    } catch (_) {
      /* ignore */
    }

    try {
      const initialsEntry = /** @type {HTMLElement|null} */ (
        document.querySelector(".initials-entry")
      );
      const initialsInput = /** @type {HTMLElement|null} */ (
        document.getElementById("initialsInput")
      );
      const submitBtn = /** @type {HTMLElement|null} */ (document.getElementById("submitScoreBtn"));
      const initialsLabel = /** @type {HTMLElement|null} */ (
        document.getElementById("initialsLabel")
      );

      /**
       * Apply visibility to initials UI elements.
       * @param {boolean} visible
       */
      const toggleInitialsUI = (visible) => {
        const method = visible ? "remove" : "add";
        try {
          if (initialsEntry) initialsEntry.classList[method]("hidden");
        } catch (_) {
          /* ignore - DOM mutation best effort */
        }
        try {
          if (initialsInput) initialsInput.classList[method]("hidden");
        } catch (_) {
          /* ignore - DOM mutation best effort */
        }
        try {
          if (submitBtn) submitBtn.classList[method]("hidden");
        } catch (_) {
          /* ignore - DOM mutation best effort */
        }
        try {
          if (initialsLabel) initialsLabel.classList[method]("hidden");
        } catch (_) {
          /* ignore - DOM mutation best effort */
        }
      };

      if (typeof allowInitials === "boolean") {
        toggleInitialsUI(allowInitials);
      } else {
        const baseline = typeof score === "number" && score > 0;
        if (!baseline) {
          toggleInitialsUI(false);
        } else {
          const max = LeaderboardManager.MAX_ENTRIES || 0;
          const cachedEntries = LeaderboardManager.getCached && LeaderboardManager.getCached();
          if (Array.isArray(cachedEntries)) {
            const entries = cachedEntries.slice();
            const qualifies = LeaderboardManager.qualifiesForInitials(score, entries, max);
            toggleInitialsUI(qualifies);
          } else if (LeaderboardManager._pendingLoadPromise) {
            toggleInitialsUI(false);
            LeaderboardManager._pendingLoadPromise
              .then(
                /** @param {{id:string,score:number}[]|any} entries */
                (entries) => {
                  try {
                    if (!Array.isArray(entries)) {
                      toggleInitialsUI(true);
                      return;
                    }
                    const qualifies = LeaderboardManager.qualifiesForInitials(score, entries, max);
                    toggleInitialsUI(qualifies);
                  } catch (_) {
                    /* ignore - qualification check best effort */
                  }
                }
              )
              .catch(() => {});
          } else {
            const maybe = LeaderboardManager.load({ remote: LeaderboardManager.IS_REMOTE });
            if (Array.isArray(maybe)) {
              const qualifies = LeaderboardManager.qualifiesForInitials(score, maybe, max);
              toggleInitialsUI(qualifies);
            } else if (maybe && typeof maybe.then === "function") {
              toggleInitialsUI(false);
              maybe
                .then(
                  /** @param {{id:string,score:number}[]|any} entries */
                  (entries) => {
                    try {
                      if (!Array.isArray(entries)) {
                        toggleInitialsUI(true);
                        return;
                      }
                      const qualifies = LeaderboardManager.qualifiesForInitials(
                        score,
                        entries,
                        max
                      );
                      toggleInitialsUI(qualifies);
                    } catch (_) {
                      /* ignore - async qualification check best effort */
                    }
                  }
                )
                .catch(() => {});
            } else {
              toggleInitialsUI(true);
            }
          }
        }
      }
    } catch (_) {
      /* ignore */
    }
    const initialsInput = /** @type {HTMLElement|null} */ (
      document.getElementById("initialsInput")
    );
    const submitBtn = /** @type {HTMLElement|null} */ (document.getElementById("submitScoreBtn"));
    const visibleInitials =
      initialsInput && !initialsInput.classList.contains("hidden") ? initialsInput : null;
    let preferred = visibleInitials || restartBtn;
    if (typeof score === "number" && score === 0) {
      preferred = restartBtn;
    }

    if (preserveScroll) {
      UIManager._preserveFocus = true;
      /** @type {number|undefined} */
      let preserveTimeout;
      const clearPreserve = () => {
        UIManager._preserveFocus = false;
        try {
          if (preserveTimeout) clearTimeout(preserveTimeout);
        } catch (_) {
          void 0;
        }
      };
      try {
        preserveTimeout = setTimeout(() => {
          UIManager._preserveFocus = false;
        }, 5000);
      } catch (_) {
        UIManager._preserveFocus = false;
      }

      UIManager.focusPreserveScroll(preferred);
      try {
        const target = preferred;
        setTimeout(() => {
          try {
            if (UIManager._preserveFocus) UIManager.focusPreserveScroll(target);
            else UIManager.focusWithRetry(target);
          } catch (_) {
            void 0;
          }
        }, 120);
        setTimeout(() => {
          try {
            if (UIManager._preserveFocus) UIManager.focusPreserveScroll(target);
            else UIManager.focusWithRetry(target);
          } catch (_) {
            void 0;
          }
        }, 420);
      } catch (_) {
        void 0;
      }
      try {
        if (preferred && document.activeElement !== preferred) {
          preferred.classList.add("js-force-focus");
        }
      } catch (_) {
        /* ignore */
      }
      try {
        const onFocusIn = () => {
          try {
            const active = document.activeElement;
            if (active === preferred || active === restartBtn || active === submitBtn) {
              try {
                if (preferred) preferred.classList.remove("js-force-focus");
              } catch (_) {
                /* ignore */
              }
              clearPreserve();
              document.removeEventListener("focusin", onFocusIn);
            }
          } catch (_) {
            void 0;
          }
        };
        document.addEventListener("focusin", onFocusIn);
      } catch (_) {
        /* ignore */
      }
    } else {
      UIManager.focusWithRetry(preferred);
      try {
        const target = preferred;
        setTimeout(() => {
          try {
            UIManager.focusWithRetry(target);
          } catch (_) {
            void 0;
          }
        }, 120);
        setTimeout(() => {
          try {
            UIManager.focusWithRetry(target);
          } catch (_) {
            void 0;
          }
        }, 420);
      } catch (_) {
        /* ignore */
      }
    }
  }

  /** Hide game over overlay.
   * @param {HTMLElement|null} gameOverScreen
   */
  static hideGameOver(gameOverScreen) {
    if (gameOverScreen) gameOverScreen.classList.add("hidden");
  }

  /** Hide start/info overlay.
   * @param {HTMLElement|null} gameInfo
   */
  static hideGameInfo(gameInfo) {
    if (gameInfo) gameInfo.classList.add("hidden");
  }

  /** Try focusing an element reliably (helps on mobile).
   * Implements multi‑stage retry (requestAnimationFrame + timeouts) to defeat various mobile browser focus deferrals.
   * Adds a temporary visual cue if focus consistently fails.
   * @param {HTMLElement|null} el Target element.
   */
  static focusWithRetry(el) {
    if (!el) return;
    const tryFocus = () => {
      try {
        el.focus({ preventScroll: true });
      } catch (_) {
        try {
          el.focus();
        } catch (_) {
          /* ignore */
        }
      }
      try {
        if (document.activeElement !== el) el.focus();
      } catch (_) {
        /* ignore */
      }
    };
    tryFocus();
    if (document.activeElement !== el) {
      requestAnimationFrame(() => {
        tryFocus();
        if (document.activeElement !== el) {
          setTimeout(() => {
            tryFocus();
            if (document.activeElement !== el) {
              setTimeout(() => {
                tryFocus();
                if (document.activeElement !== el) {
                  setTimeout(() => {
                    tryFocus();
                    if (document.activeElement !== el) {
                      try {
                        el.classList.add("js-force-focus");
                        setTimeout(() => {
                          el.classList.remove("js-force-focus");
                        }, 2000);
                      } catch (_) {
                        /* ignore */
                      }
                    }
                  }, 750);
                }
              }, 250);
            }
          }, 100);
        }
      });
    }
  }

  /** Try focusing an element while preserving the document scroll position.
   * This attempts focus with {preventScroll:true} when supported, and as a
   * fallback will save/restore scroll coordinates around a plain focus call
   * so the act of focusing doesn't jump the page. Use this when you want the
   * element to receive focus but still allow the user to scroll the overlay
   * (e.g. leaderboard) immediately afterwards.
   * @param {HTMLElement|null} el Target element.
   */
  static focusPreserveScroll(el) {
    if (!el) return;
    const tryFocus = () => {
      try {
        el.focus({ preventScroll: true });
      } catch (_) {
        try {
          const scrollX =
            typeof window.scrollX === "number" ? window.scrollX : window.pageXOffset || 0;
          const scrollY =
            typeof window.scrollY === "number" ? window.scrollY : window.pageYOffset || 0;
          el.focus();
          try {
            window.scrollTo(scrollX, scrollY);
          } catch (_) {
            /* ignore */
          }
        } catch (_) {
          /* ignore */
        }
      }
      try {
        if (document.activeElement !== el) {
          const scrollX =
            typeof window.scrollX === "number" ? window.scrollX : window.pageXOffset || 0;
          const scrollY =
            typeof window.scrollY === "number" ? window.scrollY : window.pageYOffset || 0;
          el.focus();
          try {
            window.scrollTo(scrollX, scrollY);
          } catch (_) {
            /* ignore */
          }
        }
      } catch (_) {
        /* ignore */
      }
    };

    tryFocus();
    if (document.activeElement !== el) {
      requestAnimationFrame(() => {
        tryFocus();
        if (document.activeElement !== el) {
          setTimeout(() => {
            tryFocus();
            if (document.activeElement !== el) {
              setTimeout(() => {
                tryFocus();
                if (document.activeElement !== el) {
                  setTimeout(() => {
                    tryFocus();
                  }, 750);
                }
              }, 250);
            }
          }, 100);
        }
      });
    }
  }

  /** Ensure appropriate overlay button is focused based on visibility.
   * Respects _preserveFocus flag to decide focus strategy (scroll preserving vs retry).
   * @param {HTMLElement|null} gameInfo Start overlay element.
   * @param {HTMLElement|null} startBtn Start button element.
   * @param {HTMLElement|null} gameOverScreen Game Over overlay element.
   * @param {HTMLElement|null} restartBtn Restart button element.
   */
  static ensureOverlayFocus(gameInfo, startBtn, gameOverScreen, restartBtn) {
    if (gameOverScreen && !gameOverScreen.classList.contains("hidden")) {
      const inputEl = /** @type {HTMLElement|null} */ (document.getElementById("initialsInput"));
      const preferredEl = inputEl && !inputEl.classList.contains("hidden") ? inputEl : restartBtn;
      if (UIManager._preserveFocus) UIManager.focusPreserveScroll(preferredEl);
      else UIManager.focusWithRetry(preferredEl);
      return;
    }
    if (gameInfo && !gameInfo.classList.contains("hidden")) {
      if (UIManager._preserveFocus) UIManager.focusPreserveScroll(startBtn);
      else UIManager.focusWithRetry(startBtn);
      return;
    }
  }

  /** Window focus/pageshow handler: reassert overlay focus after tab/app switches.
   * @param {HTMLElement|null} gameInfo Start overlay element.
   * @param {HTMLElement|null} startBtn Start button.
   * @param {HTMLElement|null} gameOverScreen Game Over overlay.
   * @param {HTMLElement|null} restartBtn Restart button.
   */
  static handleWindowFocus(gameInfo, startBtn, gameOverScreen, restartBtn) {
    UIManager.ensureOverlayFocus(gameInfo, startBtn, gameOverScreen, restartBtn);
  }

  /** Visibility change handler: when page becomes visible, reassert overlay focus.
   * @param {HTMLElement|null} gameInfo Start overlay element.
   * @param {HTMLElement|null} startBtn Start button.
   * @param {HTMLElement|null} gameOverScreen Game Over overlay.
   * @param {HTMLElement|null} restartBtn Restart button.
   */
  static handleVisibilityChange(gameInfo, startBtn, gameOverScreen, restartBtn) {
    if (!document.hidden) {
      UIManager.ensureOverlayFocus(gameInfo, startBtn, gameOverScreen, restartBtn);
    }
  }

  /** Focus-in guard: if overlays are visible, ensure intended control retains focus (accessibility & keyboard UX).
   * Allows interaction with initials input & submit button on Game Over overlay, and links inside overlays.
   * @param {FocusEvent} e Native focusin event.
   * @param {HTMLElement|null} gameInfo Start overlay.
   * @param {HTMLElement|null} startBtn Start button.
   * @param {HTMLElement|null} gameOverScreen Game Over overlay.
   * @param {HTMLElement|null} restartBtn Restart button.
   */
  static handleDocumentFocusIn(e, gameInfo, startBtn, gameOverScreen, restartBtn) {
    const overlayGameOverVisible = !!(
      gameOverScreen && !gameOverScreen.classList.contains("hidden")
    );
    const overlayStartVisible = !!(gameInfo && !gameInfo.classList.contains("hidden"));
    if (!overlayGameOverVisible && !overlayStartVisible) return;

    const t = UIManager.isElement(e && e.target) ? /** @type {Element} */ (e.target) : null;
    if (overlayGameOverVisible) {
      const isRestart =
        t === restartBtn || (t && typeof t.closest === "function" && t.closest("#restartBtn"));
      const initialsEl = /** @type {HTMLElement|null} */ (document.getElementById("initialsInput"));
      const submitEl = /** @type {HTMLElement|null} */ (document.getElementById("submitScoreBtn"));
      const isInitials =
        initialsEl &&
        !initialsEl.classList.contains("hidden") &&
        (t === initialsEl || (t && typeof t.closest === "function" && t.closest("#initialsInput")));
      const isSubmit =
        submitEl &&
        !submitEl.classList.contains("hidden") &&
        (t === submitEl || (t && typeof t.closest === "function" && t.closest("#submitScoreBtn")));

      if (!isRestart && !isInitials && !isSubmit) {
        if (UIManager._preserveFocus) UIManager.focusPreserveScroll(restartBtn);
        else UIManager.focusWithRetry(restartBtn);
      }
      return;
    }
    if (overlayStartVisible) {
      const targetIsLink = t && typeof t.closest === "function" && t.closest("a");
      if (targetIsLink) return;
      const isStart =
        t === startBtn || (t && typeof t.closest === "function" && t.closest("#startBtn"));
      if (!isStart) UIManager.focusWithRetry(startBtn);
    }
  }

  /** Focus / interaction guard while Start overlay visible.
   * Prevents stray clicks/taps focusing outside the primary Start button (except links).
   * For blur events, respects navigation to overlay anchor links.
   * @param {Event} e DOM event (blur/mousedown/touchstart).
   * @param {HTMLElement|null} gameInfo Start overlay element.
   * @param {HTMLElement|null} startBtn Start button element.
   */
  static handleStartScreenFocusGuard(e, gameInfo, startBtn) {
    if (!gameInfo || gameInfo.classList.contains("hidden")) return;
    const t = UIManager.isElement(e && e.target) ? /** @type {Element} */ (e.target) : null;
    const targetIsLink = t && typeof t.closest === "function" && t.closest("a");
    const targetIsStart =
      t === startBtn || (t && typeof t.closest === "function" && t.closest("#startBtn"));

    if (e.type === "blur") {
      const related = /** @type {HTMLElement|null} */ (
        (e && /** @type {any} */ (e).relatedTarget) || document.activeElement
      );
      const movedToLink = related && typeof related.closest === "function" && related.closest("a");
      const movedInsideOverlay = gameInfo && related && gameInfo.contains(related);
      if (movedToLink && movedInsideOverlay) {
        return;
      }
    }

    if (targetIsLink) {
      return;
    }
    if (!targetIsStart) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
    }

    if (UIManager._preserveFocus) UIManager.focusPreserveScroll(startBtn);
    else UIManager.focusWithRetry(startBtn);
  }

  /** Focus / interaction guard while Game Over overlay visible.
   * Allows leaderboard scroll + initials entry + restart button; redirects other focus attempts.
   * @param {Event} e DOM event (mousedown/touchstart/focus events).
   * @param {HTMLElement|null} gameOverScreen Overlay root.
   * @param {HTMLElement|null} restartBtn Restart button element.
   */
  static handleGameOverFocusGuard(e, gameOverScreen, restartBtn) {
    if (!gameOverScreen || gameOverScreen.classList.contains("hidden")) return;
    const t = UIManager.isElement(e && e.target) ? /** @type {Element} */ (e.target) : null;
    const targetIsLink = t && typeof t.closest === "function" && t.closest("a");
    if (targetIsLink) return;
    const leaderboard = document.getElementById("leaderboardList");
    const targetIsLeaderboard =
      leaderboard &&
      t &&
      (t === leaderboard || (typeof t.closest === "function" && t.closest("#leaderboardList")));
    if (targetIsLeaderboard) return;
    const targetIsRestart =
      t === restartBtn || (t && typeof t.closest === "function" && t.closest("#restartBtn"));
    const initialsEl = /** @type {HTMLElement|null} */ (document.getElementById("initialsInput"));
    const submitEl = /** @type {HTMLElement|null} */ (document.getElementById("submitScoreBtn"));
    const targetIsInitials =
      initialsEl &&
      !initialsEl.classList.contains("hidden") &&
      (t === initialsEl || (t && typeof t.closest === "function" && t.closest("#initialsInput")));
    const targetIsSubmit =
      submitEl &&
      !submitEl.classList.contains("hidden") &&
      (t === submitEl || (t && typeof t.closest === "function" && t.closest("#submitScoreBtn")));
    // If the restart button itself is blurring but there are no interactive
    // initials / submit controls visible, immediately reclaim focus so that
    // stray taps/clicks (especially on mobile) don't leave the overlay with
    // no focused control. This matches the UX request to "keep focus on the
    // Play Again button when the submit button is not visible".
    if (targetIsRestart) {
      if (
        e &&
        e.type === "blur" &&
        (!initialsEl || initialsEl.classList.contains("hidden")) &&
        (!submitEl || submitEl.classList.contains("hidden"))
      ) {
        if (UIManager._preserveFocus) UIManager.focusPreserveScroll(restartBtn);
        else UIManager.focusWithRetry(restartBtn);
      }
      return; // Always return after handling restart target.
    }
    // If the submit button itself is blurring and is visible, reclaim focus to submit button.
    if (targetIsSubmit) {
      if (e && e.type === "blur" && submitEl && !submitEl.classList.contains("hidden")) {
        if (UIManager._preserveFocus) UIManager.focusPreserveScroll(submitEl);
        else UIManager.focusWithRetry(submitEl);
      }
      return;
    }
    if (targetIsInitials) return;

    if (UIManager._preserveFocus) UIManager.focusPreserveScroll(restartBtn);
    else UIManager.focusWithRetry(restartBtn);
  }
}

try {
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("leaderboard:updated", () => {
      try {
        const list = /** @type {HTMLElement|null} */ (document.getElementById("leaderboardList"));
        if (list) LeaderboardManager.render(list);
      } catch (_) {
        /* ignore */
      }
    });
  }
} catch (_) {
  /* ignore */
}
