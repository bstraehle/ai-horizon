import { Autopilot } from "./Autopilot.js";
import { PerfOverlay } from "./PerfOverlay.js";

/**
 * @typedef {Object} DevToolsHandle
 * @property {PerfOverlay|null} overlay Frame diagnostics readout (when `debug=perf`).
 * @property {Autopilot|null} autopilot Scripted pilot (when `autoplay=1`).
 * @property {() => void} beforeUpdate Call once per fixed step before the simulation update.
 * @property {(m: import('./PerfOverlay.js').PerfOverlayMetrics) => void} onMetrics GameLoop metrics hook.
 * @property {() => void} onGameOver Emits the session summary when the overlay is active.
 * @property {(delayMs?: number) => void} autoStart Starts the game shortly after construction when autoplay is on.
 */

/**
 * DevTools – URL-flag controlled diagnostics wiring for profiling sessions.
 *
 * Flags (query string):
 *  - `debug=perf` → PerfOverlay HUD + console session summary at game over.
 *  - `autoplay=1` → Autopilot drives input and auto-starts the game (pair with `?seed=` for
 *    reproducible before/after profiles).
 *  - `dpr=N` → raises the render DPR ceiling to N (0 < N <= 8) for high-density screenshots
 *    (store listings); applied immediately via `game.resizeCanvas()`.
 *
 * Returns null when neither the overlay nor the autopilot is requested (the dpr cap alone needs no
 * per-frame hooks) so the game loop carries no diagnostics cost in normal sessions. Keeps
 * `game.js` free of flag parsing and tool lifecycle details.
 *
 * @param {any} game Game instance.
 * @param {string} [search] Query string to parse (defaults to `window.location.search`).
 * @returns {DevToolsHandle|null}
 */
export function attachDevTools(game, search) {
  const params = new URLSearchParams(resolveSearch(search));
  const wantOverlay = params.get("debug") === "perf";
  const wantAutopilot = params.get("autoplay") === "1";
  const dprCap = Number(params.get("dpr"));
  if (Number.isFinite(dprCap) && dprCap > 0 && dprCap <= 8) {
    game._dprCapOverride = dprCap;
    try {
      if (typeof game.resizeCanvas === "function") game.resizeCanvas();
      // Resizing clears the canvas; the menu background is a one-off draw, so repaint it.
      const running =
        game.state && typeof game.state.isRunning === "function" && game.state.isRunning();
      if (!running && typeof game.drawBackground === "function") {
        game.drawBackground({ suppressNebula: true });
      }
    } catch {
      /* capture aid only */
    }
  }
  if (!wantOverlay && !wantAutopilot) return null;

  const overlay = wantOverlay ? new PerfOverlay(game) : null;
  const autopilot = wantAutopilot ? new Autopilot() : null;
  return {
    overlay,
    autopilot,
    beforeUpdate() {
      if (autopilot) autopilot.step(game);
    },
    onMetrics(m) {
      if (overlay) overlay.record(m);
    },
    onGameOver() {
      if (overlay) overlay.logSummary();
    },
    autoStart(delayMs = 800) {
      if (!autopilot || typeof setTimeout !== "function") return;
      setTimeout(() => {
        try {
          if (!game.state.isRunning()) game.startGame();
        } catch {
          /* autoplay start is best-effort */
        }
      }, delayMs);
    },
  };
}

/**
 * @param {string|undefined} search
 * @returns {string}
 */
function resolveSearch(search) {
  if (typeof search === "string") return search;
  try {
    return typeof window !== "undefined" && window.location ? window.location.search : "";
  } catch {
    return "";
  }
}
