/**
 * UIManager – centralised DOM & focus management for overlays, scoreboard, leaderboard & initials flow.
 * All methods are static and defensive (try/catch) to tolerate non-browser / partial DOM environments.
 */
import { LeaderboardManager } from "./LeaderboardManager.js";
export class UIManager {
  static _preserveFocus = false;
  /** @type {(() => void)|null} */
  static _initialsSubmitFocusCleanup = null;
  /** @type {null|(()=>void)} */
  static _initialsScrollLockCleanup = null;

  /** @param {() => any} fn */
  static _try(fn) {
    try {
      return fn();
    } catch (_) {
      return undefined;
    }
  }

  /** @param {string} id */
  static _byId(id) {
    try {
      return typeof document !== "undefined" ? document.getElementById(id) : null;
    } catch (_) {
      return null;
    }
  }

  static _resetLeaderboardScroll() {
    const list = UIManager._byId("leaderboardList");
    if (!list) return;
    UIManager._try(() => {
      if (typeof list.scrollTo === "function") list.scrollTo(0, 0);
      else list.scrollTop = 0;
    });
    UIManager._try(() => {
      list.scrollTop = 0;
    });
  }

  /**
   * @typedef {Object} InitialsElements
   * @property {HTMLElement|null} initialsScreen
   * @property {HTMLElement|null} initialsEntry
   * @property {HTMLElement|null} initialsInput
   * @property {HTMLElement|null} submitBtn
   * @property {HTMLElement|null} initialsLabel
   */
  /** @returns {InitialsElements} */
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

  /** @param {boolean} visible @param {HTMLElement|null} gameOverScreen @param {InitialsElements} elements */
  static _toggleInitialsUI(visible, gameOverScreen, elements) {
    const { initialsScreen, initialsEntry, initialsInput, submitBtn, initialsLabel } = elements;
    const method = visible ? "remove" : "add";

    UIManager._try(() => {
      if (initialsScreen) initialsScreen.classList[method]("hidden");
    });
    UIManager._try(() => {
      if (initialsEntry) initialsEntry.classList[method]("hidden");
    });

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

    UIManager._try(() => {
      if (!visible && UIManager._initialsScrollLockCleanup) {
        try {
          UIManager._initialsScrollLockCleanup();
        } catch (_) {
          /* ignore */
        }
        UIManager._initialsScrollLockCleanup = null;
        return;
      }
      if (visible && initialsScreen) {
        const el = initialsScreen;
        const touchDevice =
          typeof navigator !== "undefined" &&
          ((typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 0) ||
            (typeof window !== "undefined" && "ontouchstart" in window));
        if (!touchDevice) return;

        const originalOverflow = el.style.overflow;
        /** @type {any} */ (el.style)._originalWebkitOverflowScrolling = /** @type {any} */ (
          el.style
        ).webkitOverflowScrolling;
        const originalBodyOverscroll =
          typeof document !== "undefined" && document.body
            ? document.body.style.overscrollBehavior || ""
            : "";
        try {
          el.style.overflow = "hidden";
          /** @type {any} */ (el.style).webkitOverflowScrolling = "auto";
        } catch (_) {
          /* non-critical */
        }
        try {
          if (document && document.body) {
            document.body.style.overscrollBehavior = "contain";
          }
        } catch (_) {
          /* ignore */
        }
        /** @param {Event} e */
        const prevent = (e) => {
          try {
            if (e && e.cancelable) e.preventDefault();
          } catch (_) {
            /* ignore */
          }
        };
        try {
          el.addEventListener("touchmove", prevent, { passive: false });
        } catch (_) {
          /* ignore */
        }
        try {
          el.addEventListener("wheel", prevent, { passive: false });
        } catch (_) {
          /* ignore */
        }
        UIManager._initialsScrollLockCleanup = () => {
          try {
            el.removeEventListener("touchmove", prevent, true);
          } catch (_) {
            /* ignore */
          }
          try {
            el.removeEventListener("wheel", prevent, true);
          } catch (_) {
            /* ignore */
          }
          try {
            el.style.overflow = originalOverflow;
            /** @type {any} */ (el.style).webkitOverflowScrolling = /** @type {any} */ (
              el.style
            )._originalWebkitOverflowScrolling;
          } catch (_) {
            /* ignore */
          }
          try {
            if (document && document.body) {
              document.body.style.overscrollBehavior = originalBodyOverscroll;
            }
          } catch (_) {
            /* ignore */
          }
        };
      }
    });
  }

