/**
 * UIManager centralizes DOM updates and focus management for overlays and scores.
 */
import { LeaderboardManager } from "./LeaderboardManager.js";
export class UIManager {
  static _preserveFocus = false;
  /** @type {(() => void)|null} */
  static _initialsSubmitFocusCleanup = null;

  // ----------------------------
  // Generic small helpers (internal – not part of public API surface)
  // ----------------------------

  /** Execute a function and ignore any thrown error (defensive DOM ops). */
  /**
   * @param {() => any} fn
   * @returns {any}
   */
  static _try(fn) {
    try {
      return fn();
    } catch (_) {
      return undefined;
    }
  }

  /** Return document element by id (defensive for non‑browser env). */
  /**
   * @param {string} id
   * @returns {HTMLElement|null}
   */
  static _byId(id) {
    try {
      return typeof document !== "undefined" ? document.getElementById(id) : null;
    } catch (_) {
      return null;
    }
  }

  /** Scroll leaderboard list (if present) back to top. */
  static _resetLeaderboardScroll() {
    const list = UIManager._byId("leaderboardList");
    if (!list) return;
    UIManager._try(() => {
      if (typeof list.scrollTo === "function") list.scrollTo(0, 0);
      else list.scrollTop = 0;
    });
    // Fallback legacy attempt.
    UIManager._try(() => {
      // If previous attempt threw, ensure scrollTop=0.
      list.scrollTop = 0;
    });
  }

  /** Gather all initials related elements (works for inline or standalone overlay). */
  static _getInitialsElements() {
    /** @type {HTMLElement|null} */ const initialsScreen = UIManager._byId("initialsScreen");
    /** @type {HTMLElement|null} */ let initialsEntry = null;
    UIManager._try(() => {
      initialsEntry =
        initialsScreen?.querySelector?.(".initials-entry") ||
        document.querySelector?.(".initials-entry") ||
        null;
    });
    return {
      initialsScreen,
      initialsEntry,
      initialsInput: UIManager._byId("initialsInput"),
      submitBtn: UIManager._byId("submitScoreBtn"),
      initialsLabel: UIManager._byId("initialsLabel"),
    };
  }

  /** Toggle visibility of initials UI (standalone or inline) while keeping Game Over overlay state consistent. */
  /**
   * @param {boolean} visible
   * @param {HTMLElement|null} gameOverScreen
   * @param {{initialsScreen:HTMLElement|null, initialsEntry:HTMLElement|null, initialsInput:HTMLElement|null, submitBtn:HTMLElement|null, initialsLabel:HTMLElement|null}} elements
   */
  static _toggleInitialsUI(visible, gameOverScreen, elements) {
    const { initialsScreen, initialsEntry, initialsInput, submitBtn, initialsLabel } = elements;
    const method = visible ? "remove" : "add";

    UIManager._try(() => {
      if (initialsScreen) initialsScreen.classList[method]("hidden");
    });
    UIManager._try(() => {
      if (initialsEntry) initialsEntry.classList[method]("hidden");
    });

    // If a standalone initials overlay is used, hide the main game over screen while initials are visible.
    if (initialsScreen && gameOverScreen) {
      UIManager._try(() => {
        if (visible) gameOverScreen.classList.add("hidden");
        else gameOverScreen.classList.remove("hidden");
      });
    }

    UIManager._try(() => {
      if (initialsInput) initialsInput.classList[method]("hidden");
    });
    UIManager._try(() => {
      if (submitBtn) submitBtn.classList[method]("hidden");
    });
    UIManager._try(() => {
      if (initialsLabel) initialsLabel.classList[method]("hidden");
    });
    UIManager._try(() => {
      UIManager.syncInitialsSubmitFocusGuard();
    });
  }

