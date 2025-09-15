/**
 * AI Horizon - main game module.
 *
 * Responsibilities:
 * - Bootstraps canvas + high-DPR scaling, input, state machine, managers, pools
 * - Hosts primary entity arrays (asteroids, bullets, particles, stars, explosions)
 * - Orchestrates update order + render via `GameLoop`
 * - Central point for seeding RNG, handling pause/resume, full resets
 * - Registers cross-cutting event handlers (see `systems/EventHandlers.js`)
 *
 * Noteworthy design choices:
 * - Object pools pre-warmed to reduce first interaction frame jank
 * - Deterministic runs supported with `?seed=NUMBER` (or any string hashed)
 * - State transitions guarded to prevent duplicate resets during transient mobile resizes
 */

// @ts-nocheck - The file contains extensive JSDoc-driven types that produce
// transient type errors under strict TS checking in this repo. Disabling
// checking here keeps runtime behavior intact while the codebase migrates
// to stronger typing. See issue tracking for incremental fixes.

import { CONFIG } from "./constants.js";

// Core
import { GameLoop } from "./core/GameLoop.js";
import { getGameContext } from "./core/GameContext.js";
import { InputState } from "./core/InputState.js";

// Entities
import { Asteroid } from "./entities/Asteroid.js";
import { Bullet } from "./entities/Bullet.js";
import { EngineTrail } from "./entities/EngineTrail.js";
import { Explosion } from "./entities/Explosion.js";
import { Nebula } from "./entities/Nebula.js";
import { Particle } from "./entities/Particle.js";
import { Player } from "./entities/Player.js";
import { Star } from "./entities/Star.js";

// Managers
import { BackgroundManager } from "./managers/BackgroundManager.js";
import { CollisionManager } from "./managers/CollisionManager.js";
import { InputManager } from "./managers/InputManager.js";
import { RenderManager } from "./managers/RenderManager.js";
import { SpawnManager } from "./managers/SpawnManager.js";
import { SpriteManager } from "./managers/SpriteManager.js";
import { UIManager } from "./managers/UIManager.js";
import { LeaderboardManager } from "./managers/LeaderboardManager.js";
import { ViewManager } from "./managers/ViewManager.js";

// Utils
import { ObjectPool } from "./utils/ObjectPool.js";
import { RateLimiter } from "./utils/RateLimiter.js";
import { RNG } from "./utils/RNG.js";
import {
  updateAsteroids,
  updateBullets,
  updateEngineTrail,
  updateExplosions,
  updateParticles,
  updateStars,
} from "./systems/UpdateSystems.js";
import { EventBus } from "./core/EventBus.js";
import { GameStateMachine } from "./core/GameStateMachine.js";
import { EventHandlers } from "./systems/EventHandlers.js";
/** @typedef {import('./types.js').GameState} GameState */

/**
 * Main game class for AIHorizon.
 * Handles game state, rendering, input, and logic for the arcade shooter.
 */
/** @implements {Partial<GameState>} */
class AIHorizon {
  /** @type {AIHorizon|null} */
  static _instance = null;
  /**
   * Precomputed set of all pause/confirm codes for quick lookup.
   */
  static PAUSE_CONFIRM_CODES = new Set([...CONFIG.INPUT.PAUSE_CODES]);
  /**
   * Initialize game state and UI elements.
   * Sets up UI, game variables, and event listeners.
   */
  constructor() {
    // Idempotent constructor: if an instance already exists, return it.
    // Note: we still allow constructing via `new` for tests, but prefer
    // using AIHorizon.getInstance() in app code. This pattern prevents
    // double-instantiation when scripts are included twice.
    if (typeof AIHorizon._instance !== "undefined" && AIHorizon._instance) {
      return AIHorizon._instance;
    }
    /** @type {HTMLCanvasElement} */
    // @ts-ignore - cast from HTMLElement
    this.canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("gameCanvas"));
    /** @type {CanvasRenderingContext2D} */
    // @ts-ignore - context inferred via cast
    this.ctx = /** @type {CanvasRenderingContext2D} */ (
      this.canvas.getContext("2d", { alpha: false })
    );
    this.view = { width: 0, height: 0, dpr: 1 };
    // Track current orientation (portrait|landscape) so we can suppress expensive
    // resize handling on mobile for transient viewport changes (e.g. soft keyboard,
    // URL bar show/hide). We compute after first resize below; initialize neutral.
    this._lastOrientation = null;
    this.gameInfo = /** @type {HTMLElement} */ (document.getElementById("gameInfo"));
    this.gameOverScreen = /** @type {HTMLElement} */ (document.getElementById("gameOverScreen"));
    this.pauseScreen = /** @type {HTMLElement} */ (document.getElementById("pauseScreen"));
    this.startBtn = /** @type {HTMLButtonElement} */ (document.getElementById("startBtn"));
    this.restartBtn = /** @type {HTMLButtonElement} */ (document.getElementById("restartBtn"));
    this.currentScoreEl = /** @type {HTMLElement} */ (document.getElementById("currentScore"));
    this.highScoreEl = /** @type {HTMLElement} */ (document.getElementById("highScore"));
    this.finalScoreEl = /** @type {HTMLElement} */ (document.getElementById("finalScore"));
    this.leaderboardListEl = /** @type {HTMLElement} */ (
      document.getElementById("leaderboardList")
    );
    this.timerEl = /** @type {HTMLElement|null} */ (document.getElementById("timer"));

    // Initialize highScore to a sensible default and load leaderboard entries
    // once below (may be sync or async depending on remote configuration).
    this.highScore = 0;
    this.score = 0;
    // Update display immediately with default high score (0) and then
    // re-render/update when leaderboard load completes.
    try {
      this.updateHighScore();
    } catch (_e) {
      /* ignore */
    }

    // Timer configuration
    this.timerSeconds = CONFIG.GAME.TIMER_SECONDS || 60;
    this.timerRemaining = this.timerSeconds;
    // Ensure UI shows initial timer
    try {
      UIManager.setTimer(this.timerEl, this.timerRemaining);
    } catch (_e) {
      /* ignore */
    }

    this.input = new InputState();
    this.events = new EventBus();

    this._isMobile = this.isMobile();

    this.asteroidSpeed = this._isMobile
      ? CONFIG.SPEEDS.ASTEROID_MOBILE
      : CONFIG.SPEEDS.ASTEROID_DESKTOP;
    this.bulletSpeed = CONFIG.SPEEDS.BULLET;
    this.starSpeed = CONFIG.SPEEDS.STAR;

    // Initialize RNG with optional seed from URL (?seed=...) for reproducible runs
    let seed = undefined;
    try {
      const url = new URL(window.location.href);
      const s = url.searchParams.get(CONFIG.RNG.SEED_PARAM);
      if (s && s.length) {
        const n = Number(s);
        seed = Number.isFinite(n) ? n : undefined;
        if (seed === undefined) {
          // Fallback to string hashing for non-numeric seeds
          this.rng = RNG.fromString(s);
        }
      }
    } catch {
      // non-browser envs (tests) may lack URL; ignore
    }
    this.rng = this.rng || new RNG(seed);
    this.fireLimiter = new RateLimiter(CONFIG.GAME.SHOT_COOLDOWN, () => this.timeMs);