  /** @param {number} score @param {boolean|undefined} allowInitials @param {HTMLElement|null} gameOverScreen @param {InitialsElements} elements */
  static _applyInitialsQualification(score, allowInitials, gameOverScreen, elements) {
    const toggle = /** @param {boolean} v */ (v) =>
      UIManager._toggleInitialsUI(v, gameOverScreen, elements);
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

    if (LeaderboardManager._pendingLoadPromise) {
      toggle(false);
      LeaderboardManager._pendingLoadPromise
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
    toggle(true);
  }
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
   * @param {unknown} obj
   * @returns {obj is Element}
   */
  static isElement(obj) {
    return typeof Element !== "undefined" && obj instanceof Element;
  }

  /** @param {HTMLElement|null} currentScoreEl @param {number|string} score */
  static setScore(currentScoreEl, score) {
    if (currentScoreEl) currentScoreEl.textContent = String(score);
  }

  /**
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

  /** @param {HTMLElement|null} pauseScreen */
  static showPause(pauseScreen) {
    if (pauseScreen) pauseScreen.classList.remove("hidden");
  }

  /** @param {HTMLElement|null} pauseScreen */
  static hidePause(pauseScreen) {
    if (pauseScreen) pauseScreen.classList.add("hidden");
  }

  /** @param {HTMLElement|null} gameOverScreen @param {HTMLElement|null} restartBtn @param {HTMLElement|null} currentScoreEl @param {number} score @param {boolean} [preserveScroll=false] @param {boolean|undefined} [allowInitials] */
  static showGameOver(
    gameOverScreen,
    restartBtn,
    currentScoreEl,
    score,
    preserveScroll = false,
    allowInitials = undefined
  ) {
    try {
      if (currentScoreEl) {
        const ds = currentScoreEl.dataset || /** @type {any} */ ({});
        //const bonusAttr = ds.accuracyBonus;
        const accuracyAttr = ds.accuracy;
        const total = Number(score) || 0;
        //const accuracyBonus = bonusAttr ? Number(bonusAttr) : 0;
        //const base = Math.max(0, total - (Number.isFinite(accuracyBonus) ? accuracyBonus : 0));
        const accuracy = accuracyAttr ? Number(accuracyAttr) : NaN;
        const pct = Number.isFinite(accuracy) && accuracy >= 0 ? Math.round(accuracy * 100) : 0;

        if (Number.isFinite(pct) && total > 0) {
          currentScoreEl.textContent = `${total} | ${pct}%`;
        } else {
          currentScoreEl.textContent = String(score);
        }
      }
    } catch {
      if (currentScoreEl) currentScoreEl.textContent = String(score);
    }
    if (gameOverScreen) gameOverScreen.classList.remove("hidden");
    UIManager._resetLeaderboardScroll();

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

  /** @param {HTMLElement|null} gameOverScreen */
  static hideGameOver(gameOverScreen) {
    if (gameOverScreen) gameOverScreen.classList.add("hidden");
    try {
      UIManager.teardownInitialsSubmitFocusGuard();
    } catch (_) {
      /* ignore */
    }
  }

  /** @param {HTMLElement|null} gameInfo */
  static hideGameInfo(gameInfo) {
    if (gameInfo) gameInfo.classList.add("hidden");
  }

  /** @param {HTMLElement|null} el */
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

  /** @param {HTMLElement|null} el */
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

  /** Guard so interactions outside initials input shift focus to submit. */
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
      /**
       * Prevent blur and redirect focus to submit button when interacting outside the initials input.
       * @param {MouseEvent|TouchEvent} event
       */
      const handler = (event) => {
        try {
          const submit = /** @type {HTMLElement|null} */ (
            document.getElementById("submitScoreBtn")
          );
          const input = /** @type {HTMLInputElement|null} */ (
            document.getElementById("initialsInput")
          );
          if (!submit || submit.classList.contains("hidden") || !input) {
            UIManager.syncInitialsSubmitFocusGuard();
            return;
          }
          const target = UIManager.isElement(event && event.target)
            ? /** @type {Element} */ (event.target)
            : null;

          const insideInput = target && (target === input || !!target.closest("#initialsInput"));
          const insideLabel = target && !!target.closest("#initialsLabel");
          const insideSubmit = target && (target === submit || !!target.closest("#submitScoreBtn"));

          const valueLength = (input.value || "").length;

          if (valueLength < 3) {
            if (!insideInput && !insideLabel) {
              if (event.cancelable) event.preventDefault();
              if (typeof event.stopPropagation === "function") event.stopPropagation();
              try {
                input.classList.add("invalid");
                setTimeout(() => input.classList.remove("invalid"), 0);
              } catch (_) {
                /* non-critical */
              }
              UIManager.focusWithRetry(input);
              return;
            }
            return;
          }
          if (insideInput) return;

          if (event.cancelable) event.preventDefault();
          if (typeof event.stopPropagation === "function") event.stopPropagation();
          if (insideSubmit) return;
          try {
            if (/^[A-Z]{3}$/.test(input.value || "")) {
              if (!(submit && submit.dataset && submit.dataset.cooldown === "1")) {
                try {
                  submit?.click();
                } catch (_) {
                  /* non-critical submit trigger */
                }
              }
            }
          } catch (_) {
            /* ignore pattern issues */
          }
          UIManager.focusWithRetry(submit);
        } catch (_) {
          /* ignore */
        }
      };

      const touchOptions = { capture: true, passive: false };

      containers.forEach((container) => {
        container.addEventListener("mousedown", handler, true);
        container.addEventListener("touchstart", handler, touchOptions);
      });

      UIManager._initialsSubmitFocusCleanup = () => {
        containers.forEach((container) => {
          container.removeEventListener("mousedown", handler, true);
          container.removeEventListener("touchstart", handler, touchOptions);
        });
      };
    } catch (_) {
      /* ignore */
    }
  }

