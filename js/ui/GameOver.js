// @ts-nocheck
import { LeaderboardManager } from "../managers/LeaderboardManager.js";
import { UIManager } from "../managers/UIManager.js";
import { GameUI } from "./GameUI.js";

// Extracted game over initials submission & leaderboard rendering logic.
/** @param {import('../game.js').AIHorizon} game */
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
      const gameOverScreen = /** @type {HTMLElement|null} */ (
        document.getElementById("gameOverScreen")
      );
      const initialsEntry = document.querySelector(".initials-entry");
      if (initialsEntry) initialsEntry.classList.add("hidden");

      const attemptSubmit = () => {
        if (!initialsInput) return false;
        const raw = String(initialsInput.value || "")
          .trim()
          .toUpperCase();
        if (!/^[A-Z]{1,3}$/.test(raw)) {
          try {
            initialsInput.classList.add("invalid");
            setTimeout(() => initialsInput.classList.remove("invalid"), 0);
            initialsInput.focus({ preventScroll: true });
          } catch {
            /* noop */
          }
          return false;
        }
        try {
          LeaderboardManager.submit(game.score, raw, { remote: LeaderboardManager.IS_REMOTE });
          submittedScore = true;
          initialsInput.value = "";
        } catch {
          /* noop */
        }
        return true;
      };

      const hideInitialsUI = () => {
        try {
          if (initialsInput) initialsInput.classList.add("hidden");
        } catch {
          /* noop */
        }
        try {
          if (submitBtn) submitBtn.classList.add("hidden");
        } catch {
          /* noop */
        }
        try {
          const l = document.getElementById("initialsLabel");
          if (l) l.classList.add("hidden");
        } catch {
          /* noop */
        }
        try {
          UIManager.syncInitialsSubmitFocusGuard();
        } catch {
          /* noop */
        }
      };

      const finalizeSubmission = () => {
        try {
          if (lbEl) LeaderboardManager.render(lbEl);
        } catch {
          /* noop */
        }
        hideInitialsUI();
        try {
          if (initialsScreen) initialsScreen.classList.add("hidden");
        } catch {
          /* noop */
        }
        try {
          if (gameOverScreen) gameOverScreen.classList.remove("hidden");
        } catch {
          /* noop */
        }
        GameUI.recenterLeaderboard();
        GameUI.focusRestart(game);
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
                  /* noop */
                }
              }
            } catch {
              /* noop */
            }
          };
          initialsInput.addEventListener("input", onInput);
        } catch {
          /* noop */
        }

        /** @param {MouseEvent} e */
        const onClick = (e) => {
          if (submittedScore) return;
          if (submitBtn && submitBtn.dataset && submitBtn.dataset.cooldown === "1") return;
          try {
            e.preventDefault();
          } catch {
            /* noop */
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
              /* noop */
            }
            onClick(ev);
          });
        } catch {
          /* ignore */
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
              /* noop */
            }
          }, 0);
        });
      }
    }
  } catch {
    /* noop */
  }

  try {
    const lbEl = game.leaderboardListEl || document.getElementById("leaderboardList");
    if (lbEl) LeaderboardManager.render(lbEl);
  } catch {
    /* noop */
  }

  GameUI.showGameOver(game, submittedScore);
}