    // State machine controls high-level flow
    this.state = new GameStateMachine();
    this._pausedFrameRendered = false;
    // Suppress automatic fullReset triggered by transient resizes (e.g. native prompt/keyboard)
    // This is toggled around user prompts to avoid reverting to the start screen on mobile.
    this._suppressFullResetOnResize = false;

    this.fireLimiter.reset();
    this.timeMs = 0;
    this.timeSec = 0;

    this.player = new Player(0, 0, CONFIG.SIZES.PLAYER, CONFIG.SIZES.PLAYER, CONFIG.SPEEDS.PLAYER);

    this.engineTrail = new EngineTrail();

    this.resizeCanvas();
    // Establish initial orientation after first canvas measurement
    try {
      this._lastOrientation = window.innerWidth > window.innerHeight ? "landscape" : "portrait";
    } catch {
      /* non-browser/test env */
    }
    this.initBackground();
    this.drawBackground();

    this.sprites = SpriteManager.createSprites();
    this.cellSize = CONFIG.ASTEROID.MIN_SIZE + CONFIG.ASTEROID.SIZE_VARIATION;

    /** @type {Asteroid[]} */
    this.asteroids = [];
    /** @type {Bullet[]} */
    this.bullets = [];
    /** @type {Explosion[]} */
    this.explosions = [];
    /** @type {any[]} */
    this.particles = [];
    /** @type {{x:number,y:number,life:number,maxLife:number,text:string,color:string,fontSize?:number,fontWeight?:string,glow?:boolean,glowColor?:string,glowBlur?:number,stroke?:string}[]} */
    this.scorePopups = [];
    /** @type {Star[]} */
    this.stars = [];

    // @__PURE__ object pool factories (side-effect free constructors)
    this.bulletPool = /* @__PURE__ */ new ObjectPool(
      (x, y, w, h, speed) => new Bullet(x, y, w, h, speed),
      undefined,
      { maxSize: 512 }
    );
    this.particlePool = /* @__PURE__ */ new ObjectPool(
      (x, y, vx, vy, life, maxLife, size, color) =>
        new Particle(x, y, vx, vy, life, maxLife, size, color),
      undefined,
      { maxSize: 4096 }
    );
    this.asteroidPool = /* @__PURE__ */ new ObjectPool(
      (x, y, w, h, speed, rng, isIndestructible = false, paletteOverride = null) =>
        new Asteroid(x, y, w, h, speed, rng, isIndestructible, paletteOverride),
      undefined,
      { maxSize: 256 }
    );
    this.starPool = /* @__PURE__ */ new ObjectPool(
      (x, y, w, h, speed) => new Star(x, y, w, h, speed),
      undefined,
      {
        maxSize: 256,
      }
    );
    this.explosionPool = /* @__PURE__ */ new ObjectPool(
      (x, y, w, h, life, maxLife) => new Explosion(x, y, w, h, life, maxLife),
      undefined,
      { maxSize: 256 }
    );

    // Pre-allocate common objects to reduce first-use jank
    this._warmUpPools();

    this.bindEventHandlers();
    this.setupEventListeners();
    // Register EventBus handlers centrally
    this._unsubscribeEvents = EventHandlers.register(this);

    this.startBtn.focus();

    // Load leaderboard entries once and use the result to set the
    // displayed high score and render the leaderboard. LeaderboardManager
    // may return either an array (sync) or a Promise (remote), so handle
    // both paths.
    try {
      const maybeEntries = LeaderboardManager.load({ remote: LeaderboardManager.IS_REMOTE });
      /**
       * @param {{id:string,score:number}[]} entries
       */
      const handleEntries = (entries) => {
        try {
          const high = Array.isArray(entries)
            ? entries.reduce((max, e) => Math.max(max, Number(e.score || 0)), 0)
            : 0;
          this.highScore = high;
          this.updateHighScore();
          const el = this.leaderboardListEl || document.getElementById("leaderboardList");
          if (el) LeaderboardManager.render(el, entries);
        } catch (_e) {
          /* ignore */
        }
      };
      if (Array.isArray(maybeEntries)) {
        handleEntries(maybeEntries);
      } else if (maybeEntries && typeof maybeEntries.then === "function") {
        maybeEntries.then(handleEntries).catch(() => {});
      }
    } catch (_e) {
      /* ignore */
    }