  /** Determine and apply initials UI visibility using leaderboard qualification logic. */
  /**
   * @param {number} score
   * @param {boolean|undefined} allowInitials
   * @param {HTMLElement|null} gameOverScreen
   * @param {{initialsScreen:HTMLElement|null, initialsEntry:HTMLElement|null, initialsInput:HTMLElement|null, submitBtn:HTMLElement|null, initialsLabel:HTMLElement|null}} elements
   */
  static _applyInitialsQualification(score, allowInitials, gameOverScreen, elements) {
    const toggle = /** @param {boolean} v */ (v) =>
      UIManager._toggleInitialsUI(v, gameOverScreen, elements);
    // Explicit override always wins.
    if (typeof allowInitials === "boolean") {
      toggle(allowInitials);
      return;
    }
    const baseline = typeof score === "number" && score > 0;
    if (!baseline) {
      toggle(false);
      return;
    }

    const max = LeaderboardManager.MAX_ENTRIES || 0;
    const cachedEntries =
      typeof LeaderboardManager.getCached === "function" && LeaderboardManager.getCached();
    if (Array.isArray(cachedEntries)) {
      const qualifies = LeaderboardManager.qualifiesForInitials(score, cachedEntries.slice(), max);
      toggle(qualifies);
      return;
    }

    // Pending load promise branch.
    if (LeaderboardManager._pendingLoadPromise) {
      toggle(false);
      LeaderboardManager._pendingLoadPromise
        .then((entries) => {
          UIManager._try(() => {
            if (!Array.isArray(entries)) {
              toggle(true); // Unknown shape – show form to be safe.
              return;
            }
            const qualifies = LeaderboardManager.qualifiesForInitials(score, entries, max);
            toggle(qualifies);
          });
        })
        .catch(() => {});
      return;
    }

    const maybe = LeaderboardManager.load({ remote: LeaderboardManager.IS_REMOTE });
    if (Array.isArray(maybe)) {
      const qualifies = LeaderboardManager.qualifiesForInitials(score, maybe, max);
      toggle(qualifies);
      return;
    }
    if (maybe && typeof maybe.then === "function") {
      toggle(false);
      maybe
        .then((entries) => {
          UIManager._try(() => {
            if (!Array.isArray(entries)) {
              toggle(true);
              return;
            }
            const qualifies = LeaderboardManager.qualifiesForInitials(score, entries, max);
            toggle(qualifies);
          });
        })
        .catch(() => {});
      return;
    }
    // Fallback unknown result – show initials.
    toggle(true);
  }

  /** Internal shared multi-stage focus retry sequence. */
  /**
   * @param {HTMLElement|null} el
   * @param {() => void} attemptFn
   * @param {{forceCue?:boolean}} [options]
   */
  static _retryFocus(el, attemptFn, options = {}) {
    const { forceCue = false } = options || {};
    if (!el) return;
    const hasDocument = typeof document !== "undefined";
    const getActive = () => (hasDocument ? document.activeElement : null);
    const attempt = () => {
      try {
        attemptFn();
      } catch (_) {
        /* ignore */
      }
      // Try a plain focus fallback if still not active.
      if (hasDocument && getActive() !== el) UIManager._try(() => el.focus());
    };
    attempt();
    if (hasDocument && getActive() === el) return;
    requestAnimationFrame(() => {
      attempt();
      if (hasDocument && getActive() === el) return;
      setTimeout(() => {
        attempt();
        if (hasDocument && getActive() === el) return;
        setTimeout(() => {
          attempt();
          if (hasDocument && getActive() === el) return;
          setTimeout(() => {
            attempt();
            if (hasDocument && getActive() === el) return;
            if (forceCue) {
              UIManager._try(() => {
                el.classList.add("js-force-focus");
                setTimeout(() => UIManager._try(() => el.classList.remove("js-force-focus")), 2000);
              });
            }
          }, 750);
        }, 250);
      }, 100);
    });
  }

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
    UIManager._resetLeaderboardScroll();

