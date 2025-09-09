/**
 * AI Horizon game logic.
 *
 * This file implements the AI Horizon game, a browser-based arcade shooter.
 * The player controls a ship, collects stars, and shoots asteroids for points.
 */

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
import LeaderboardManager from "./managers/LeaderboardManager.js";
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
 * Main game class for DarkHorizon.
 * Handles game state, rendering, input, and logic for the arcade shooter.
 */
/** @implements {Partial<GameState>} */
class DarkHorizon {
  /**
   * Precomputed set of all pause/confirm codes for quick lookup.
   */
  static PAUSE_CONFIRM_CODES = new Set([...CONFIG.INPUT.PAUSE_CODES]);
  /**
   * Initialize game state and UI elements.
   * Sets up UI, game variables, and event listeners.
   */
  constructor() {
    /** @type {HTMLCanvasElement} */
    // @ts-ignore - cast from HTMLElement
    this.canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("gameCanvas"));
    /** @type {CanvasRenderingContext2D} */
    // @ts-ignore - context inferred via cast
    this.ctx = /** @type {CanvasRenderingContext2D} */ (
      this.canvas.getContext("2d", { alpha: false })
    );
    this.view = { width: 0, height: 0, dpr: 1 };
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

    this.highScore = UIManager.loadHighScore();
    this.score = 0;
    this.updateHighScore();

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

