import { Autopilot } from "./Autopilot.js";
import { PerfOverlay } from "./PerfOverlay.js";
import { FocusManager } from "../managers/FocusManager.js";

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
 *  - `autodelay=MS` → title-screen hold before the auto-start (default 800ms; recordings use a
 *    longer hold so the remote high score has loaded and the title reads).
 *  - `dpr=N` → raises the render DPR ceiling to N (0 < N <= 8) for high-density screenshots
 *    (store listings); applied immediately via `game.resizeCanvas()`.
 *  - `debug=focus` → console trace of focus changes, pointer/key input, window focus and overlay
 *    transitions (with the active focus lock), for diagnosing lost overlay focus. Observes only.
 *  - `soundlog=1` → appends every sound-effect call to `window.__soundLog` as
 *    `{ t: performance.now(), method, args }` (narration excluded) so a recorder can rebuild the
 *    soundtrack offline (see scripts/render-sfx.cjs). Sounds still play as usual.
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
  if (params.get("debug") === "focus") attachFocusTrace();
  if (params.get("soundlog") === "1") attachSoundLog(game);
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
  const autoDelay = Number(params.get("autodelay"));
  const defaultDelayMs = Number.isFinite(autoDelay) && autoDelay >= 0 ? autoDelay : 800;
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
    autoStart(delayMs = defaultDelayMs) {
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

/** AudioManager sound-effect methods captured by `soundlog=1` (narration is deliberately absent). */
export const SOUND_LOG_METHODS = [
  "playAsteroidHit",
  "playHardenedExplosion",
  "playUpgrade",
  "playStarCollect",
  "playFatal",
  "playTransmission",
];

/**
 * Wrap the game's sound-effect methods so each call is appended to `log` (default
 * `window.__soundLog`) with the current `performance.now()` – virtual time under the recorder's
 * frame clock – before delegating to the original method.
 * @param {any} game Game instance exposing `audio`.
 * @param {any[]} [log]
 * @returns {any[]|null} The log array, or null when there is no audio manager.
 */
export function attachSoundLog(game, log) {
  const audio = game && game.audio;
  if (!audio) return null;
  const g = /** @type {any} */ (globalThis);
  const entries = log || (g.__soundLog = g.__soundLog || []);
  for (const method of SOUND_LOG_METHODS) {
    const original = audio[method];
    if (typeof original !== "function") continue;
    audio[method] = (/** @type {any[]} */ ...args) => {
      entries.push({ t: performance.now(), method, args: JSON.parse(JSON.stringify(args)) });
      return original.apply(audio, args);
    };
  }
  return entries;
}

/**
 * Log focus-relevant events to the console (`[focus]` prefix). Listeners are passive window
 * capture listeners registered before any focus lock, so they see events even when the lock
 * stops propagation, and never alter behavior.
 * @param {Document} [doc]
 * @returns {() => void} Detach.
 */
export function attachFocusTrace(doc = document) {
  const win = doc.defaultView;
  if (!win) return () => {};
  const t0 = Date.now();
  /** @param {any} el */
  const name = (el) => {
    if (!el || !el.tagName) return el === win ? "window" : String(el);
    if (el.id) return `#${el.id}`;
    const cls =
      typeof el.className === "string" && el.className ? `.${el.className.split(" ")[0]}` : "";
    return `${el.tagName.toLowerCase()}${cls}`;
  };
  const visible = (/** @type {string} */ id) => {
    const el = doc.getElementById(id);
    return !!el && !el.hidden && !el.classList.contains("hidden");
  };
  const state = () => {
    const screens = [
      ["gameInfo", "start"],
      ["gameOverScreen", "debrief"],
      ["initialsScreen", "initials"],
      ["leaderboardScreen", "leaderboard"],
    ]
      .filter(([id]) => visible(id))
      .map(([, label]) => label);
    const lock = FocusManager._lock ? name(FocusManager._lock.target) : "none";
    return `active=${name(doc.activeElement)} screens=[${screens.join(",")}] lock=${lock} hasFocus=${doc.hasFocus()}`;
  };
  /** @param {string} what */
  const log = (what) => console.log(`[focus] +${Date.now() - t0}ms ${what} | ${state()}`);

  /** @param {Event} e */
  const onEvent = (e) => {
    const any = /** @type {any} */ (e);
    if (e.type === "keydown" && !["Enter", " ", "Tab", "Escape"].includes(any.key)) return;
    const extra =
      e.type === "keydown"
        ? ` key=${any.key === " " ? "Space" : any.key}`
        : e.type.startsWith("pointer")
          ? ` pointer=${any.pointerType}`
          : e.type === "focusin" || e.type === "focusout"
            ? ` related=${name(any.relatedTarget)}`
            : "";
    log(`${e.type} target=${name(e.target)}${extra}`);
  };
  const types = ["focusin", "focusout", "pointerdown", "pointerup", "click", "keydown"];
  for (const type of types) win.addEventListener(type, onEvent, { capture: true, passive: true });
  const onWin = (/** @type {Event} */ e) => log(`window ${e.type}`);
  win.addEventListener("blur", onWin);
  win.addEventListener("focus", onWin);
  const onVis = () => log(`visibility ${doc.visibilityState}`);
  doc.addEventListener("visibilitychange", onVis);

  let leaderboardShown = visible("leaderboardScreen");
  const observer = new win.MutationObserver(() => {
    const now = visible("leaderboardScreen");
    if (now && !leaderboardShown) {
      log("leaderboard shown");
      for (const ms of [100, 500, 1500, 3000]) setTimeout(() => log(`  leaderboard +${ms}ms`), ms);
    }
    leaderboardShown = now;
  });
  const lb = doc.getElementById("leaderboardScreen");
  if (lb) observer.observe(lb, { attributes: true, attributeFilter: ["class", "hidden"] });
  log("trace attached");

  return () => {
    for (const type of types) win.removeEventListener(type, onEvent, { capture: true });
    win.removeEventListener("blur", onWin);
    win.removeEventListener("focus", onWin);
    doc.removeEventListener("visibilitychange", onVis);
    observer.disconnect();
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
