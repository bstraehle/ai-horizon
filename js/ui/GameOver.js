// @ts-nocheck
import { LeaderboardManager } from "../managers/LeaderboardManager.js";
import { UIManager } from "../managers/UIManager.js";
import { FocusManager } from "../managers/FocusManager.js";
import { GameUI } from "./GameUI.js";

/**
 * Orchestrates Game Over UI workflow: optional initials capture, leaderboard refresh,
 * layout updates, and focus management. Heavily guarded with try/catch to avoid
 * breaking core loop termination if DOM is partially missing.
 * @param {import('../game.js').AIHorizon} game
 */
export function handleGameOver(game) {
  let submittedScore = false;
  try {
    if (game.score > 0) {
      const lbEl = game.leaderboardListEl || document.getElementById("leaderboardList");
      const initialsInput = /** @type {HTMLInputElement|null} */ (
        document.getElementById("initialsInput")
      );
      const submitBtn = /** @type {HTMLButtonElement|null} */ (
        document.getElementById("submitScoreBtn")
      );
      const initialsScreen = /** @type {HTMLElement|null} */ (
        document.getElementById("initialsScreen")
      );
      const _leaderboardScreen = /** @type {HTMLElement|null} */ (
        document.getElementById("leaderboardScreen")
      );
      try {
        const initialsEntries = document.querySelectorAll(".initials-entry:not(.post-game-entry)");
        initialsEntries.forEach((el) => {
          try {
            el.classList.add("hidden");
          } catch {
            /* ignore */
          }
        });
      } catch {
        /* non-critical */
      }

      const attemptSubmit = () => {
        if (!initialsInput) return false;
        const raw = String(initialsInput.value || "")
          .trim()
          .toUpperCase();

        if (raw.length === 0) {
          return true;
        }

        if (!/^[A-Z]{3}$/.test(raw)) {
          try {
            initialsInput.classList.add("invalid");
            setTimeout(() => initialsInput.classList.remove("invalid"), 0);
            initialsInput.focus({ preventScroll: true });
          } catch {
            /* non-critical: visual invalid feedback */
          }
          return false;
        }
        try {
          LeaderboardManager.submit(game.score, raw, {
            remote: LeaderboardManager.IS_REMOTE,
            accuracy: game.accuracy,
            gameSummary: game._lastRunSummary,
            aiAnalysis: game._lastAIAnalysis,
          });
          submittedScore = true;
          initialsInput.value = "";
        } catch {
          /* ignore render errors */
        }
        return true;
      };

      const hideInitialsUI = () => {
        try {
          if (initialsInput) initialsInput.classList.add("hidden");
        } catch {
          /* ignore */
        }
        try {
          if (submitBtn) submitBtn.classList.add("hidden");
        } catch {
          /* ignore */
        }
        try {
          const l = document.getElementById("initialsLabel");
          if (l) l.classList.add("hidden");
        } catch {
          /* ignore */
        }
        try {
          UIManager.syncInitialsSubmitFocusGuard();
        } catch {
          /* optional UI sync */
        }
      };

      const finalizeSubmission = () => {
        try {
          if (lbEl) LeaderboardManager.render(lbEl);
        } catch {
          /* leaderboard render optional */
        }
        hideInitialsUI();

        try {
          if (initialsScreen) {
            initialsScreen.classList.add("hidden");
            try {
              initialsScreen.hidden = true;
            } catch (_) {
              /* ignore */
            }
          }
        } catch {
          /* ignore */
        }

        try {
          const leaderboardScreen = _leaderboardScreen;
          if (leaderboardScreen) {
            leaderboardScreen.classList.remove("hidden");
            try {
              leaderboardScreen.hidden = false;
            } catch {
              /* ignore */
            }
          }
        } catch {
          /* ignore */
        }

        try {
          UIManager._resetLeaderboardScroll();
        } catch {
          /* non-critical */
        }

        try {
          const restartBtn = /** @type {HTMLButtonElement|null} */ (
            document.getElementById("restartBtn")
          );
          if (restartBtn) UIManager.focusWithRetry(restartBtn);
        } catch {
          /* ignore */
        }

        try {
          const restartBtn = /** @type {HTMLButtonElement|null} */ (
            document.getElementById("restartBtn")
          );
          const leaderboardScreen = /** @type {HTMLElement|null} */ (
            document.getElementById("leaderboardScreen")
          );
          if (restartBtn) {
            FocusManager.lock(restartBtn, {
              scope: leaderboardScreen || null,
              allowedSelectors: ["#restartBtn", "a", "#leaderboardList"],
              preserveScroll: true,
            });
          }
        } catch {
          /* optional focus lock */
        }

        try {
          GameUI.recenterLeaderboard();
        } catch {
          /* optional */
        }
      };

      if (submitBtn && initialsInput) {
        /** @type {(e: Event)=>void} */
        let onInput = () => {};
        try {
          onInput = (e) => {
            try {
              const el = /** @type {HTMLInputElement} */ (e.target);
              const raw = String(el.value || "");
              const filtered = raw
                .replace(/[^a-zA-Z]/g, "")
                .toUpperCase()
                .slice(0, 3);
              if (el.value !== filtered) {
                el.value = filtered;
                try {
                  el.setSelectionRange(filtered.length, filtered.length);
                } catch {
                  /* selection not critical */
                }
              }
            } catch {
              /* input handler attach optional */
            }
          };
          initialsInput.addEventListener("input", onInput);
        } catch {
          /* addEventListener optional */
        }

        /** @param {MouseEvent} e */
        const onClick = (e) => {
          if (submittedScore) return;
          if (submitBtn && submitBtn.dataset && submitBtn.dataset.cooldown === "1") return;
          try {
            e.preventDefault();
          } catch {
            /* ignore */
          }
          if (attemptSubmit()) finalizeSubmission();
        };
        submitBtn.addEventListener("click", onClick);
        try {
          submitBtn.addEventListener("pointerdown", (ev) => {
            if (submittedScore) return;
            if (submitBtn && submitBtn.dataset && submitBtn.dataset.cooldown === "1") return;
            try {
              ev.preventDefault();
            } catch {
              /* ignore */
            }
            onClick(ev);
          });
        } catch {
          /* addEventListener pointerdown optional */
        }

        /** @param {KeyboardEvent} ev */
        const onKey = (ev) => {
          if (ev.key !== "Enter") return;
          ev.preventDefault();
          if (submitBtn && submitBtn.dataset && submitBtn.dataset.cooldown === "1") return;
          if (attemptSubmit()) finalizeSubmission();
        };
        initialsInput.addEventListener("keydown", onKey);

        submitBtn.addEventListener("click", () => {
          setTimeout(() => {
            try {
              initialsInput.removeEventListener("input", onInput);
            } catch {
              /* cleanup optional */
            }
          }, 0);
        });
      }
    }
  } catch {
    /* outer gameOver submission logic ignored */
  }

  try {
    const lbEl = game.leaderboardListEl || document.getElementById("leaderboardList");
    if (lbEl) LeaderboardManager.render(lbEl);
  } catch {
    /* leaderboard render fallback ignored */
  }

  GameUI.showGameOver(game, submittedScore);
}