    this.loop = new GameLoop({
      update: (dtMs, dtSec) => {
        this.timeMs += dtMs;
        this.timeSec += dtSec;
        this._lastDtSec = dtSec;
        this.update(dtSec);
      },
      draw: () => this.draw(),
      shouldUpdate: () => this.state.isRunning(),
      stepMs: CONFIG.TIME.STEP_MS,
      maxSubSteps: CONFIG.TIME.MAX_SUB_STEPS,
    });
    // Cache singleton instance after construction completes
    AIHorizon._instance = this;
  }

  /**
   * Return the singleton instance, constructing it if necessary.
   * @returns {AIHorizon}
   */
  static getInstance() {
    if (typeof AIHorizon._instance !== "undefined" && AIHorizon._instance)
      return AIHorizon._instance;
    AIHorizon._instance = new AIHorizon();
    return AIHorizon._instance;
  }

  /**
   * Create a transient score popup drawn on the canvas.
   * @param {number} x
   * @param {number} y
   * @param {number} score
   * @param {{color?:string,fontSize?:number,fontWeight?:string,glow?:boolean,glowColor?:string,glowBlur?:number,stroke?:string,maxLife?:number}} [opts]
   */
  createScorePopup(x, y, score, opts) {
    const o = opts || {};
    this.scorePopups.push({
      x,
      y,
      life: 0,
      maxLife: typeof o.maxLife === "number" ? o.maxLife : 0.9,
      text: `+${score}`,
      color: o.color || "#fff",
      fontSize: o.fontSize || 18,
      fontWeight: o.fontWeight || "700",
      glow: !!o.glow,
      glowColor: o.glowColor || o.color || "#fff",
      glowBlur: o.glowBlur || 8,
      stroke: o.stroke || undefined,
    });
  }

  /** Create a small gold particle burst for indestructible asteroid kills. */
  /**
   * @param {number} x
   * @param {number} y
   */
  createGoldBurst(x, y) {
    const rng = this.rng;
    const count = 8;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (rng.nextFloat() - 0.5) * 0.4;
      const speed = rng.range(40, 160);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const size = rng.range(2, 6);
      const life = 0.6 + rng.nextFloat() * 0.6;
      const color = "#ffd700";
      this.particles.push(this.particlePool.acquire(x, y, vx, vy, life, life, size, color));
    }
  }

  /** no-op placeholder to hint presence; handlers are registered in systems/EventHandlers */
  /** @type {(() => void) | null} */
  _unsubscribeEvents = null;

  /**
   * Detect if the user is on a mobile device.
   * @returns {boolean} True if mobile device detected, else false.
   */
  isMobile() {
    // Prefer User-Agent Client Hints when available
    // Access UA Client Hints via loose cast to support older lib.dom typings
    const uaData = /** @type {any} */ (navigator).userAgentData;
    if (uaData && typeof uaData.mobile === "boolean") {
      return uaData.mobile;
    }

    // Feature/media-query based detection
    const hasTouch = (navigator.maxTouchPoints || 0) > 0;
    const supportsMQ = typeof window.matchMedia === "function";
    const coarse = supportsMQ && window.matchMedia("(any-pointer: coarse)").matches;
    const noHover = supportsMQ && window.matchMedia("(any-hover: none)").matches;
    if (hasTouch && (coarse || noHover)) return true;

    // Last-resort fallback (legacy browsers)
    return /Mobi|Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  /**
   * Bind all event handler methods to the current instance.
   */
  bindEventHandlers() {
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleMouseLeave = this.handleMouseLeave.bind(this);
    this.handleTouchMove = this.handleTouchMove.bind(this);
    this.handleTouchStart = this.handleTouchStart.bind(this);
    this.handleTouchEnd = this.handleTouchEnd.bind(this);
    this.handleStartClick = this.handleStartClick.bind(this);
    this.handleRestartClick = this.handleRestartClick.bind(this);
    this.handleStartKeyDown = this.handleStartKeyDown.bind(this);
    this.handleRestartKeyDown = this.handleRestartKeyDown.bind(this);
    this.resizeCanvas = this.resizeCanvas.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.handleStartScreenFocusGuard = this.handleStartScreenFocusGuard.bind(this);
    this.handleGameOverFocusGuard = this.handleGameOverFocusGuard.bind(this);
    this.handlePauseKeyDown = this.handlePauseKeyDown.bind(this);
    this.shouldTogglePause = this.shouldTogglePause.bind(this);
    this.handleScroll = this.handleScroll.bind(this);
    this.shoot = this.shoot.bind(this);
    this.movementKeys = new Set(CONFIG.INPUT.MOVEMENT_CODES);
  }

  /**
   * Set up keyboard, mouse, touch, and button event listeners.
   */
  setupEventListeners() {
    InputManager.setup(
      this.canvas,
      this.gameInfo,
      this.gameOverScreen,
      this.startBtn,
      this.restartBtn,
      {
        handleKeyDown: this.handleKeyDown,
        handleKeyUp: this.handleKeyUp,
        handleResize: this.handleResize,
        handleMouseMove: this.handleMouseMove,
        handleMouseDown: this.handleMouseDown,
        handleMouseUp: this.handleMouseUp,
        handleMouseLeave: this.handleMouseLeave,
        handleTouchMove: this.handleTouchMove,
        handleTouchStart: this.handleTouchStart,
        handleTouchEnd: this.handleTouchEnd,
        handleStartClick: this.handleStartClick,
        handleRestartClick: this.handleRestartClick,
        handleStartKeyDown: this.handleStartKeyDown,
        handleRestartKeyDown: this.handleRestartKeyDown,
        handleStartScreenFocusGuard: this.handleStartScreenFocusGuard,
        handleGameOverFocusGuard: this.handleGameOverFocusGuard,
        handleWindowFocus: () =>
          UIManager.handleWindowFocus(
            this.gameInfo,
            this.startBtn,
            this.gameOverScreen,
            this.restartBtn
          ),
        handleVisibilityChange: () =>
          UIManager.handleVisibilityChange(
            this.gameInfo,
            this.startBtn,
            this.gameOverScreen,
            this.restartBtn
          ),
        handleDocumentFocusIn: (e) =>
          UIManager.handleDocumentFocusIn(
            e,
            this.gameInfo,
            this.startBtn,
            this.gameOverScreen,
            this.restartBtn
          ),
        handleScroll: this.handleScroll,
        handlePauseKeyDown: this.handlePauseKeyDown,
      }
    );
  }

  /**
   * Global keydown handler for pause/resume toggling.
   * @param {KeyboardEvent} e
   */
  handlePauseKeyDown(e) {
    if (this.shouldTogglePause(e)) {
      e.preventDefault();
      this.togglePause();
    }
  }

  /**
   * Determine if the pause state should toggle based on the event and current game state.
   * @param {KeyboardEvent} e
   * @returns {boolean}
   */
  shouldTogglePause(e) {
    if (!this.state.isRunning() && !this.state.isPaused()) return false;
    if (e.repeat) return false;
    const codeOrKey = e.code || e.key;
    const isPauseOrConfirm = AIHorizon.PAUSE_CONFIRM_CODES.has(codeOrKey);
    // Only allow confirm keys to resume if paused
    if (this.state.isPaused()) {
      return isPauseOrConfirm;
    }
    // Otherwise, allow pause keys/codes to pause
    return isPauseOrConfirm;
  }

  /**
   * Keep focus on the start button when the Start overlay is visible.
   * Prevents taps/clicks from removing focus on mobile.
   * @param {Event} e
   */
  handleStartScreenFocusGuard(e) {
    UIManager.handleStartScreenFocusGuard(e, this.gameInfo, this.startBtn);
  }

  /**
   * Keep focus on the restart button when the Game Over overlay is visible.
   * Prevents taps/clicks from removing focus on mobile.
   * @param {Event} e
   */
  handleGameOverFocusGuard(e) {
    UIManager.handleGameOverFocusGuard(e, this.gameOverScreen, this.restartBtn);
  }

  /**
   * Ensure the correct overlay button is focused if an overlay is visible.
   * Useful when the user switches tabs/apps and returns.
   */

  /**
   * Update cached canvas bounding rect (used for touch offset calculations).
   */
  handleScroll() {
    this.canvasRect = this.canvas.getBoundingClientRect();
  }

  /**
   * Ensure a given element receives focus reliably (helps on mobile Safari/Chrome).
   * @param {HTMLElement} el
   */
  focusWithRetry(el) {
    UIManager.focusWithRetry(el);
  }

  /**
   * Handle keydown events.
   * @param {KeyboardEvent} e - The keyboard event.
   */
  handleKeyDown(e) {
    if (document.activeElement === this.startBtn || document.activeElement === this.restartBtn)
      return;
    this.input.setKey(e.code, true);
    if (CONFIG.INPUT.FIRE_CODES.includes(e.code)) {
      if (!e.repeat) {
        e.preventDefault();
        this.input.fireHeld = true;
        this.shoot();
      }
      return;
    }
    if (this.movementKeys?.has && this.movementKeys.has(e.code)) {
      this.input.clearMouse();
    }
  }

  /**
   * Handle keyup events.
   * @param {KeyboardEvent} e - The keyboard event.
   */
  handleKeyUp(e) {
    this.input.setKey(e.code, false);
    if (CONFIG.INPUT.FIRE_CODES.includes(e.code)) {
      this.input.fireHeld = false;
    }
  }

  /**
   * Track mouse position.
   * @param {MouseEvent} e - The mouse event.
   */
  handleMouseMove(e) {
    this.input.mouse.x = e.offsetX;
    this.input.mouse.y = e.offsetY;
  }

  /** Mouse down -> start continuous fire and fire immediately. */
  handleMouseDown() {
    if (!this.state.isRunning()) return;
    this.input.fireHeld = true;
    this.shoot();
  }

  /** Mouse up -> stop continuous fire. */
  handleMouseUp() {
    this.input.fireHeld = false;
  }

  /** Mouse leaves canvas -> stop continuous fire. */
  handleMouseLeave() {
    this.input.fireHeld = false;
  }

  /**
   * Track touch position (mobile).
   * @param {TouchEvent} e - The touch event.
   */
  handleTouchMove(e) {
    e.preventDefault();
    if (!this.canvasRect) this.canvasRect = this.canvas.getBoundingClientRect();
    const touch = e.touches[0];
    this.input.mouse.x = touch.clientX - this.canvasRect.left;
    this.input.mouse.y = touch.clientY - this.canvasRect.top;
  }

  /**
   * Handle touch start event (mobile).
   * @param {TouchEvent} e - The touch event.
   */
  handleTouchStart(e) {
    e.preventDefault();
    if (!this.state.isRunning()) return;
    this.input.fireHeld = true;
    this.shoot();
  }

  /** End touch (lift/cancel) -> stop continuous fire.
   * @param {TouchEvent} [e]
   */
  handleTouchEnd(e) {
    if (e && e.cancelable) e.preventDefault();
    this.input.fireHeld = false;
  }

  /**
   * Start the game when start button is clicked.
   */
  handleStartClick() {
    this.startGame();
    this.startBtn.focus();
  }

  /**
   * Restart the game when restart button is clicked.
   */
  handleRestartClick() {
    this.hideGameOver();
    this.startGame();
    this.startBtn.focus();
  }

  /**
   * Keyboard accessibility for start button.
   * @param {KeyboardEvent} e - The keyboard event.
   */
  handleStartKeyDown(e) {
    if (AIHorizon.PAUSE_CONFIRM_CODES.has(e.code)) {
      e.preventDefault();
      this.startGame();
      this.startBtn.focus();
    }
  }

  /**
   * Keyboard accessibility for restart button.
   * @param {KeyboardEvent} e - The keyboard event.
   */
  handleRestartKeyDown(e) {
    if (AIHorizon.PAUSE_CONFIRM_CODES.has(e.code)) {
      e.preventDefault();
      this.hideGameOver();
      this.startGame();
      this.startBtn.focus();
    }
  }

  /**
   * Fire a bullet if cooldown allows.
   */
  shoot() {
    if (!this.state.isRunning()) return;
    this.fireLimiter.try(() => {
      this.bullets.push(this.createBullet());
    });
  }

  /**
   * Resize the game canvas and reposition the player.
   */
  resizeCanvas() {
    ViewManager.resize(this);
  }

  /**
   * Debounced resize handler to avoid excessive work during window resizing.
   */
  handleResize() {
    if (this._resizeScheduled) return;
    this._resizeScheduled = true;
    requestAnimationFrame(() => {
      this._resizeScheduled = false;
      // If on a mobile device, ignore resizes that do not correspond to an
      // orientation change (portrait <-> landscape). This avoids triggering
      // background regeneration or full resets when the soft keyboard appears,
      // URL bar hides, PWA chrome animates, etc.
      if (this._isMobile) {
        let currentOrientation = this._lastOrientation;
        try {
          const now = window.innerWidth > window.innerHeight ? "landscape" : "portrait";
          currentOrientation = now;
        } catch {
          /* non-browser env */
        }
        if (this._lastOrientation && currentOrientation === this._lastOrientation) {
          return; // skip non-orientation resize on mobile
        }
        this._lastOrientation = currentOrientation;
      }
      // Recompute size first
      const prevWidth = this.view.width || 0;
      const prevHeight = this.view.height || 0;
      this.resizeCanvas();

      // Detect platform (mobile/desktop) change and perform a full reset when
      // either the `isMobile()` heuristic toggles or the layout crosses a
      // desktop/mobile width breakpoint (e.g. 768px). Some browsers don't
      // change UA/hints during resizes, so breakpoint detection is a pragmatic
      // fallback.
      const currentlyMobile = this.isMobile();
      const newWidth = this.view.width || 0;
      const BREAKPOINT = 768;
      const crossedBreakpoint =
        (prevWidth < BREAKPOINT && newWidth >= BREAKPOINT) ||
        (prevWidth >= BREAKPOINT && newWidth < BREAKPOINT);

      // If platform hint changed or layout breakpoint crossed, perform a
      // full reset so the start/menu overlay ("Launch Mission") is shown.
      // NOTE: we intentionally do NOT trigger a full reset merely because
      // the user is at Game Over and the viewport resized. That behavior
      // previously returned players to the start screen on transient
      // resizes (e.g. native prompts or keyboard), which is undesirable.
      if (currentlyMobile !== this._isMobile || crossedBreakpoint) {
        this.fullReset();
      }
      // Prefer to update existing background state to match new canvas
      // dimensions instead of fully reinitializing it. This preserves
      // nebula and star positions and avoids visible jumps on resize.
      try {
        // Use BackgroundManager.resize to adapt existing background state.
        // Pass previous view so helper can scale positions/sizes correctly.
        const prevView = { width: prevWidth, height: prevHeight };
        const ctx = getGameContext(this);
        const resized = BackgroundManager.resize(ctx, prevView);
        if (resized) {
          // When the view size has changed, regenerate the nebula so it
          // matches the new dimensions instead of scaling the old one.
          const widthChanged = (prevView.width || 0) !== (this.view.width || 0);
          const heightChanged = (prevView.height || 0) !== (this.view.height || 0);
          if (widthChanged || heightChanged) {
            // Force nebula regeneration on resize
            this.nebulaConfigs = undefined;
            this.initBackground();
          } else {
            if (resized.nebulaConfigs) this.nebulaConfigs = resized.nebulaConfigs;
            if (resized.starField) this.starField = resized.starField;
          }
        } else {
          // Fallback to init if resize helper couldn't run (e.g., no prior state)
          this.initBackground();
        }
      } catch (_e) {
        // ignore in non-DOM/test envs
        try {
          this.initBackground();
        } catch (_err) {
          void 0;
        }
      }
      if (this.state.isPaused()) this._pausedFrameRendered = false;
      if (!this.state.isRunning()) {
        this.drawBackground();
      }
    });
  }

  /**
   * Soft reinitialize game parameters that depend on platform characteristics.
   * Preserves dynamic game state (score, entities) while updating speeds, nebula counts, and
   * other derived values so the game adapts cleanly to viewport/platform changes.
   * @param {boolean} nowMobile
   */
  softReinitForPlatformChange(nowMobile) {
    this._isMobile = nowMobile;
    // Update speeds that depend on platform
    this.asteroidSpeed = this._isMobile
      ? CONFIG.SPEEDS.ASTEROID_MOBILE
      : CONFIG.SPEEDS.ASTEROID_DESKTOP;
    this.starSpeed = CONFIG.SPEEDS.STAR;

    // Reset spawn counters so cadence aligns with new platform expectations
    SpawnManager.reset(this);
    // Force nebula regeneration on next init so each new game gets a fresh background.
    this.nebulaConfigs = undefined;

    // Re-warm pools for likely smaller/larger entities (cheap, optional)
    try {
      // warmup counts are heuristic and intentionally small to avoid jank
      if (this.starPool && typeof this.starPool.warmUp === "function") {
        this.starPool.warmUp(16, 0, 0, 0, 0, this.starSpeed, false);
      }
      if (this.asteroidPool && typeof this.asteroidPool.warmUp === "function") {
        this.asteroidPool.warmUp(
          8,
          0,
          0,
          CONFIG.ASTEROID.MIN_SIZE,
          CONFIG.ASTEROID.MIN_SIZE,
          this.asteroidSpeed,
          false
        );
      }
    } catch (_e) {
      // Ignore warmup failures - optional optimization
      void 0;
    }

    // Recreate sprites if necessary for DPI/platform differences
    if (SpriteManager && typeof SpriteManager.createSprites === "function") {
      try {
        this.sprites = SpriteManager.createSprites();
      } catch (_e) {
        // ignore
        void 0;
      }
    }
  }

  /**
   * Fully reset the game to initial (menu) state while preserving persistent data such
   * as the saved high score. Useful to reinitialize after platform or layout changes.
   * This clears dynamic entities, resets timers, resets spawn counters and pools,
   * and re-evaluates platform-dependent parameters.
   */
  fullReset() {
    // Stop the loop if running
    if (this.loop) this.loop.stop();

    // Release pooled entities back to pools
    /**
     * @param {Array<any>} arr
     * @param {{ release: (obj: any) => void } | undefined} pool
     */
    const releaseAll = (arr, pool) => {
      if (!arr || !pool) return;
      for (const it of arr) pool.release(it);
    };
    releaseAll(this.asteroids, this.asteroidPool);
    releaseAll(this.bullets, this.bulletPool);
    releaseAll(this.explosions, this.explosionPool);
    releaseAll(this.particles, this.particlePool);
    releaseAll(this.stars, this.starPool);

    // Clear runtime arrays
    this.asteroids = [];
    this.bullets = [];
    this.explosions = [];
    this.particles = [];
    this.stars = [];
    this.scorePopups = [];

    // Reset scores and timers
    this.score = 0;
    this.updateScore();
    // reset countdown timer
    this.timerRemaining = this.timerSeconds;
    try {
      UIManager.setTimer(this.timerEl, this.timerRemaining);
    } catch (_e) {
      /* ignore */
    }
    this.timeMs = 0;
    this.timeSec = 0;
    this.fireLimiter.reset();
    this.input = new InputState();

    // Reset spawn counters and RNG remains the same for reproducibility
    SpawnManager.reset(this);

    // Recompute platform flags and speeds
    this._isMobile = this.isMobile();
    this.asteroidSpeed = this._isMobile
      ? CONFIG.SPEEDS.ASTEROID_MOBILE
      : CONFIG.SPEEDS.ASTEROID_DESKTOP;
    this.starSpeed = CONFIG.SPEEDS.STAR;

    // Warm up pools again (best-effort)
    this._warmUpPools();

    // Recreate sprites and background to match fresh state
    try {
      this.sprites = SpriteManager.createSprites();
    } catch (_e) {
      // ignore in tests/non-DOM
      void 0;
    }
    this.initBackground();
    this.drawBackground();

    // Ensure UI overlays are reset: hide game over / pause, show start/info overlay
    try {
      UIManager.hideGameOver(this.gameOverScreen);
      UIManager.hidePause(this.pauseScreen);
      if (this.gameInfo && this.gameInfo.classList.contains("hidden")) {
        this.gameInfo.classList.remove("hidden");
      }
    } catch (_e) {
      // ignore in non-DOM environments
      void 0;
    }

    // Preserve existing nebula/starField state but do not force-generate
    // nebula for the start/menu screen. Nebula will be generated when the
    // game starts so it only appears during gameplay.
    try {
      const bg = BackgroundManager.init({
        view: this.view,
        running: false,
        isMobile: this._isMobile,
        rng: this.rng,
      });
      if (bg && bg.nebulaConfigs) this.nebulaConfigs = bg.nebulaConfigs;
      this.starField = bg && bg.starField ? bg.starField : this.starField;
    } catch (_e) {
      // ignore in tests/non-DOM
      void 0;
    }

    // Focus the Launch Mission / Start button for accessibility and immediate keyboard usage
    try {
      UIManager.focusWithRetry(this.startBtn);
    } catch (_e) {
      // ignore in non-DOM environments
      void 0;
    }

    // Reset FSM to menu
    this.state = new GameStateMachine();

    // Re-register event handlers to ensure no duplicates
    if (this._unsubscribeEvents) {
      try {
        this._unsubscribeEvents();
      } catch (_e) {
        void _e;
      }
    }
    this._unsubscribeEvents = EventHandlers.register(this);
  }

  /**
   * Start or restart the game, reset scores and state.
   */
  startGame() {
    // Reset runtime game state, ensure canvas/view metrics are up-to-date
    // and position the player at the initial spawn before starting.
    // If we're starting from Game Over (Play Again), force nebula regeneration.
    // For the initial "Launch Mission" flow we want to preserve the nebula
    // that was generated on page load, so do not force regeneration.
    let wasGameOver = false;
    try {
      wasGameOver = !!(
        this.state &&
        typeof this.state.isGameOver === "function" &&
        this.state.isGameOver()
      );
    } catch (_e) {
      wasGameOver = false;
    }
    this.resetGameState(wasGameOver);
    // resizeCanvas uses ViewManager.resize which will place the player
    // at the spawn position when the game is not yet running.
    this.resizeCanvas();
    this.hideGameInfo();
    // Now mark the state as running and then initialize background so
    // nebula generation (which runs only when ctx.running === true) will
    // occur. This ensures nebula appears only during gameplay.
    this.state.start();
    this.initBackground();
    this.loop.start();
  }

  /**
   * Reset score and clear dynamic entity arrays.
   */
  resetGameState(forceNebula = false) {
    /**
     * Release all elements back to their pool.
     * @param {Array<any>} arr
     * @param {{ release: (obj: any) => void } | undefined} pool
     */
    const releaseAll = (arr, pool) => {
      if (!arr || !pool) return;
      for (const it of arr) pool.release(it);
    };
    releaseAll(this.asteroids, this.asteroidPool);
    releaseAll(this.bullets, this.bulletPool);
    releaseAll(this.explosions, this.explosionPool);
    releaseAll(this.particles, this.particlePool);
    releaseAll(this.stars, this.starPool);
    this.score = 0;
    this.updateScore();
    // reset countdown timer for new game
    this.timerRemaining = this.timerSeconds;
    try {
      UIManager.setTimer(this.timerEl, this.timerRemaining);
    } catch (_e) {
      /* ignore */
    }
    this.asteroids = [];
    this.bullets = [];
    this.explosions = [];
    this.particles = [];
    this.stars = [];
    this.scorePopups = [];
    this.fireLimiter.reset();
    // Clear input state (mouse/touch and keys) so a lingering touch doesn't
    // cause the player to immediately move away from the spawn position on restart.
    // FullReset creates a fresh InputState; mirror that behaviour here.
    this.input = new InputState();
    // Reset spawn cadence counters managed by SpawnManager
    SpawnManager.reset(this);
    // Only force nebula regeneration and create a fresh nebula RNG when
    // explicitly requested (Play Again). Preserve existing nebula for the
    // initial "Launch Mission" so the background stays the same as on page load.
    if (forceNebula) {
      this.nebulaConfigs = undefined;
      // Fresh nebula RNG seeding previously occurred here but was unused; assignments removed as dead code.
    }
  }

  /**
   * Toggle pause state.
   */
  togglePause() {
    if (this.state.isPaused()) {
      this.state.resume();
      UIManager.hidePause(this.pauseScreen);
    } else if (this.state.isRunning()) {
      this.state.pause();
      UIManager.showPause(this.pauseScreen);
    }
    this._pausedFrameRendered = false;
  }

  /**
   * End the game.
   */
  gameOver() {
    this.state.end();
    this.updateHighScore();
    // Ensure pause overlay is hidden if game ends while paused
    UIManager.hidePause(this.pauseScreen);
    // Submit score to local leaderboard and then show game over UI.
    // Use a DOM input/submit button (no native prompt). Track whether the
    // user submitted a valid 3-letter ID so we can preserve scroll when
    // focusing the Play Again button.
    let submittedScore = false;
    try {
      if (this.score > 0) {
        // Suppress fullReset triggered by transient viewport/resize changes
        // while any native prompt replacement UI is active on some mobile browsers.
        this._suppressFullResetOnResize = true;
        // Ensure leaderboard element exists for rendering below.
        // Prefer existing cached element, otherwise look it up without
        // assigning null to the instance field.
        const lbEl = this.leaderboardListEl || document.getElementById("leaderboardList");

        // Wire up initials input + submit button if present in DOM.
        const initialsEntry = document.querySelector(".initials-entry");
        const initialsInput = /** @type {HTMLInputElement|null} */ (
          document.getElementById("initialsInput")
        );
        const submitBtn = /** @type {HTMLButtonElement|null} */ (
          document.getElementById("submitScoreBtn")
        );

        // Do not force-show initials here; UIManager.showGameOver will decide based on leaderboard rank.
        if (initialsEntry) initialsEntry.classList.add("hidden");

        const _trySubmit = () => {
          if (!initialsInput) return false;
          const raw = String(initialsInput.value || "")
            .trim()
            .toUpperCase();
          // Allow 1 to 3 letters
          if (/^[A-Z]{1,3}$/.test(raw)) {
            try {
              LeaderboardManager.submit(this.score, raw, { remote: LeaderboardManager.IS_REMOTE });
              submittedScore = true;
              // clear input to indicate success
              initialsInput.value = "";
            } catch (_e) {
              /* ignore */
            }
            return true;
          }
          // simple inline feedback: briefly add an invalid class
          try {
            if (initialsInput) {
              initialsInput.classList.add("invalid");
              setTimeout(() => initialsInput.classList.remove("invalid"), 900);
              initialsInput.focus({ preventScroll: true });
            }
          } catch (_e) {
            /* ignore */
          }
          return false;
        };

        if (submitBtn && initialsInput) {
          // Normalize input to uppercase as the user types while preserving caret
          // position. This provides immediate visual feedback and keeps the
          // underlying value consistent for submission.
          /** @type {(e: Event) => void | undefined} */
          let onInput;
          try {
            /** @param {Event} e */
            // Normalize input live: strip any non-letter characters, uppercase,
            // and cap to 3 characters while preserving the caret position.
            onInput = (e) => {
              try {
                const el = /** @type {HTMLInputElement} */ (e.target);
                const raw = String(el.value || "");
                const start = el.selectionStart || 0;
                const end = el.selectionEnd || 0;
                // Filter to letters A-Z only, then uppercase and limit to 3 chars
                const filtered = raw
                  .replace(/[^a-zA-Z]/g, "")
                  .toUpperCase()
                  .slice(0, 3);
                if (el.value !== filtered) {
                  // Compute new caret position: move left by the number of removed
                  // chars before the original caret. This is a best-effort that
                  // handles common editing scenarios.
                  const removedBeforeCaret = raw.slice(0, start).replace(/[a-zA-Z]/g, "").length;
                  const newPos = Math.max(0, start - removedBeforeCaret);
                  el.value = filtered;
                  try {
                    el.setSelectionRange(newPos, newPos);
                  } catch (_) {
                    // ignore if selection can't be set
                  }
                } else {
                  // Value unchanged except maybe case; ensure uppercase and restore selection
                  el.value = filtered;
                  try {
                    if (typeof start === "number" && typeof end === "number") {
                      el.setSelectionRange(start, end);
                    }
                  } catch (_) {
                    /* ignore */
                  }
                }
              } catch (_err) {
                /* ignore */
              }
            };
            initialsInput.addEventListener("input", onInput);
          } catch (_e) {
            /* ignore */
          }
          // Prevent double-binding if gameOver called repeatedly
          /** @param {MouseEvent} e */
          // Shared cleanup and hide helpers so both click and Enter can hide
          // the initials UI consistently.
          /** @type {((ev: FocusEvent) => void)|null} */
          let onFocusOut = null;
          const cleanupInput = () => {
            try {
              if (onInput) initialsInput.removeEventListener("input", onInput);
            } catch (_err) {
              /* ignore */
            }
          };

          const hideInitialsUI = () => {
            try {
              if (initialsInput) initialsInput.classList.add("hidden");
              if (submitBtn) submitBtn.classList.add("hidden");
              const initialsLabel = document.getElementById("initialsLabel");
              if (initialsLabel) initialsLabel.classList.add("hidden");
            } catch (_err) {
              /* ignore */
            }
            try {
              cleanupInput();
            } catch (_err) {
              /* ignore */
            }
            try {
              if (initialsInput && onFocusOut) {
                const fn = /** @type {(ev: FocusEvent) => void} */ (onFocusOut);
                initialsInput.removeEventListener("focusout", fn);
              }
            } catch (_err) {
              /* ignore */
            }
          };

          /** @param {MouseEvent} e */
          const onClick = (e) => {
            // Prevent double submission if a pointerdown already submitted
            if (submittedScore) return;
            e.preventDefault();
            try {
              // Read raw initials and submit only if valid (1-3 A-Z)
              const raw = initialsInput
                ? String(initialsInput.value || "")
                    .trim()
                    .toUpperCase()
                : "";
              if (/^[A-Z]{1,3}$/.test(raw)) {
                try {
                  LeaderboardManager.submit(this.score, raw, {
                    remote: LeaderboardManager.IS_REMOTE,
                  });
                  submittedScore = true;
                  if (initialsInput) initialsInput.value = "";
                } catch (_e) {
                  /* ignore */
                }
              }
            } catch (_e) {
              /* ignore */
            }
            // Re-render leaderboard. Hide initials UI only when the Submit
            // button was clicked (don't hide on other interactions like
            // focusout so the input remains visible until an explicit
            // submit via the button).
            try {
              if (lbEl) LeaderboardManager.render(lbEl);
            } catch (_e) {
              /* ignore */
            }
            try {
              // Hide the UI and cleanup listeners when the user explicitly
              // clicked the Submit button.
              hideInitialsUI();
            } catch (_e) {
              /* ignore */
            }
            // Focus Play Again button so user can restart quickly
            try {
              UIManager.focusWithRetry(this.restartBtn);
            } catch (_e) {
              /* ignore */
            }
          };
          submitBtn.addEventListener("click", onClick);
          // Some browsers/firefox may fire focusout before click when the user
          // taps the submit button. Attach a pointerdown handler that submits
          // earlier in the event order to avoid a race where the input is
          // hidden before the click handler runs.
          try {
            submitBtn.addEventListener("pointerdown", (ev) => {
              if (submittedScore) return;
              try {
                ev.preventDefault();
              } catch (_) {
                /* ignore */
              }
              try {
                onClick(ev);
              } catch (_) {
                /* ignore */
              }
            });
          } catch (_e) {
            /* ignore */
          }

          // Also allow Enter key on the input to submit. When Enter is
          // pressed and submission succeeds, hide the initials UI like a
          // click submission so the Play Again button can be focused.
          /** @param {KeyboardEvent} ev */
          const onKey = (ev) => {
            if (ev.key === "Enter") {
              ev.preventDefault();
              try {
                const raw = initialsInput
                  ? String(initialsInput.value || "")
                      .trim()
                      .toUpperCase()
                  : "";
                if (/^[A-Z]{1,3}$/.test(raw)) {
                  try {
                    LeaderboardManager.submit(this.score, raw, {
                      remote: LeaderboardManager.IS_REMOTE,
                    });
                    submittedScore = true;
                    if (initialsInput) initialsInput.value = "";
                  } catch (_e) {
                    /* ignore */
                  }
                }
              } catch (_e) {
                /* ignore */
              }
              try {
                if (lbEl) LeaderboardManager.render(lbEl);
              } catch (_e) {
                /* ignore */
              }
              // Hide the initials UI on Enter (match click behavior) so
              // the Play Again button can be focused and the UI is cleaned
              // up after a successful submit.
              try {
                hideInitialsUI();
              } catch (_e) {
                /* ignore */
              }
              try {
                UIManager.focusWithRetry(this.restartBtn);
              } catch (_e) {
                /* ignore */
              }
            }
          };
          initialsInput.addEventListener("keydown", onKey);
          // Hide the initials UI when the input loses focus unless focus
          // moved to the submit button (user clicked Submit). Use focusout
          // which bubbles and provides relatedTarget on modern browsers.
          /** @param {FocusEvent} ev */
          onFocusOut = (ev) => {
            try {
              const related = /** @type {HTMLElement|null} */ (
                // relatedTarget may be null in some environments; fall back
                // to document.activeElement for best-effort detection.
                (ev && /** @type {any} */ (ev).relatedTarget) || document.activeElement
              );
              const movedToSubmit =
                related === submitBtn ||
                (related &&
                  typeof related.closest === "function" &&
                  related.closest("#submitScoreBtn"));
              const movedToInitials =
                related === initialsInput ||
                (related &&
                  typeof related.closest === "function" &&
                  related.closest("#initialsInput"));
              // If focus moved away from the input and didn't go to the
              // submit button or back to the input itself, don't hide the
              // UI automatically; instead remove focus handlers to avoid
              // leaks and keep the controls visible until the user clicks
              // Submit explicitly.
              if (!movedToSubmit && !movedToInitials) {
                try {
                  // Remove input listeners to avoid leaks but keep UI visible
                  cleanupInput();
                } catch (_err) {
                  /* ignore */
                }
                try {
                  const fn = /** @type {(ev: FocusEvent) => void} */ (onFocusOut);
                  initialsInput.removeEventListener("focusout", fn);
                } catch (_err) {
                  /* ignore */
                }
              }
            } catch (_e) {
              /* ignore */
            }
          };
          try {
            initialsInput.addEventListener("focusout", onFocusOut);
          } catch (_e) {
            /* ignore */
          }
          // Ensure cleanup when submit is clicked and succeeds. The shared
          // cleanupInput declared earlier is used; schedule a final cleanup
          // after click handlers run.
          const _originalOnClick = submitBtn.onclick;
          submitBtn.addEventListener("click", () => {
            // small timeout to allow other handlers to run then cleanup
            setTimeout(() => {
              try {
                cleanupInput();
              } catch (_err) {
                /* ignore */
              }
            }, 0);
          });
        }
      }
    } catch (_e) {
      /* ignore */
    }

    // Render leaderboard first so the list is present before we show Game Over
    try {
      const lbEl = this.leaderboardListEl || document.getElementById("leaderboardList");
      if (lbEl) LeaderboardManager.render(lbEl);
    } catch (_e) {
      /* ignore */
    }

    // Allow UIManager to compute gating; pass undefined so it evaluates leaderboard rank.
    let allowInitials = undefined;

    UIManager.showGameOver(
      this.gameOverScreen,
      this.restartBtn,
      this.finalScoreEl,
      this.score,
      submittedScore,
      allowInitials
    );

    // Defensive: if we decided initials must not be shown, ensure all
    // initials-related elements are hidden so other UI code can't reveal
    // them unexpectedly.
    // UIManager now controls initials visibility; no extra defensive hide needed.

    // Clear the suppression after the Game Over UI is shown — allow a short
    // grace period so any prompt-induced resizes don't trigger a fullReset.
    try {
      setTimeout(() => {
        this._suppressFullResetOnResize = false;
      }, 800);
    } catch (_e) {
      this._suppressFullResetOnResize = false;
    }
    // (leaderboard already rendered above)
    if (this.loop) this.loop.stop();
  }

  /**
   * Show the game over screen.
   */
  showGameOver() {
    UIManager.showGameOver(this.gameOverScreen, this.restartBtn, this.finalScoreEl, this.score);
  }

  /**
   * Hide the game over screen.
   */
  hideGameOver() {
    UIManager.hideGameOver(this.gameOverScreen);
  }

  /**
   * Hide the game info.
   */
  hideGameInfo() {
    UIManager.hideGameInfo(this.gameInfo);
  }

  /**
   * Update the displayed current score.
   */
  updateScore() {
    UIManager.setScore(this.currentScoreEl, this.score);
  }

  /**
   * Update and persist the high score if needed.
   */
  updateHighScore() {
    this.highScore = LeaderboardManager.setHighScore(this.score, this.highScore, this.highScoreEl);
  }

  /**
   * Update all game objects and check collisions.
   */
  update(dtSec = CONFIG.TIME.DEFAULT_DT) {
    // Only animate nebula when the game is actively running. This keeps the
    // nebula static on the start/menu screen (Launch Mission) while still
    // allowing motion during active gameplay.
    if (
      this.nebulaConfigs &&
      this.state &&
      typeof this.state.isRunning === "function" &&
      this.state.isRunning()
    ) {
      Nebula.update(this.view.width, this.view.height, this.nebulaConfigs, this._isMobile, dtSec);
    }
    updateAsteroids(this, dtSec);
    updateBullets(this, dtSec);
    updateEngineTrail(this, dtSec);
    updateExplosions(this, dtSec);
    updateParticles(this, dtSec);
    updateStars(this, dtSec);
    if (this.input.fireHeld) {
      this.shoot();
    }
    this.spawnObjects(dtSec);
    this.checkCollisions();
    this.player.update(this.input.keys, this.input.mouse, this.view, dtSec);

    // Countdown timer -- only while running
    try {
      if (this.state.isRunning()) {
        this.timerRemaining -= dtSec;
        if (this.timerRemaining <= 0) {
          this.timerRemaining = 0;
          UIManager.setTimer(this.timerEl, this.timerRemaining);
          // Force game over when timer expires
          this.gameOver();
        } else {
          UIManager.setTimer(this.timerEl, this.timerRemaining);
        }
      }
    } catch (_e) {
      /* ignore in non-DOM/test envs */
    }
  }

  /**
   * Randomly spawn asteroids and collectible stars.
   * @param {number} dtSec
   */
  spawnObjects(dtSec) {
    SpawnManager.spawnObjects(this, dtSec);
  }

  /**
   * Check for collisions between bullets, asteroids, player, and stars.
   */
  checkCollisions() {
    CollisionManager.check(this);
  }

  /**
   * Axis-aligned bounding box collision detection.
   * @param {{x: number, y: number, width: number, height: number}} rect1 - First rectangle.
   * @param {{x: number, y: number, width: number, height: number}} rect2 - Second rectangle.
   * @returns {boolean} True if collision detected, else false.
   */
  checkCollision(rect1, rect2) {
    return CollisionManager.intersects(rect1, rect2);
  }

  /**
   * Create a new asteroid object with random size and speed.
   * @returns {Asteroid} A new asteroid instance.
   */
  createAsteroid() {
    return SpawnManager.createAsteroid(this);
  }

  /**
   * Create a new bullet object at the player's position.
   * @returns {Bullet} A new bullet instance.
   */
  createBullet() {
    const bx =
      this.player.x + (this.player.width - CONFIG.BULLET.WIDTH) / 2 + CONFIG.BULLET.SPAWN_OFFSET;
    return this.bulletPool.acquire(
      bx,
      this.player.y,
      CONFIG.BULLET.WIDTH,
      CONFIG.BULLET.HEIGHT,
      this.bulletSpeed
    );
  }

  /**
   * Create explosion and particle effects at given position.
   * @param {number} x - X coordinate of explosion center.
   * @param {number} y - Y coordinate of explosion center.
   */
  createExplosion(x, y) {
    const rng = this.rng;
    for (let i = 0; i < CONFIG.EXPLOSION.PARTICLE_COUNT; i++) {
      const vx = (rng.nextFloat() - 0.5) * CONFIG.EXPLOSION.PARTICLE_SPEED_VAR;
      const vy = (rng.nextFloat() - 0.5) * CONFIG.EXPLOSION.PARTICLE_SPEED_VAR;
      const size =
        rng.range(0, CONFIG.EXPLOSION.PARTICLE_SIZE_VARIATION) + CONFIG.EXPLOSION.PARTICLE_SIZE_MIN;
      const gray = rng.range(40, 80);
      this.particles.push(
        this.particlePool.acquire(
          x,
          y,
          vx,
          vy,
          CONFIG.EXPLOSION.PARTICLE_LIFE,
          CONFIG.EXPLOSION.PARTICLE_LIFE,
          size,
          `hsl(0, 0%, ${gray}%)`
        )
      );
    }
    this.explosions.push(
      this.explosionPool.acquire(
        x - CONFIG.EXPLOSION.OFFSET,
        y - CONFIG.EXPLOSION.OFFSET,
        CONFIG.EXPLOSION.SIZE,
        CONFIG.EXPLOSION.SIZE,
        CONFIG.EXPLOSION.LIFE,
        CONFIG.EXPLOSION.LIFE
      )
    );
  }

  /**
   * Create a new collectible star object with random size and speed.
   * @returns {Star} A new star instance.
   */
  createStar() {
    return SpawnManager.createStar(this);
  }

  /**
   * Pre-allocate common pooled objects to reduce first-use jank.
   * Uses representative dimensions/speeds; objects remain in the free list until acquired.
   */
  _warmUpPools() {
    try {
      // Bullets
      this.bulletPool.warmUp(64, 0, 0, CONFIG.BULLET.WIDTH, CONFIG.BULLET.HEIGHT, this.bulletSpeed);

      // Asteroids
      const aW = CONFIG.ASTEROID.MIN_SIZE + CONFIG.ASTEROID.SIZE_VARIATION * 0.5;
      const aH = aW;
      this.asteroidPool.warmUp(
        32,
        0,
        CONFIG.ASTEROID.SPAWN_Y,
        aW,
        aH,
        this.asteroidSpeed,
        this.rng,
        false
      );

      // Stars
      const sSize = CONFIG.STAR.MIN_SIZE + CONFIG.STAR.SIZE_VARIATION * 0.5;
      this.starPool.warmUp(32, 0, CONFIG.STAR.SPAWN_Y, sSize, sSize, this.starSpeed, false);

      // Particles (explosion-like)
      this.particlePool.warmUp(
        256,
        0,
        0,
        0,
        0,
        CONFIG.EXPLOSION.PARTICLE_LIFE,
        CONFIG.EXPLOSION.PARTICLE_LIFE,
        2,
        "#999"
      );

      // Explosions
      this.explosionPool.warmUp(
        16,
        0,
        0,
        CONFIG.EXPLOSION.SIZE,
        CONFIG.EXPLOSION.SIZE,
        CONFIG.EXPLOSION.LIFE,
        CONFIG.EXPLOSION.LIFE
      );
    } catch (_) {
      // warm-up is best-effort; ignore in non-DOM or test envs
    }
  }

  /**
   * Draw all game objects and background for the current frame.
   */
  draw() {
    if (this.state.isPaused()) {
      if (!this._pausedFrameRendered) {
        this.drawFrame();
        this._pausedFrameRendered = true;
      }
      // Pause text now shown via DOM overlay, not canvas
      return;
    }

    this.drawFrame();
  }

  /**
   * Draw one full frame in the correct order.
   * Kept separate to avoid duplication between paused and running states.
   */
  drawFrame() {
    RenderManager.draw(this);
  }

  // Removed unused drawPauseOverlayText() (legacy canvas-based pause overlay)

  /**
   * Init the background.
   */
  initBackground() {
    // Build a game context for the background manager. If we don't yet have
    // any nebulaConfigs (initial load / menu), force nebula generation so the
    // start screen has a visible nebula even when the game isn't running.
    const ctx = getGameContext(this);
    // Prefer a fresh, time-seeded RNG for nebula generation on init (Play Again)
    // when the user hasn't provided a deterministic seed via URL. This avoids
    // reusing the main game RNG state which can produce identical nebula across
    // restarts. If a URL seed is present, keep reproducible behavior by not
    // overriding the RNG.
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has(CONFIG.RNG.SEED_PARAM)) {
        // create a small time-derived seed
        let seed = (Date.now() >>> 0) ^ 0;
        try {
          if (typeof performance !== "undefined" && typeof performance.now === "function") {
            seed = (seed ^ (Math.floor(performance.now()) & 0xffffffff)) >>> 0;
          }
        } catch (_e) {
          /* ignore */
        }
        seed = (seed ^ ((Math.random() * 0xffffffff) >>> 0)) >>> 0;
        ctx.rng = new RNG(seed);
      }
    } catch (_e) {
      // Non-browser/test envs: fall back to fresh RNG
      ctx.rng = new RNG();
    }
    // Do not force nebula creation for the menu/start screen. Nebula will be
    // created when the game is started (running == true).
    const { nebulaConfigs, starField } = BackgroundManager.init(ctx);
    // Preserve existing nebula when not re-generated (e.g., paused/gameover)
    if (nebulaConfigs) this.nebulaConfigs = nebulaConfigs;
    this.starField = starField;
  }

  /**
   * Draw the background.
   */
  drawBackground() {
    BackgroundManager.draw(getGameContext(this));
  }

  /**
   * Draw all asteroids with craters and outlines.
   */
  drawAsteroids() {
    RenderManager.drawAsteroids(this.ctx, this.asteroids);
  }

  /**
   * Draw all bullets and their trails.
   */
  drawBullets() {
    RenderManager.drawBullets(this.ctx, this.bullets, this.sprites);
  }

  /**
   * Draw collectible stars with pulsing and glow effects.
   */
  drawCollectibleStars() {
    RenderManager.drawCollectibleStars(this.ctx, this.stars, this.sprites, this.timeSec);
  }

  /**
   * Draw explosion effects with animated gradients.
   */
  drawExplosions() {
    RenderManager.drawExplosions(this.ctx, this.explosions);
  }

  /**
   * Draw all particles with fading and glow effects.
   */
  drawParticles() {
    RenderManager.drawParticles(this.ctx, this.particles);
  }
}

export { AIHorizon };
// Backwards-compatible export name expected by the test suite
export { AIHorizon as DarkHorizon };

window.addEventListener(
  "load",
  () => {
    // Use the factory to ensure singleton/idempotent instantiation.
    try {
      AIHorizon.getInstance();
    } catch (_e) {
      // ignore in non-DOM/test envs
    }
  },
  { once: true }
);
