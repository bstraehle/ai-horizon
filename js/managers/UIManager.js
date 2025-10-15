/**
 * UIManager – centralised DOM & focus management for overlays, scoreboard, leaderboard & initials flow.
 * All methods are static and defensive (try/catch) to tolerate non-browser / partial DOM environments.
 */
import { LeaderboardManager } from "./LeaderboardManager.js";
import { CONFIG } from "../constants.js";
import { BackgroundManager } from "./BackgroundManager.js";
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

  /**
   * Toggle initials UI visibility and sync related overlays.
   * @param {boolean} visible
   * @param {HTMLElement|null} leaderboardScreen
   * @param {InitialsElements} elements
   * @param {HTMLElement|null} gameOverScreen
   * @param {{updatePostGame?:boolean}} [options]
   */
  static _toggleInitialsUI(visible, leaderboardScreen, elements, gameOverScreen, options = {}) {
    const { updatePostGame = true } = options || {};
    const { initialsScreen, initialsEntry, initialsInput, submitBtn, initialsLabel } = elements;
    const method = visible ? "remove" : "add";

    UIManager._try(() => {
      if (initialsScreen) {
        try {
          initialsScreen.classList.add("hidden");
        } catch (_) {
          /* ignore */
        }
        try {
          initialsScreen.hidden = true;
        } catch (_) {
          /* ignore */
        }
        try {
          if (visible) initialsScreen.setAttribute("data-initials-ready", "true");
          else initialsScreen.removeAttribute("data-initials-ready");
        } catch (_) {
          /* ignore */
        }
      }
    });
    UIManager._try(() => {
      if (initialsEntry) {
        initialsEntry.classList[method]("hidden");
        try {
          if (method === "remove") initialsEntry.hidden = false;
          else initialsEntry.hidden = true;
        } catch (_) {
          /* ignore */
        }
      }
    });

    UIManager._try(() => {
      if (!gameOverScreen) return;
      if (visible) {
        if (updatePostGame) {
          gameOverScreen.classList.remove("hidden");
          try {
            gameOverScreen.hidden = false;
          } catch (_) {
            /* ignore */
          }
        }
        return;
      }
      if (!updatePostGame) return;
      gameOverScreen.classList.remove("hidden");
      try {
        gameOverScreen.hidden = false;
      } catch (_) {
        /* ignore */
      }
    });

    UIManager._try(() => {
      if (initialsInput) {
        initialsInput.classList[method]("hidden");
        try {
          if (method === "remove") initialsInput.hidden = false;
          else initialsInput.hidden = true;
        } catch (_) {
          /* ignore */
        }
      }
    });
    UIManager._try(() => {
      if (submitBtn) {
        submitBtn.classList[method]("hidden");
        try {
          if (method === "remove") submitBtn.hidden = false;
          else submitBtn.hidden = true;
        } catch (_) {
          /* ignore */
        }
      }
    });
    UIManager._try(() => {
      if (initialsLabel) {
        initialsLabel.classList[method]("hidden");
        try {
          if (method === "remove") initialsLabel.hidden = false;
          else initialsLabel.hidden = true;
        } catch (_) {
          /* ignore */
        }
      }
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

  /** @param {number} score @param {boolean|undefined} allowInitials @param {HTMLElement|null} leaderboardScreen @param {InitialsElements} elements @param {HTMLElement|null} gameOverScreen */
  static _applyInitialsQualification(
    score,
    allowInitials,
    leaderboardScreen,
    elements,
    gameOverScreen
  ) {
    const toggle = /** @param {boolean} v @param {{updatePostGame?:boolean}|undefined} [opts] */ (
      v,
      opts
    ) => UIManager._toggleInitialsUI(v, leaderboardScreen, elements, gameOverScreen, opts);
    if (typeof allowInitials === "boolean") {
      toggle(allowInitials, { updatePostGame: true });
      return;
    }
    const baseline = typeof score === "number" && score > 0;
    if (!baseline) {
      toggle(false, { updatePostGame: true });
      return;
    }

    const max = LeaderboardManager.MAX_ENTRIES || 0;
    const cachedEntries =
      typeof LeaderboardManager.getCached === "function" && LeaderboardManager.getCached();
    if (Array.isArray(cachedEntries)) {
      const qualifies = LeaderboardManager.qualifiesForInitials(score, cachedEntries.slice(), max);
      toggle(qualifies, { updatePostGame: true });
      return;
    }

    if (LeaderboardManager._pendingLoadPromise) {
      toggle(false, { updatePostGame: true });
      LeaderboardManager._pendingLoadPromise
        .then((entries) => {
          UIManager._try(() => {
            if (!Array.isArray(entries)) {
              toggle(true, { updatePostGame: true });
              return;
            }
            const qualifies = LeaderboardManager.qualifiesForInitials(score, entries, max);
            toggle(qualifies, { updatePostGame: true });
          });
        })
        .catch(() => {});
      return;
    }

    const maybe = LeaderboardManager.load({ remote: LeaderboardManager.IS_REMOTE });
    if (Array.isArray(maybe)) {
      const qualifies = LeaderboardManager.qualifiesForInitials(score, maybe, max);
      toggle(qualifies, { updatePostGame: true });
      return;
    }
    if (maybe && typeof maybe.then === "function") {
      toggle(false, { updatePostGame: true });
      maybe
        .then((entries) => {
          UIManager._try(() => {
            if (!Array.isArray(entries)) {
              toggle(true, { updatePostGame: true });
              return;
            }
            const qualifies = LeaderboardManager.qualifiesForInitials(score, entries, max);
            toggle(qualifies, { updatePostGame: true });
          });
        })
        .catch(() => {});
      return;
    }
    toggle(true, { updatePostGame: true });
  }
  /**
   * @param {HTMLElement|null} el
   * @param {() => void} attemptFn
   * @param {{forceCue?:boolean}} [options]
   */
  static _retryFocus(el, attemptFn, options = {}) {
    const { forceCue = false } = options || {};
    if (!el) return;
    const hasDocument = () => typeof document !== "undefined";
    const getActive = () => {
      try {
        return hasDocument() ? document.activeElement : null;
      } catch (_) {
        return null;
      }
    };
    const attempt = () => {
      try {
        attemptFn();
      } catch (_) {
        /* ignore */
      }
      if (hasDocument() && getActive() !== el) UIManager._try(() => el.focus());
    };
    attempt();
    if (hasDocument() && getActive() === el) return;
    requestAnimationFrame(() => {
      attempt();
      if (hasDocument() && getActive() === el) return;
      setTimeout(() => {
        attempt();
        if (hasDocument() && getActive() === el) return;
        setTimeout(() => {
          attempt();
          if (hasDocument() && getActive() === el) return;
          setTimeout(() => {
            attempt();
            if (hasDocument() && getActive() === el) return;
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
   * Ensure the countdown timer uses regular styling (no finale flash).
   * Call when the game stops early (e.g., player ends before timer hits 0).
   * @param {HTMLElement|null} [timerEl] Optional reference to the timer element.
   */
  static clearFinaleTimer(timerEl) {
    try {
      /** @type {HTMLElement|null} */
      const container = /** @type {HTMLElement|null} */ (
        (typeof document !== "undefined" && document.getElementById("timerBox")) ||
          (timerEl && timerEl.parentElement) ||
          null
      );
      /** @type {HTMLElement|null} */
      const timer = /** @type {HTMLElement|null} */ (
        (typeof document !== "undefined" && document.getElementById("timer")) || timerEl || null
      );
      if (container && container.classList) container.classList.remove("finale");
      if (timer && timer.classList) timer.classList.remove("finale");
    } catch (_) {
      /* non-critical UI affordance */
    }
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

    try {
      const finaleWindow = (CONFIG && CONFIG.GAME && CONFIG.GAME.FINALE_BONUS_WINDOW_SECONDS) || 0;
      const active = finaleWindow > 0 && secondsRemaining > 0 && secondsRemaining <= finaleWindow;
      /** @type {HTMLElement|null} */
      const container = /** @type {HTMLElement|null} */ (
        (typeof document !== "undefined" && document.getElementById("timerBox")) ||
          timerEl.parentElement ||
          null
      );
      if (container && container.classList) {
        if (active) container.classList.add("finale");
        else container.classList.remove("finale");
      } else if (timerEl && timerEl.classList) {
        if (active) timerEl.classList.add("finale");
        else timerEl.classList.remove("finale");
      }

      if (active && (container || timerEl)) {
        const target = container || timerEl;
        /** @type {"red"|"blue"} */
        const palette =
          typeof BackgroundManager?.getCurrentNebulaPalette === "function"
            ? BackgroundManager.getCurrentNebulaPalette()
            : "red";
        const baseHex =
          palette === "blue" ? CONFIG.COLORS.STAR_BLUE.BASE : CONFIG.COLORS.STAR_RED.BASE;
        const rgb = (function hexToRgb(hex) {
          try {
            const h = hex.replace("#", "");
            const v =
              h.length === 3
                ? h
                    .split("")
                    .map((/** @type {string} */ c) => c + c)
                    .join("")
                : h.padEnd(6, "0");
            const r = parseInt(v.slice(0, 2), 16);
            const g = parseInt(v.slice(2, 4), 16);
            const b = parseInt(v.slice(4, 6), 16);
            if ([r, g, b].some((n) => Number.isNaN(n))) return null;
            return { r, g, b };
          } catch (_) {
            return null;
          }
        })(baseHex);
        if (rgb) {
          const glow1 = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.7)`;
          const glow2 = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`;
          const textHi = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.9)`;
          try {
            target.style.setProperty("--finale-color", baseHex);
            target.style.setProperty("--finale-glow1", glow1);
            target.style.setProperty("--finale-glow2", glow2);
            target.style.setProperty("--finale-text", textHi);
          } catch (_) {
            /* ignore */
          }
        }
      }
    } catch (_) {
      /* non-critical UI affordance */
    }
  }

  /** @param {HTMLElement|null} pauseScreen */
  static showPause(pauseScreen) {
    if (pauseScreen) {
      pauseScreen.classList.remove("hidden");
      try {
        pauseScreen.hidden = false;
      } catch (_) {
        /* ignore */
      }
    }
  }

  /** @param {HTMLElement|null} pauseScreen */
  static hidePause(pauseScreen) {
    if (pauseScreen) {
      pauseScreen.classList.add("hidden");
      try {
        pauseScreen.hidden = true;
      } catch (_) {
        /* ignore */
      }
    }
  }

  /** @param {HTMLElement|null} leaderboardScreen @param {HTMLElement|null} restartBtn @param {HTMLElement|null} currentScoreEl @param {number} score @param {boolean} [preserveScroll=false] @param {boolean|undefined} [allowInitials] @param {HTMLElement|null} [gameOverScreen=null] */
  static showGameOver(
    leaderboardScreen,
    restartBtn,
    currentScoreEl,
    score,
    preserveScroll = false,
    allowInitials = undefined,
    gameOverScreen = null
  ) {
    try {
      UIManager.clearFinaleTimer(null);
    } catch (_) {
      /* ignore */
    }
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
    let initialsElements = UIManager._getInitialsElements();
    try {
      const hasInitialsElement = !!initialsElements.initialsScreen;
      const hasPostGameElement = !!gameOverScreen;
      if (!hasInitialsElement && !hasPostGameElement) {
        if (leaderboardScreen) {
          leaderboardScreen.classList.remove("hidden");
          try {
            leaderboardScreen.hidden = false;
          } catch (_) {
            /* ignore */
          }
        }
      }
    } catch (_) {
      // If anything goes wrong, be conservative and keep the modal hidden
    }
    UIManager._resetLeaderboardScroll();
    UIManager._applyInitialsQualification(
      score,
      allowInitials,
      leaderboardScreen,
      initialsElements,
      gameOverScreen
    );

    try {
      const initialsVisible = !!(
        initialsElements.initialsScreen &&
        !initialsElements.initialsScreen.classList.contains("hidden")
      );
      const postGameVisible = !!(gameOverScreen && !gameOverScreen.classList.contains("hidden"));
      if (!initialsVisible && !postGameVisible) {
        if (leaderboardScreen) {
          leaderboardScreen.classList.remove("hidden");
          try {
            leaderboardScreen.hidden = false;
          } catch (_) {
            /* ignore */
          }
        }
      }
    } catch (_) {
      if (leaderboardScreen) leaderboardScreen.classList.remove("hidden");
    }

    const initialsInput = /** @type {HTMLElement|null} */ (
      document.getElementById("initialsInput")
    );
    const submitBtn = /** @type {HTMLElement|null} */ (document.getElementById("submitScoreBtn"));
    const okBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById("okBtn"));
    const postGameVisible = !!(gameOverScreen && !gameOverScreen.classList.contains("hidden"));
    const visibleInitials =
      initialsInput && !initialsInput.classList.contains("hidden") ? initialsInput : null;
    let preferred = visibleInitials || restartBtn;
    if (typeof score === "number" && score === 0) {
      preferred = restartBtn;
    }
    if (postGameVisible && okBtn) {
      preferred = okBtn;
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
            if (
              active === preferred ||
              active === restartBtn ||
              active === submitBtn ||
              active === okBtn
            ) {
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

  /** @param {HTMLElement|null} gameOverScreen @param {HTMLElement|null} [postGameScreen=null] */
  static hideGameOver(gameOverScreen, postGameScreen = null) {
    if (gameOverScreen) {
      gameOverScreen.classList.add("hidden");
      try {
        gameOverScreen.hidden = true;
      } catch (_) {
        /* ignore */
      }
    }
    if (postGameScreen) {
      try {
        postGameScreen.classList.add("hidden");
        postGameScreen.hidden = true;
      } catch (_) {
        /* ignore */
      }
    }
    try {
      UIManager.teardownInitialsSubmitFocusGuard();
    } catch (_) {
      /* ignore */
    }
  }

  /** @param {HTMLElement|null} postGameScreen */
  static hidePostGame(postGameScreen) {
    if (!postGameScreen) return;
    try {
      postGameScreen.classList.add("hidden");
      try {
        postGameScreen.hidden = true;
      } catch (_) {
        /* ignore */
      }
    } catch (_) {
      /* ignore */
    }
  }

  /**
   * Advance the post-game flow from gameOverScreen to initialsScreen or leaderboardScreen.
   * Simplified flow: gameOverScreen -> initialsScreen (if qualifies) or leaderboardScreen (if doesn't qualify)
   * @param {{postGameScreen:HTMLElement|null, initialsScreen:HTMLElement|null, leaderboardScreen:HTMLElement|null, initialsInput:HTMLElement|null, restartBtn:HTMLElement|null}} params
   * @returns {"initials"|"leaderboard"} The screen that was shown
   */
  static advancePostGameFlow(params) {
    const { postGameScreen, initialsScreen, leaderboardScreen, initialsInput, restartBtn } = params;

    UIManager._try(() => {
      if (postGameScreen) {
        postGameScreen.classList.add("hidden");
        try {
          postGameScreen.hidden = true;
        } catch (_) {
          /* ignore */
        }
      }
    });

    const initialsReady = !!(initialsScreen && initialsScreen.hasAttribute("data-initials-ready"));

    if (initialsReady && initialsScreen) {
      UIManager._try(() => {
        initialsScreen.classList.remove("hidden");
        try {
          initialsScreen.hidden = false;
        } catch (_) {
          /* ignore */
        }
      });

      UIManager._try(() => {
        if (initialsInput) {
          UIManager.focusWithRetry(initialsInput);
        }
      });

      return "initials";
    } else {
      UIManager._try(() => {
        if (leaderboardScreen) {
          leaderboardScreen.classList.remove("hidden");
          try {
            leaderboardScreen.hidden = false;
          } catch (_) {
            /* ignore */
          }
        }
      });

      UIManager._try(() => {
        if (restartBtn) {
          UIManager.focusWithRetry(restartBtn);
        }
      });

      return "leaderboard";
    }
  }

  /** @param {HTMLElement|null} gameInfo */
  static hideGameInfo(gameInfo) {
    if (gameInfo) {
      gameInfo.classList.add("hidden");
      try {
        gameInfo.hidden = true;
      } catch (_) {
        /* ignore */
      }
    }
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

  /** Ensure correct overlay element has focus based on visibility.
   * @param {HTMLElement|null} gameInfo
   * @param {HTMLElement|null} startBtn
   * @param {HTMLElement|null} gameOverScreen
   * @param {HTMLElement|null} restartBtn
   * @param {HTMLElement|null} [postGameScreen]
   * @param {HTMLButtonElement|null} [postGameOkBtn]
   */
  static ensureOverlayFocus(
    gameInfo,
    startBtn,
    gameOverScreen,
    restartBtn,
    postGameScreen = null,
    postGameOkBtn = null
  ) {
    const postGameVisible = !!(postGameScreen && !postGameScreen.classList.contains("hidden"));
    if (postGameVisible) {
      const okTarget =
        postGameOkBtn ||
        /** @type {HTMLButtonElement|null} */ (document.getElementById("okBtn")) ||
        restartBtn;
      if (UIManager._preserveFocus) UIManager.focusPreserveScroll(okTarget);
      else UIManager.focusWithRetry(okTarget);
      return;
    }

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
   * @param {HTMLElement|null} [postGameScreen]
   * @param {HTMLButtonElement|null} [postGameOkBtn]
   */
  static handleWindowFocus(
    gameInfo,
    startBtn,
    gameOverScreen,
    restartBtn,
    postGameScreen = null,
    postGameOkBtn = null
  ) {
    UIManager.ensureOverlayFocus(
      gameInfo,
      startBtn,
      gameOverScreen,
      restartBtn,
      postGameScreen,
      postGameOkBtn
    );
  }

  /** Handle visibility change (visible -> refocus overlays).
   * @param {HTMLElement|null} gameInfo
   * @param {HTMLElement|null} startBtn
   * @param {HTMLElement|null} gameOverScreen
   * @param {HTMLElement|null} restartBtn
   * @param {HTMLElement|null} [postGameScreen]
   * @param {HTMLButtonElement|null} [postGameOkBtn]
   */
  static handleVisibilityChange(
    gameInfo,
    startBtn,
    gameOverScreen,
    restartBtn,
    postGameScreen = null,
    postGameOkBtn = null
  ) {
    if (!document.hidden) {
      UIManager.ensureOverlayFocus(
        gameInfo,
        startBtn,
        gameOverScreen,
        restartBtn,
        postGameScreen,
        postGameOkBtn
      );
    }
  }

  /** Focus-in guard for overlays (keeps primary controls focused).
   * @param {FocusEvent} e
   * @param {HTMLElement|null} gameInfo
   * @param {HTMLElement|null} startBtn
   * @param {HTMLElement|null} gameOverScreen
   * @param {HTMLElement|null} restartBtn
   * @param {HTMLElement|null} [postGameScreen]
   * @param {HTMLButtonElement|null} [postGameOkBtn]
   */
  static handleDocumentFocusIn(
    e,
    gameInfo,
    startBtn,
    gameOverScreen,
    restartBtn,
    postGameScreen = null,
    postGameOkBtn = null
  ) {
    const overlayPostGameVisible = !!(
      postGameScreen && !postGameScreen.classList.contains("hidden")
    );
    const overlayGameOverVisible = !!(
      gameOverScreen && !gameOverScreen.classList.contains("hidden")
    );
    const overlayStartVisible = !!(gameInfo && !gameInfo.classList.contains("hidden"));
    if (!overlayGameOverVisible && !overlayStartVisible && !overlayPostGameVisible) return;

    const t = UIManager.isElement(e && e.target) ? /** @type {Element} */ (e.target) : null;
    if (overlayPostGameVisible) {
      const okTarget =
        postGameOkBtn ||
        /** @type {HTMLButtonElement|null} */ (document.getElementById("okBtn")) ||
        restartBtn;
      if (!okTarget) return;
      const targetIsOk =
        t === okTarget || (t && typeof t.closest === "function" && t.closest("#okBtn"));
      if (!targetIsOk) {
        if (UIManager._preserveFocus) UIManager.focusPreserveScroll(okTarget);
        else UIManager.focusWithRetry(okTarget);
      }
      return;
    }

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
        const fallback = restartBtn;
        if (UIManager._preserveFocus) UIManager.focusPreserveScroll(fallback);
        else UIManager.focusWithRetry(fallback);
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
   * @param {HTMLElement|null} [postGameScreen]
   * @param {HTMLButtonElement|null} [postGameOkBtn]
   */
  static handleGameOverFocusGuard(
    e,
    gameOverScreen,
    restartBtn,
    postGameScreen = null,
    postGameOkBtn = null
  ) {
    const gameOverVisible = !!(gameOverScreen && !gameOverScreen.classList.contains("hidden"));
    const postGameVisibleCheck = !!(postGameScreen && !postGameScreen.classList.contains("hidden"));
    if (!gameOverVisible && !postGameVisibleCheck) return;
    const t = UIManager.isElement(e && e.target) ? /** @type {Element} */ (e.target) : null;
    const postGameVisible = postGameVisibleCheck;
    if (postGameVisible) {
      const okTarget =
        postGameOkBtn ||
        /** @type {HTMLButtonElement|null} */ (document.getElementById("okBtn")) ||
        restartBtn;
      if (!okTarget) return;
      const targetIsOk =
        t === okTarget || (t && typeof t.closest === "function" && t.closest("#okBtn"));
      if (targetIsOk) {
        if (e && e.type === "blur") {
          if (UIManager._preserveFocus) UIManager.focusPreserveScroll(okTarget);
          else UIManager.focusWithRetry(okTarget);
        }
        return;
      }

      if (UIManager._preserveFocus) UIManager.focusPreserveScroll(okTarget);
      else UIManager.focusWithRetry(okTarget);
      try {
        if (e && e.cancelable) e.preventDefault();
        if (e && typeof e.stopPropagation === "function") e.stopPropagation();
      } catch (_) {
        /* ignore */
      }
      return;
    }
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

    window.addEventListener("postGame:ok", (evt) => {
      try {
        const detail = /** @type {any} */ (evt).detail;
        if (detail && detail.skipUiAdvance) return;

        const leaderboardScreen = UIManager._byId("leaderboardScreen");
        const initialsScreen = UIManager._byId("initialsScreen");
        const postGameScreen = UIManager._byId("gameOverScreen");
        const initialsInput = UIManager._byId("initialsInput");
        const restartBtn = UIManager._byId("restartBtn");

        UIManager.advancePostGameFlow({
          postGameScreen,
          initialsScreen,
          leaderboardScreen,
          initialsInput,
          restartBtn,
        });
      } catch (_) {
        /* ignore */
      }
    });
  }
} catch (_) {
  /* ignore */
}