  /** Recenter leaderboard panel (mobile keyboard helper). */
  static recenterLeaderboard() {
    try {
      const list =
        typeof document !== "undefined" ? document.getElementById("leaderboardList") : null;
      const container =
        typeof document !== "undefined" ? document.getElementById("leaderboard") : null;
      const target = list || container;
      if (!target) return;
      try {
        if (typeof target.scrollIntoView === "function") {
          try {
            target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
            return;
          } catch (_) {
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

  /** Ensure correct overlay element has focus based on visibility. @param {HTMLElement|null} gameInfo @param {HTMLElement|null} startBtn @param {HTMLElement|null} gameOverScreen @param {HTMLElement|null} restartBtn */
  static ensureOverlayFocus(gameInfo, startBtn, gameOverScreen, restartBtn) {
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

  /** Handle window focus/pageshow: reassert overlay focus.
   * @param {HTMLElement|null} gameInfo
   * @param {HTMLElement|null} startBtn
   * @param {HTMLElement|null} gameOverScreen
   * @param {HTMLElement|null} restartBtn
   */
  static handleWindowFocus(gameInfo, startBtn, gameOverScreen, restartBtn) {
    UIManager.ensureOverlayFocus(gameInfo, startBtn, gameOverScreen, restartBtn);
  }

  /** Handle visibility change (visible -> refocus overlays).
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

  /** Focus-in guard for overlays (keeps primary controls focused).
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

  /** Interaction guard while Start overlay visible (restrict focus to Start button & links).
   * @param {Event} e
   * @param {HTMLElement|null} gameInfo
   * @param {HTMLElement|null} startBtn
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

  /** Interaction guard while Game Over overlay visible (keeps restart/initials controls focused).
   * @param {Event} e
   * @param {HTMLElement|null} gameOverScreen
   * @param {HTMLElement|null} restartBtn
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
      return;
    }
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