    // Initials gating / visibility handling
    const initialsElements = UIManager._getInitialsElements();
    UIManager._applyInitialsQualification(score, allowInitials, gameOverScreen, initialsElements);

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
      UIManager._try(() => {
        const target = preferred;
        setTimeout(
          () =>
            UIManager._try(() => {
              if (UIManager._preserveFocus) UIManager.focusPreserveScroll(target);
              else UIManager.focusWithRetry(target);
            }),
          120
        );
        setTimeout(
          () =>
            UIManager._try(() => {
              if (UIManager._preserveFocus) UIManager.focusPreserveScroll(target);
              else UIManager.focusWithRetry(target);
            }),
          420
        );
      });
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
      UIManager._try(() => {
        const target = preferred;
        setTimeout(() => UIManager._try(() => UIManager.focusWithRetry(target)), 120);
        setTimeout(() => UIManager._try(() => UIManager.focusWithRetry(target)), 420);
      });
    }

    try {
      UIManager.syncInitialsSubmitFocusGuard();
    } catch (_) {
      /* ignore */
    }
  }

  /** Hide game over overlay.
   * @param {HTMLElement|null} gameOverScreen
   */
  static hideGameOver(gameOverScreen) {
    if (gameOverScreen) gameOverScreen.classList.add("hidden");
    try {
      UIManager.teardownInitialsSubmitFocusGuard();
    } catch (_) {
      /* ignore */
    }
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
    UIManager._retryFocus(
      el,
      () => {
        try {
          el.focus({ preventScroll: true });
        } catch (_) {
          UIManager._try(() => el.focus());
        }
      },
      { forceCue: true }
    );
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
    UIManager._retryFocus(
      el,
      () => {
        try {
          el.focus({ preventScroll: true });
        } catch (_) {
          const scrollX =
            typeof window.scrollX === "number" ? window.scrollX : window.pageXOffset || 0;
          const scrollY =
            typeof window.scrollY === "number" ? window.scrollY : window.pageYOffset || 0;
          UIManager._try(() => el.focus());
          UIManager._try(() => window.scrollTo(scrollX, scrollY));
        }
        if (document.activeElement !== el) {
          const scrollX =
            typeof window.scrollX === "number" ? window.scrollX : window.pageXOffset || 0;
          const scrollY =
            typeof window.scrollY === "number" ? window.scrollY : window.pageYOffset || 0;
          UIManager._try(() => el.focus());
          UIManager._try(() => window.scrollTo(scrollX, scrollY));
        }
      },
      { forceCue: false }
    );
  }

  /** Remove any active initials screen focus guard listeners. */
  static teardownInitialsSubmitFocusGuard() {
    const cleanup = UIManager._initialsSubmitFocusCleanup;
    if (typeof cleanup === "function") {
      try {
        cleanup();
      } catch (_) {
        /* ignore */
      }
    }
    UIManager._initialsSubmitFocusCleanup = null;
  }

  /** Ensure taps/clicks outside the initials input focus the submit button. */
  static syncInitialsSubmitFocusGuard() {
    UIManager.teardownInitialsSubmitFocusGuard();
    try {
      const submitBtn = /** @type {HTMLElement|null} */ (document.getElementById("submitScoreBtn"));
      if (!submitBtn || submitBtn.classList.contains("hidden")) return;

      /** @type {HTMLElement[]} */
      const containers = [];
      const initialsScreen = /** @type {HTMLElement|null} */ (
        document.getElementById("initialsScreen")
      );
      if (initialsScreen && !initialsScreen.classList.contains("hidden")) {
        containers.push(initialsScreen);
      }
      if (!containers.length) {
        const inlineEntry = /** @type {HTMLElement|null} */ (
          document.querySelector(".initials-entry")
        );
        if (inlineEntry && !inlineEntry.classList.contains("hidden")) {
          containers.push(inlineEntry);
        }
      }
      if (!containers.length) return;

      /**
       * Redirect focus to submit button when interacting outside the initials input.
       * @param {Event} event
       */
      const handler = (event) => {
        try {
          const submit = /** @type {HTMLElement|null} */ (
            document.getElementById("submitScoreBtn")
          );
          if (!submit || submit.classList.contains("hidden")) {
            UIManager.syncInitialsSubmitFocusGuard();
            return;
          }
          const input = /** @type {HTMLElement|null} */ (document.getElementById("initialsInput"));
          const target = UIManager.isElement(event && event.target)
            ? /** @type {Element} */ (event.target)
            : null;
          const insideInput =
            input &&
            !input.classList.contains("hidden") &&
            target &&
            typeof target.closest === "function" &&
            (target === input || !!target.closest("#initialsInput"));
          if (insideInput) return;
          const insideLabel =
            target && typeof target.closest === "function" && !!target.closest("#initialsLabel");
          if (insideLabel) return;
          const insideSubmit =
            submit &&
            target &&
            typeof target.closest === "function" &&
            (target === submit || !!target.closest("#submitScoreBtn"));
          if (insideSubmit) return;

          if (event && event.cancelable) {
            try {
              event.preventDefault();
            } catch (_) {
              /* ignore */
            }
          }
          try {
            if (event && typeof event.stopPropagation === "function") {
              event.stopPropagation();
            }
          } catch (_) {
            /* ignore */
          }

          if (UIManager._preserveFocus) UIManager.focusPreserveScroll(submit);
          else UIManager.focusWithRetry(submit);
        } catch (_) {
          /* ignore */
        }
      };

      const touchOptions = { capture: true, passive: false };
      containers.forEach((container) => {
        try {
          container.addEventListener("mousedown", handler, true);
        } catch (_) {
          /* ignore */
        }
        try {
          container.addEventListener("touchstart", handler, touchOptions);
        } catch (_) {
          /* ignore */
        }
      });

      UIManager._initialsSubmitFocusCleanup = () => {
        containers.forEach((container) => {
          try {
            container.removeEventListener("mousedown", handler, true);
          } catch (_) {
            /* ignore */
          }
          try {
            container.removeEventListener("touchstart", handler, touchOptions);
          } catch (_) {
            /* ignore */
          }
        });
      };
    } catch (_) {
      /* ignore */
    }
  }

  /**
   * Recenter the leaderboard panel in the viewport.
   * This helps when the on-screen keyboard may have shifted the viewport
   * (mobile) — call after a submit to bring the leaderboard back into view.
   */
  static recenterLeaderboard() {
    try {
      const list =
        typeof document !== "undefined" ? document.getElementById("leaderboardList") : null;
      const container =
        typeof document !== "undefined" ? document.getElementById("leaderboard") : null;
      const target = list || container;
      if (!target) return;

      // Prefer centering the element in viewport. Use smooth behavior where supported.
      try {
        if (typeof target.scrollIntoView === "function") {
          // { block: 'center' } recenters vertically; graceful fallback if options unsupported.
          try {
            target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
            return;
          } catch (_) {
            // options may not be supported; fall through to simple call.
            try {
              target.scrollIntoView();
              return;
            } catch (_) {
              /* ignore */
            }
          }
        }
      } catch (_) {
        /* ignore */
      }

      // Fallback: compute center and scroll window manually.
      try {
        const rect = target.getBoundingClientRect();
        const absY = (rect.top + rect.bottom) / 2 + (window.pageYOffset || window.scrollY || 0);
        const top = Math.max(0, Math.floor(absY - (window.innerHeight || 0) / 2));
        try {
          window.scrollTo({ top, behavior: "smooth" });
        } catch (_) {
          try {
            window.scrollTo(0, top);
          } catch (_) {
            /* ignore */
          }
        }
      } catch (_) {
        /* ignore */
      }
    } catch (_) {
      /* ignore */
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
    // If the game over overlay is showing, prefer the initials input if visible.
    if (gameOverScreen && !gameOverScreen.classList.contains("hidden")) {
      const initialsScreen = /** @type {HTMLElement|null} */ (
        document.getElementById("initialsScreen")
      );
      const inputEl = /** @type {HTMLElement|null} */ (document.getElementById("initialsInput"));
      const initialsVisible = initialsScreen && !initialsScreen.classList.contains("hidden");
      const preferredEl = initialsVisible
        ? inputEl
        : inputEl && !inputEl.classList.contains("hidden")
          ? inputEl
          : restartBtn;
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
      // If there is a standalone initialsScreen, its controls should be considered interactive.
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
    if (targetIsLeaderboard) {
      // On touch devices, if there are no interactive initials/submit controls
      // visible, tapping the leaderboard should not steal focus from the
      // Play Again / restart button. Allow desktop (keyboard) interactions
      // to behave as before.
      try {
        const initialsEl = /** @type {HTMLElement|null} */ (
          document.getElementById("initialsInput")
        );
        const submitEl = /** @type {HTMLElement|null} */ (
          document.getElementById("submitScoreBtn")
        );
        const touchDevice =
          typeof navigator !== "undefined" &&
          ((typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 0) ||
            "ontouchstart" in window);
        const noInteractiveControls =
          (!initialsEl || initialsEl.classList.contains("hidden")) &&
          (!submitEl || submitEl.classList.contains("hidden"));

        if (touchDevice && noInteractiveControls) {
          if (UIManager._preserveFocus) UIManager.focusPreserveScroll(restartBtn);
          else UIManager.focusWithRetry(restartBtn);
          try {
            if (e && e.cancelable) e.preventDefault();
            if (e && typeof e.stopPropagation === "function") e.stopPropagation();
          } catch (_) {
            /* ignore */
          }
          return;
        }
      } catch (_) {
        /* ignore */
      }
      return;
    }
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