    this.bulletPool = new ObjectPool(
      (x, y, w, h, speed) => new Bullet(x, y, w, h, speed),
      undefined,
      { maxSize: 512 }
    );
    this.particlePool = new ObjectPool(
      (x, y, vx, vy, life, maxLife, size, color) =>
        new Particle(x, y, vx, vy, life, maxLife, size, color),
      undefined,
      { maxSize: 4096 }
    );
    this.asteroidPool = new ObjectPool(
      (x, y, w, h, speed, rng, isIndestructible = false, paletteOverride = null) =>
        new Asteroid(x, y, w, h, speed, rng, isIndestructible, paletteOverride),
      undefined,
      { maxSize: 256 }
    );
    this.starPool = new ObjectPool((x, y, w, h, speed) => new Star(x, y, w, h, speed), undefined, {
      maxSize: 256,
    });
    this.explosionPool = new ObjectPool(
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

    // Render initial leaderboard into the Game Over overlay (if present)
    try {
      if (!this.leaderboardListEl)
        this.leaderboardListEl = document.getElementById("leaderboardList");
      LeaderboardManager.render(this.leaderboardListEl);
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
    const isPauseOrConfirm = DarkHorizon.PAUSE_CONFIRM_CODES.has(codeOrKey);
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
    if (DarkHorizon.PAUSE_CONFIRM_CODES.has(e.code)) {
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
    if (DarkHorizon.PAUSE_CONFIRM_CODES.has(e.code)) {
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
      // Recompute size first
      const prevWidth = this.view.width || 0;
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
      // Ensure nebula is not shown after a plain resize (match initial load)
      // Some flows (fullReset) may force-generate a nebula; a normal resize
      // should hide it and show the standard background like on page load.
      try {
        this.nebulaConfigs = undefined;
      } catch (_e) {
        /* ignore in non-DOM/test envs */
        void 0;
      }

      // Recreate or redraw background to match new dimensions
      this.initBackground();
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
    // If no RNG seed was provided via URL, create a fresh RNG for nebula generation
    // so each Play Again produces a different nebula. If a seed was provided,
    // preserve reproducibility by not reseeding.
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has(CONFIG.RNG.SEED_PARAM)) {
        // Use a time-derived seed to ensure nebula differs between Play Again runs.
        // Combine Date.now() and performance.now() when available for extra entropy.
        let seed = (Date.now() >>> 0) ^ 0;
        try {
          if (typeof performance !== "undefined" && typeof performance.now === "function") {
            seed = (seed ^ (Math.floor(performance.now()) & 0xffffffff)) >>> 0;
          }
        } catch (_e) {
          /* ignore */
        }
        // Mix in a small Math.random salt to avoid same-ms collisions across tabs.
        seed = (seed ^ ((Math.random() * 0xffffffff) >>> 0)) >>> 0;
        this._nebulaRng = new RNG(seed);
      } else {
        this._nebulaRng = undefined;
      }
    } catch (_e) {
      // Non-browser/test envs: use a time-derived seed where possible
      const seed =
        ((Date.now() >>> 0) ^
          (typeof performance !== "undefined" && performance.now
            ? Math.floor(performance.now()) & 0xffffffff
            : 0)) >>>
        0;
      this._nebulaRng = new RNG((seed ^ ((Math.random() * 0xffffffff) >>> 0)) >>> 0);
    }
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

    // Force-generate nebula for the start screen so background looks fresh even when not running
    try {
      const bg = BackgroundManager.init({
        view: this.view,
        running: true,
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
    this.initBackground();
    // Now mark the state as running and start the loop.
    this.state.start();
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
      try {
        const url = new URL(window.location.href);
        if (!url.searchParams.has(CONFIG.RNG.SEED_PARAM)) {
          // time-derived seed to reduce chance of identical nebula between rapid restarts
          let seed = (Date.now() >>> 0) ^ 0;
          try {
            if (typeof performance !== "undefined" && typeof performance.now === "function") {
              seed = (seed ^ (Math.floor(performance.now()) & 0xffffffff)) >>> 0;
            }
          } catch (_e) {
            /* ignore */
          }
          seed = (seed ^ ((Math.random() * 0xffffffff) >>> 0)) >>> 0;
          this._nebulaRng = new RNG(seed);
        } else {
          this._nebulaRng = undefined;
        }
      } catch (_e) {
        const seed =
          ((Date.now() >>> 0) ^
            (typeof performance !== "undefined" && performance.now
              ? Math.floor(performance.now()) & 0xffffffff
              : 0)) >>>
          0;
        this._nebulaRng = new RNG((seed ^ ((Math.random() * 0xffffffff) >>> 0)) >>> 0);
      }
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
        if (!this.leaderboardListEl)
          this.leaderboardListEl = document.getElementById("leaderboardList");

        // Wire up initials input + submit button if present in DOM.
        const initialsEntry = document.querySelector(".initials-entry");
        const initialsInput = /** @type {HTMLInputElement|null} */ (
          document.getElementById("initialsInput")
        );
        const submitBtn = /** @type {HTMLButtonElement|null} */ (
          document.getElementById("submitScoreBtn")
        );

        // Only show initials UI when the score is > 0. Otherwise keep it hidden.
        try {
          if (initialsEntry) {
            if (this.score > 0) initialsEntry.classList.remove("hidden");
            else initialsEntry.classList.add("hidden");
          }
        } catch (_e) {
          /* ignore */
        }

        const trySubmit = () => {
          if (!initialsInput) return false;
          const raw = String(initialsInput.value || "")
            .trim()
            .toUpperCase();
          // Allow 1 to 3 letters (previously required exactly 3)
          if (/^[A-Z]{1,3}$/.test(raw)) {
            try {
              LeaderboardManager.submit(this.score, raw);
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
          const onClick = (e) => {
            e.preventDefault();
            if (trySubmit()) {
              try {
                // Re-render leaderboard after successful submit
                LeaderboardManager.render(this.leaderboardListEl);
              } catch (_e) {
                /* ignore */
              }
              // Hide the input and submit button after submit
              try {
                initialsInput.classList.add("hidden");
                submitBtn.classList.add("hidden");
                const initialsLabel = document.getElementById("initialsLabel");
                if (initialsLabel) initialsLabel.classList.add("hidden");
              } catch (_e) {
                /* ignore */
              }
              // Focus Play Again button so user can restart quickly
              try {
                UIManager.focusWithRetry(this.restartBtn);
              } catch (_e) {
                /* ignore */
              }
            } else {
              // If not valid, ensure the leaderboard is still updated visually
              try {
                LeaderboardManager.render(this.leaderboardListEl);
              } catch (_e) {
                /* ignore */
              }
            }
          };
          submitBtn.addEventListener("click", onClick);

          // Also allow Enter key on the input to submit
          /** @param {KeyboardEvent} ev */
          const onKey = (ev) => {
            if (ev.key === "Enter") {
              ev.preventDefault();
              if (trySubmit()) {
                try {
                  LeaderboardManager.render(this.leaderboardListEl);
                } catch (_e) {
                  /* ignore */
                }
                try {
                  initialsInput.classList.add("hidden");
                  submitBtn.classList.add("hidden");
                  const initialsLabel = document.getElementById("initialsLabel");
                  if (initialsLabel) initialsLabel.classList.add("hidden");
                } catch (_e) {
                  /* ignore */
                }
                try {
                  UIManager.focusWithRetry(this.restartBtn);
                } catch (_e) {
                  /* ignore */
                }
              }
            }
          };
          initialsInput.addEventListener("keydown", onKey);
          // When hiding the input after a successful submit, listeners are
          // removed by replacing the element's class; if needed, remove the
          // input listener here when the input is hidden to avoid leaks.
          const cleanupInput = () => {
            try {
              if (onInput) initialsInput.removeEventListener("input", onInput);
            } catch (_err) {
              /* ignore */
            }
          };
          // Ensure cleanup when submit is clicked and succeeds
          const _originalOnClick = submitBtn.onclick;
          submitBtn.addEventListener("click", () => {
            // small timeout to allow other handlers to run then cleanup
            setTimeout(cleanupInput, 0);
          });
        }
      }
    } catch (_e) {
      /* ignore */
    }

    // Render leaderboard first so the list is present before we show Game Over
    try {
      if (!this.leaderboardListEl)
        this.leaderboardListEl = document.getElementById("leaderboardList");
      LeaderboardManager.render(this.leaderboardListEl);
    } catch (_e) {
      /* ignore */
    }

    // Show Game Over. If the user submitted a score prefer to preserve
    // scroll when focusing so the leaderboard remains immediately scrollable.
    UIManager.showGameOver(
      this.gameOverScreen,
      this.restartBtn,
      this.finalScoreEl,
      this.score,
      submittedScore
    );
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
    this.highScore = UIManager.setHighScore(this.score, this.highScore, this.highScoreEl);
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

  /** Draw the pause message above everything else. */
  drawPauseOverlayText() {
    // Deprecated: pause is shown using DOM overlay to avoid blurry canvas text
  }

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
    if (!this.nebulaConfigs) {
      ctx.running = true; // force nebula creation for initial/menu background
    }
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

export { DarkHorizon };

window.addEventListener("load", () => {
  new DarkHorizon();
});
