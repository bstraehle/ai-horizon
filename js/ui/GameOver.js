// @ts-nocheck
import { LeaderboardManager } from "../managers/LeaderboardManager.js";
import { UIManager } from "../managers/UIManager.js";
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
      const _gameOverScreen = /** @type {HTMLElement|null} */ (
        document.getElementById("gameOverScreen")
      );
      const initialsEntry = document.querySelector(".initials-entry");
      if (initialsEntry) initialsEntry.classList.add("hidden");

      const attemptSubmit = () => {
        if (!initialsInput) return false;
        const raw = String(initialsInput.value || "")
          .trim()
          .toUpperCase();
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
          LeaderboardManager.submit(game.score, raw, { remote: LeaderboardManager.IS_REMOTE });
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
          if (initialsScreen) initialsScreen.classList.add("hidden");
        } catch {
          /* ignore */
        }
        try {
          const postGameScreen = /** @type {HTMLElement|null} */ (
            document.getElementById("postGameScreen")
          );
          if (postGameScreen) {
            postGameScreen.classList.remove("hidden");
            try {
              const okBtn = /** @type {HTMLButtonElement|null} */ (
                document.getElementById("okBtn")
              );
              if (okBtn) UIManager.focusWithRetry(okBtn);
            } catch {
              /* non-critical focus */
            }
          } else {
            if (_gameOverScreen) _gameOverScreen.classList.remove("hidden");
          }
        } catch {
          /* ignore */
        }
        try {
          const restartBtn = /** @type {HTMLButtonElement|null} */ (
            document.getElementById("restartBtn")
          );
          if (restartBtn) {
            restartBtn.dataset.cooldown = "1";
            const suppress = (e) => {
              if (restartBtn.dataset.cooldown === "1") {
                try {
                  e.stopPropagation();
                } catch {
                  /* suppress propagation best-effort */
                }
                try {
                  if (e.cancelable) e.preventDefault();
                } catch {
                  /* preventDefault may fail in synthetic events */
                }
              }
            };
            restartBtn.addEventListener("click", suppress, true);
            const clear = () => {
              try {
                delete restartBtn.dataset.cooldown;
              } catch {
                /* dataset cleanup optional */
              }
              try {
                restartBtn.removeEventListener("click", suppress, true);
              } catch {
                /* listener removal optional */
              }
            };
            try {
              window.addEventListener(
                "pointerup",
                () => {
                  setTimeout(clear, 0);
                },
                { once: true, capture: true }
              );
            } catch {
              /* optional */
            }
            setTimeout(clear, 1000);
          }
        } catch {
          /* non-critical restart gating */
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
