/**
 * UIManager centralizes DOM updates and focus management for overlays and scores.
 */
import LeaderboardManager from "./LeaderboardManager.js";
export class UIManager {
  // When true prefer scroll-preserving focus calls while overlays are visible.
  static _preserveFocus = false;
  /** Safe Element check for non-browser environments. */
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
   * Update visible countdown timer text.
   * @param {HTMLElement|null} timerEl
   * @param {number} secondsRemaining
   */
  static setTimer(timerEl, secondsRemaining) {
    if (!timerEl) return;
    // Format M:SS
    const s = Math.max(0, Math.floor(secondsRemaining));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    timerEl.textContent = `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  /** Set and persist high score; returns the new high score.
   * @param {number} score
   * @param {number} [prevHigh]
   * @param {HTMLElement|null} [highScoreEl]
   * @returns {number}
   */
  // High score persistence delegated to LeaderboardManager

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

  /** Show game over overlay and focus restart button.
   * @param {HTMLElement|null} gameOverScreen
   * @param {HTMLElement|null} restartBtn
   * @param {HTMLElement|null} finalScoreEl
   * @param {number} score
   * @param {boolean} [preserveScroll=false]  If true, attempt to focus without causing page scroll.
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
    // Always ensure the leaderboard (if present) is scrolled to the top when
    // the Game Over panel is displayed so users see the top entries first.
    try {
      const leaderboard = /** @type {HTMLElement|null} */ (
        document.getElementById("leaderboardList")
      );
      if (leaderboard) {
        // Prefer native scrollTo when available to avoid layout thrash.
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

    // Show initials form only if score is >0 AND would place within top MAX_ENTRIES.
    // If caller explicitly supplies allowInitials boolean, it overrides ranking logic.
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

      // If explicitly overridden just honor it.
      if (typeof allowInitials === "boolean") {
        toggleInitialsUI(allowInitials);
      } else {
        const baseline = typeof score === "number" && score > 0;
        if (!baseline) {
          toggleInitialsUI(false);
        } else {
          // Determine if score qualifies for top MAX_ENTRIES.
          const max = LeaderboardManager.MAX_ENTRIES || 0;
          // Use cached entries when available to avoid async flash.
          if (Array.isArray(LeaderboardManager._cacheEntries)) {
            const entries = LeaderboardManager._cacheEntries.slice().sort(
              /** @param {{id:string,score:number}} a @param {{id:string,score:number}} b */
              (a, b) => b.score - a.score
            );
            const qualifies =
              entries.length < max ||
              entries.some(
                /** @param {{id:string,score:number}} e @param {number} idx */
                (e, idx) => idx < max && score > e.score
              );
            toggleInitialsUI(qualifies);
          } else if (LeaderboardManager._pendingLoadPromise) {
            // Hide until load completes to avoid flicker, then decide.
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
                    const sorted = entries.slice().sort(
                      /** @param {{id:string,score:number}} a @param {{id:string,score:number}} b */
                      (a, b) => b.score - a.score
                    );
                    const qualifies =
                      sorted.length < max ||
                      sorted.some(
                        /** @param {{id:string,score:number}} e @param {number} idx */
                        (e, idx) => idx < max && score > e.score
                      );
                    toggleInitialsUI(qualifies);
                  } catch (_) {
                    /* ignore - qualification check best effort */
                  }
                }
              )
              .catch(() => {});
          } else {
            // Trigger a load (respect remote flag) and decide afterwards.
            const maybe = LeaderboardManager.load({ remote: LeaderboardManager.IS_REMOTE });
            if (Array.isArray(maybe)) {
              const sorted = maybe.slice().sort(
                /** @param {{id:string,score:number}} a @param {{id:string,score:number}} b */
                (a, b) => b.score - a.score
              );
              const qualifies =
                sorted.length < max ||
                sorted.some(
                  /** @param {{id:string,score:number}} e @param {number} idx */
                  (e, idx) => idx < max && score > e.score
                );
              toggleInitialsUI(qualifies);
            } else if (maybe && typeof maybe.then === "function") {
              toggleInitialsUI(false); // hide while loading
              maybe
                .then(
                  /** @param {{id:string,score:number}[]|any} entries */
                  (entries) => {
                    try {
                      if (!Array.isArray(entries)) {
                        toggleInitialsUI(true);
                        return;
                      }
                      const sorted = entries.slice().sort(
                        /** @param {{id:string,score:number}} a @param {{id:string,score:number}} b */
                        (a, b) => b.score - a.score
                      );
                      const qualifies =
                        sorted.length < max ||
                        sorted.some(
                          /** @param {{id:string,score:number}} e @param {number} idx */
                          (e, idx) => idx < max && score > e.score
                        );
                      toggleInitialsUI(qualifies);
                    } catch (_) {
                      /* ignore - async qualification check best effort */
                    }
                  }
                )
                .catch(() => {});
            } else {
              // Fallback: show if baseline positive score.
              toggleInitialsUI(true);
            }
          }
        }
      }
    } catch (_) {
      /* ignore */
    }
    // Remember caller preference so document-level focus guards use the
    // scroll-preserving focus method for a short period.
    // Prefer focusing the initials input when present so users can type
    // their initials immediately. Respect preserveScroll when choosing
    // the focus method but always prefer the input over the restart button.
    const initialsInput = /** @type {HTMLElement|null} */ (
      document.getElementById("initialsInput")
    );
    const submitBtn = /** @type {HTMLElement|null} */ (document.getElementById("submitScoreBtn"));
    // Consider initials input/submission present only when they are visible.
    const visibleInitials =
      initialsInput && !initialsInput.classList.contains("hidden") ? initialsInput : null;
    // Prefer the initials input so users can type immediately, but if the
    // final score is zero or the initials UI is hidden prefer focusing
    // the Play/Restart button so users can immediately play again.
    let preferred = visibleInitials || restartBtn;
    if (typeof score === "number" && score === 0) {
      preferred = restartBtn;
    }

    if (preserveScroll) {
      UIManager._preserveFocus = true;
      // Clear the preference after a longer grace period so slower mobile
      // browsers have time to accept focus after native prompts.
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

      // Attempt immediate focus (best-effort) on the preferred element
      // using the scroll-preserving path.
      UIManager.focusPreserveScroll(preferred);
      // Also schedule a couple of short retries to handle browsers that
      // refuse focus initially (some mobile browsers) or that move focus
      // during overlay show. These retries are best-effort and will be
      // no-ops if the element is already focused or removed.
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
      // If the browser blocks real focus, provide a visible fallback so
      // users still see the intended target.
      try {
        if (preferred && document.activeElement !== preferred) {
          preferred.classList.add("js-force-focus");
        }
      } catch (_) {
        /* ignore */
      }
      // Attempt clear visual indicator removal later if focus finally succeeds.
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
      // Retry shortly in case the browser steals focus or the element is
      // not immediately focusable due to rendering. This keeps Play Again
      // focused reliably for score==0 cases and initials for score>0.
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
   * @param {HTMLElement|null} el
   */
  static focusWithRetry(el) {
    if (!el) return;
    const tryFocus = () => {
      try {
        // Prefer focus with options when available to avoid scrolling.
        el.focus({ preventScroll: true });
        // Some mobile browsers ignore focus(options); try plain focus as fallback.
      } catch (_) {
        try {
          el.focus();
        } catch (_) {
          /* ignore */
        }
      }
      // If focus with options didn't take effect, try plain focus too.
      try {
        if (document.activeElement !== el) el.focus();
      } catch (_) {
        /* ignore */
      }
    };
    tryFocus();
    // Retry focusing a few times. If the browser still doesn't honor focus
    // (common on some mobile browsers), add a temporary CSS class to give a
    // visible focus indication so users see the Play/Restart button is the
    // intended target.
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
                    // If focus still failed, add temporary visual indicator
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
   * @param {HTMLElement|null} el
   */
  static focusPreserveScroll(el) {
    if (!el) return;
    const tryFocus = () => {
      try {
        // Prefer focus with options when available to avoid scrolling.
        el.focus({ preventScroll: true });
      } catch (_) {
        try {
          // Save scroll then focus and restore to avoid jumps in browsers
          // that don't honor preventScroll.
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
          // Attempt plain focus as last resort then restore scroll.
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

    // Run initial attempt and a sequence of retries like focusWithRetry so
    // mobile browsers that delay focusing still receive focus.
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
   * @param {HTMLElement|null} gameInfo
   * @param {HTMLElement|null} startBtn
   * @param {HTMLElement|null} gameOverScreen
   * @param {HTMLElement|null} restartBtn
   */
  static ensureOverlayFocus(gameInfo, startBtn, gameOverScreen, restartBtn) {
    if (gameOverScreen && !gameOverScreen.classList.contains("hidden")) {
      // When ensuring overlay focus, prefer the initials input when present.
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

  /** Window focus/pageshow handler to restore overlay focus.
   * @param {HTMLElement|null} gameInfo
   * @param {HTMLElement|null} startBtn
   * @param {HTMLElement|null} gameOverScreen
   * @param {HTMLElement|null} restartBtn
   */
  static handleWindowFocus(gameInfo, startBtn, gameOverScreen, restartBtn) {
    UIManager.ensureOverlayFocus(gameInfo, startBtn, gameOverScreen, restartBtn);
  }

  /** Document visibility handler to restore overlay focus when visible.
   * @param {HTMLElement|null} gameInfo
   * @param {HTMLElement|null} startBtn
   * @param {HTMLElement|null} gameOverScreen
   * @param {HTMLElement|null} restartBtn
   */
  static handleVisibilityChange(gameInfo, startBtn, gameOverScreen, restartBtn) {
    if (!document.hidden) {
      UIManager.ensureOverlayFocus(gameInfo, startBtn, gameOverScreen, restartBtn);
    }
  }

  /** Document-level focusin guard to restore focus to visible overlay button on mobile.
   * @param {FocusEvent} e
   * @param {HTMLElement|null} gameInfo
   * @param {HTMLElement|null} startBtn
   * @param {HTMLElement|null} gameOverScreen
   * @param {HTMLElement|null} restartBtn
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

      // If the user is interacting with the initials input or submit button,
      // don't yank focus back to the restart button.
      if (!isRestart && !isInitials && !isSubmit) {
        if (UIManager._preserveFocus) UIManager.focusPreserveScroll(restartBtn);
        else UIManager.focusWithRetry(restartBtn);
      }
      return;
    }
    if (overlayStartVisible) {
      // Allow links (e.g. About) inside the overlay to receive focus via keyboard
      const targetIsLink = t && typeof t.closest === "function" && t.closest("a");
      if (targetIsLink) return;
      const isStart =
        t === startBtn || (t && typeof t.closest === "function" && t.closest("#startBtn"));
      if (!isStart) UIManager.focusWithRetry(startBtn);
    }
  }

  /** Focus guard while Start overlay is visible.
   * @param {Event} e
   * @param {HTMLElement|null} gameInfo
   * @param {HTMLElement|null} startBtn
   */
  static handleStartScreenFocusGuard(e, gameInfo, startBtn) {
    if (!gameInfo || gameInfo.classList.contains("hidden")) return;
    const t = UIManager.isElement(e && e.target) ? /** @type {Element} */ (e.target) : null;
    // Allow links (e.g. About) inside the overlay to be activated.
    // For blur events, the event target is the element losing focus, so
    // inspect the relatedTarget (or document.activeElement) to determine
    // where focus moved. If focus moved to an anchor inside the overlay,
    // don't yank it back.
    const targetIsLink = t && typeof t.closest === "function" && t.closest("a");
    const targetIsStart =
      t === startBtn || (t && typeof t.closest === "function" && t.closest("#startBtn"));

    if (e.type === "blur") {
      // FocusEvent may provide relatedTarget; fall back to document.activeElement
      const related = /** @type {HTMLElement|null} */ (
        (e && /** @type {any} */ (e).relatedTarget) || document.activeElement
      );
      const movedToLink = related && typeof related.closest === "function" && related.closest("a");
      const movedInsideOverlay = gameInfo && related && gameInfo.contains(related);
      if (movedToLink && movedInsideOverlay) {
        // Allow tab/shift+tab to move focus to anchors inside the overlay.
        return;
      }
    }

    // For non-blur interactions (mousedown/touchstart) allow interaction
    // with links (e.g. About) inside the overlay. Otherwise prevent
    // interaction with non-start targets and restore focus to the start
    // button.
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

  /** Focus guard while Game Over overlay is visible.
   * @param {Event} e
   * @param {HTMLElement|null} gameOverScreen
   * @param {HTMLElement|null} restartBtn
   */
  static handleGameOverFocusGuard(e, gameOverScreen, restartBtn) {
    if (!gameOverScreen || gameOverScreen.classList.contains("hidden")) return;
    const t = UIManager.isElement(e && e.target) ? /** @type {Element} */ (e.target) : null;
    // Allow links inside the game over overlay to be activated
    const targetIsLink = t && typeof t.closest === "function" && t.closest("a");
    if (targetIsLink) return;
    // Allow interaction with leaderboard (for scrolling/touch)
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

    // Do not prevent default or stop propagation here: allow touch/scroll
    // interactions (e.g. scrolling the leaderboard) to continue. Only
    // ensure the restart button regains focus when appropriate. If the
    // user is interacting with the initials input or submit button, or
    // the restart button itself, do not yank focus.
    if (targetIsRestart || targetIsInitials || targetIsSubmit) return;

    if (UIManager._preserveFocus) UIManager.focusPreserveScroll(restartBtn);
    else UIManager.focusWithRetry(restartBtn);
  }
}

// Listen for leaderboard updates (dispatched by LeaderboardManager.save) and
// re-render the visible leaderboard list if present. Guarded so it only runs
// when a browser-like window/document exists.
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
