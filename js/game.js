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

import { CONFIG } from "./constants.js";

import { GameLoop } from "./core/GameLoop.js";
import { getGameContext } from "./core/GameContext.js";
import { InputState } from "./core/InputState.js";

import { Asteroid } from "./entities/Asteroid.js";
import { Bullet } from "./entities/Bullet.js";
import { EngineTrail } from "./entities/EngineTrail.js";
import { Explosion } from "./entities/Explosion.js";
import { Nebula } from "./entities/Nebula.js";
import { Particle } from "./entities/Particle.js";
import { Player } from "./entities/Player.js";
import { Star } from "./entities/Star.js";

import { BackgroundManager } from "./managers/BackgroundManager.js";
import { CollisionManager } from "./managers/CollisionManager.js";
import { InputManager } from "./managers/InputManager.js";
import { RenderManager } from "./managers/RenderManager.js";
import { SpawnManager } from "./managers/SpawnManager.js";
import { SpriteManager } from "./managers/SpriteManager.js";
import { UIManager } from "./managers/UIManager.js";
import { LeaderboardManager } from "./managers/LeaderboardManager.js";
import { ViewManager } from "./managers/ViewManager.js";

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
import { PerformanceMonitor } from "./core/PerformanceMonitor.js";
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
    this._lastOrientation = null;
    this.gameInfo = /** @type {HTMLElement} */ (document.getElementById("gameInfo"));
    this.gameOverScreen = /** @type {HTMLElement} */ (document.getElementById("gameOverScreen"));
    this.pauseScreen = /** @type {HTMLElement} */ (document.getElementById("pauseScreen"));
    this.startBtn = /** @type {HTMLButtonElement} */ (document.getElementById("startBtn"));
    this.restartBtn = /** @type {HTMLButtonElement} */ (document.getElementById("restartBtn"));
    this.currentScoreEl = /** @type {HTMLElement} */ (document.getElementById("currentScore"));
    this.highScoreEl = /** @type {HTMLElement} */ (document.getElementById("highScore"));
    this.highScoreBox = /** @type {HTMLElement|null} */ (document.getElementById("highScoreBox"));
    this.finalScoreEl = /** @type {HTMLElement} */ (document.getElementById("finalScore"));
    this.leaderboardListEl = /** @type {HTMLElement} */ (
      document.getElementById("leaderboardList")
    );
    this.timerEl = /** @type {HTMLElement|null} */ (document.getElementById("timer"));

    this.highScore = 0;
    this.score = 0;
    try {
      this.updateHighScore();
    } catch (_e) {
      /* ignore */
    }

    this.timerSeconds = CONFIG.GAME.TIMER_SECONDS || 60;
    this.timerRemaining = this.timerSeconds;
    try {
      UIManager.setTimer(this.timerEl, this.timerRemaining);
    } catch (_e) {
      /* ignore */
    }

    this.input = new InputState();
    this.events = new EventBus();

    // Guard to prevent an accidental 'click' on the Game Over / Restart UI that
    // can be synthesized when the user lifts the finger they were using for
    // continuous gameplay touch-drag fire control. When armed, the very next
    // click event (capture phase) is swallowed, then the guard auto-disarms.
    this._uiTouchGuardActive = false;
    this._uiTouchGuardTimeout = null;

    this._isMobile = this.isMobile();
    this._isLowPowerMode = false;
    this._performanceLevel = 0;
    this._starfieldScale = 1;
    this._spawnRateScale = 1;
    this._particleBudget = Number.POSITIVE_INFINITY;
    this._performanceParticleMultiplier = 1;
    this._dprOverride = null;
    this._engineTrailModulo = 1;
    this._engineTrailStep = 0;

    this.asteroidSpeed = this._isMobile
      ? CONFIG.SPEEDS.ASTEROID_MOBILE
      : CONFIG.SPEEDS.ASTEROID_DESKTOP;
    this.bulletSpeed = CONFIG.SPEEDS.BULLET;
    this.starSpeed = CONFIG.SPEEDS.STAR;

    let seed = undefined;
    try {
      const url = new URL(window.location.href);
      const s = url.searchParams.get(CONFIG.RNG.SEED_PARAM);
      if (s && s.length) {
        const n = Number(s);
        seed = Number.isFinite(n) ? n : undefined;
        if (seed === undefined) {
          this.rng = RNG.fromString(s);
        }
      }
    } catch {
      /* intentionally empty */
    }
    this.rng = this.rng || new RNG(seed);
    this.fireLimiter = new RateLimiter(CONFIG.GAME.SHOT_COOLDOWN, () => this.timeMs);

    this.state = new GameStateMachine();
    this._pausedFrameRendered = false;
    this._suppressFullResetOnResize = false;
    this._loopRunning = false;
    this._resumeLoopOnVisibility = false;

    this.fireLimiter.reset();
    this.timeMs = 0;
    this.timeSec = 0;

    this.player = new Player(0, 0, CONFIG.SIZES.PLAYER, CONFIG.SIZES.PLAYER, CONFIG.SPEEDS.PLAYER);

    this.engineTrail = new EngineTrail();

    this.resizeCanvas();
    try {
      this._lastOrientation = window.innerWidth > window.innerHeight ? "landscape" : "portrait";
    } catch {
      /* intentionally empty */
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

    const perfConfig = CONFIG.PERFORMANCE || {};
    this.performanceMonitor = new PerformanceMonitor({
      levels: Array.isArray(perfConfig.LEVELS) ? perfConfig.LEVELS : undefined,
      sampleWindow: perfConfig.SAMPLE_WINDOW,
      cooldownFrames: perfConfig.COOLDOWN_FRAMES,
      onLevelChange: (level, meta) => this._applyPerformanceProfile(level, meta),
    });
    this._applyPerformanceProfile(this._performanceLevel, { reinitialize: false, initial: true });

    this._warmUpPools();

    this.bindEventHandlers();
    this.setupEventListeners();
    this._unsubscribeEvents = EventHandlers.register(this);

    // Global capture listener to intercept the first post-game synthetic click.
    try {
      document.addEventListener("click", this.handleGuardClick, true);
    } catch (_e) {
      /* ignore */
    }

    this.startBtn.focus();

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

    // Detect connectivity via a third-party endpoint; start async without blocking constructor.
    LeaderboardManager.detectRemote({ timeoutMs: 1200 })
      .then((isRemote) => {
        LeaderboardManager.IS_REMOTE = !!isRemote;
        // Reflect connection status in the high score UI border
        try {
          const box = this.highScoreBox || document.getElementById("highScoreBox");
          if (box) {
            box.classList.remove("connection-online", "connection-offline");
            box.classList.add(
              LeaderboardManager.IS_REMOTE ? "connection-online" : "connection-offline"
            );
          }
        } catch (_e) {
          /* ignore */
        }
        return LeaderboardManager.load({ remote: LeaderboardManager.IS_REMOTE });
      })
      .then((entries) => handleEntries(entries))
      .catch(async () => {
        // Fall back to local-only load
        try {
          LeaderboardManager.IS_REMOTE = false;
          // Mark high score as offline
          try {
            const box = this.highScoreBox || document.getElementById("highScoreBox");
            if (box) {
              box.classList.remove("connection-online", "connection-offline");
              box.classList.add("connection-offline");
            }
          } catch (_e) {
            /* ignore */
          }
          const localEntries = await LeaderboardManager.load({ remote: false });
          handleEntries(localEntries);
        } catch (_e) {
          /* ignore */
        }
      });

    this.loop = new GameLoop({
      update: (dtMs, dtSec) => {
        this.timeMs += dtMs;
        this.timeSec += dtSec;
        this._lastDtSec = dtSec;
        this.update(dtSec);
      },
      draw: (frameDtMs) => this.draw(frameDtMs),
      shouldUpdate: () => this.state.isRunning(),
      stepMs: CONFIG.TIME.STEP_MS,
      maxSubSteps: CONFIG.TIME.MAX_SUB_STEPS,
    });
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
   * Release every element of a pooled collection back to its pool.
   * Defensive: tolerates missing arrays or pools.
   * @param {Array<any>} arr
   * @param {{ release: (obj:any)=>void } | undefined | null} pool
   */
  _releaseAll(arr, pool) {
    if (!arr || !pool) return;
    for (const it of arr) {
      try {
        pool.release(it);
      } catch (_e) {
        /* ignore individual release failures */
      }
    }
  }

  /** Release all dynamic entity collections back to their pools. */
  _releaseAllDynamic() {
    this._releaseAll(this.asteroids, this.asteroidPool);
    this._releaseAll(this.bullets, this.bulletPool);
    this._releaseAll(this.explosions, this.explosionPool);
    this._releaseAll(this.particles, this.particlePool);
    this._releaseAll(this.stars, this.starPool);
  }

  /**
   * Reset score, timer, scoreboard UI, fire limiter, input state & dynamic collections.
   * (Time counters & performance monitor resets are handled by fullReset separately.)
   */
  _resetCoreRuntimeState() {
    this.score = 0;
    this.updateScore();
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
    this.input = new InputState();
  }

  /**
   * Create a transient score popup drawn on the canvas.
   * Visual only; does not affect game logic besides animating feedback for scoring events.
   * Lifespan is short and the popup fades/moves (handled in render/update systems).
   * @param {number} x Canvas-space X coordinate where popup appears.
   * @param {number} y Canvas-space Y coordinate where popup appears.
   * @param {number} score Amount to display (rendered with a + prefix).
   * @param {{color?:string,fontSize?:number,fontWeight?:string,glow?:boolean,glowColor?:string,glowBlur?:number,stroke?:string,maxLife?:number}} [opts] Visual customization overrides.
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
   * Radial particle emission used as feedback when an indestructible asteroid is removed.
   * Uses the shared particle pool to avoid allocations.
   * @param {number} x Center X coordinate of the burst.
   * @param {number} y Center Y coordinate of the burst.
   */
  createGoldBurst(x, y) {
    const rng = this.rng;
    const baseCount = 8;
    const count = Math.max(2, Math.round(baseCount * this._performanceParticleMultiplier));
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this._particleBudget) break;
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
   * Multi-strategy heuristic using User-Agent Client Hints, pointer media queries,
   * and a final UA regex fallback. Cached indirectly via instance field that
   * callers may store; safe to call repeatedly.
   * @returns {boolean} True if mobile device detected; false otherwise.
   */
  isMobile() {
    const uaData = /** @type {any} */ (navigator).userAgentData;
    if (uaData && typeof uaData.mobile === "boolean") {
      return uaData.mobile;
    }

    const hasTouch = (navigator.maxTouchPoints || 0) > 0;
    const supportsMQ = typeof window.matchMedia === "function";
    const coarse = supportsMQ && window.matchMedia("(any-pointer: coarse)").matches;
    const noHover = supportsMQ && window.matchMedia("(any-hover: none)").matches;
    if (hasTouch && (coarse || noHover)) return true;

    return /Mobi|Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  /**
   * Bind all event handler methods to the current instance.
   * Must be called once in constructor before registering listeners so that
   * `removeEventListener` works reliably (stable function identities).
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
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.shoot = this.shoot.bind(this);
    this.movementKeys = new Set(CONFIG.INPUT.MOVEMENT_CODES);
    this.handleGuardClick = this.handleGuardClick.bind(this);
  }

  /**
   * Set up keyboard, mouse, touch, and button event listeners.
   * Delegates to InputManager for DOM wiring; stores unsubscribe handle for later cleanup.
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
        handleVisibilityChange: this.handleVisibilityChange,
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
   * Guard rails:
   * - Ignores key repeats.
   * - Only responds while running or paused.
   * - Accepts any configured pause/confirm code.
   * @param {KeyboardEvent} e Keyboard event to evaluate.
   * @returns {boolean} True if pause should toggle.
   */
  shouldTogglePause(e) {
    if (!this.state.isRunning() && !this.state.isPaused()) return false;
    if (e.repeat) return false;
    const codeOrKey = e.code || e.key;
    return AIHorizon.PAUSE_CONFIRM_CODES.has(codeOrKey);
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
   * Pause rendering work when the document is hidden and resume when visible.
   * Also delegates focus management back to the UI layer after visibility returns.
   */
  handleVisibilityChange() {
    const hidden = typeof document !== "undefined" && document.hidden;
    if (hidden) {
      this._resumeLoopOnVisibility = this._loopRunning;
      if (this.loop && this._loopRunning) {
        this.loop.stop();
        this._loopRunning = false;
      }
      return;
    }

    if (this._resumeLoopOnVisibility && this.loop) {
      this.loop.start();
      this._loopRunning = true;
    }
    this._resumeLoopOnVisibility = false;

    UIManager.handleVisibilityChange(
      this.gameInfo,
      this.startBtn,
      this.gameOverScreen,
      this.restartBtn
    );
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
    // Ignore clicks while cooldown is active to avoid accidental restart from held input.
    if (this.restartBtn && this.restartBtn.dataset && this.restartBtn.dataset.cooldown === "1")
      return;
    this.hideGameOver();
    this.startGame();
    try {
      this.startBtn.focus();
    } catch (_) {
      /* ignore */
    }
  }

  /**
   * Keyboard accessibility for start button.
   * @param {KeyboardEvent} e - The keyboard event.
   */
  handleStartKeyDown(e) {
    // Prevent Space (fire key) from triggering a start via the browser's default
    // button activation behavior. Space should only initiate firing once the game
    // has actually started, not launch the mission itself.
    if (e.code === "Space" || e.key === " ") {
      e.preventDefault(); // cancels default synthesized click on keyup
      return; // ignore
    }
    // Allow existing confirm/pause codes (currently Escape) to start the game.
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
    // Prevent Space (fire key) from triggering an accidental restart via the
    // browser's default button activation behavior. Space should only fire in-game.
    if (e.code === "Space" || e.key === " ") {
      e.preventDefault(); // cancels default click synthesis on keyup
      return; // ignore
    }
    // Allow Escape (existing confirm) to restart. Optionally we could allow Enter in future.
    if (AIHorizon.PAUSE_CONFIRM_CODES.has(e.code)) {
      e.preventDefault();
      // Guard against extremely rapid repeats while cooldown is active.
      if (this.restartBtn && this.restartBtn.dataset && this.restartBtn.dataset.cooldown === "1")
        return;
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
      if (this._isMobile) {
        let currentOrientation = this._lastOrientation;
        try {
          const now = window.innerWidth > window.innerHeight ? "landscape" : "portrait";
          currentOrientation = now;
        } catch {
          /* non-browser env */
        }
        if (this._lastOrientation && currentOrientation === this._lastOrientation) {
          return;
        }
        this._lastOrientation = currentOrientation;
      }
      const prevWidth = this.view.width || 0;
      const prevHeight = this.view.height || 0;
      this.resizeCanvas();

      const currentlyMobile = this.isMobile();
      const newWidth = this.view.width || 0;
      const BREAKPOINT = 768;
      const crossedBreakpoint =
        (prevWidth < BREAKPOINT && newWidth >= BREAKPOINT) ||
        (prevWidth >= BREAKPOINT && newWidth < BREAKPOINT);
      const RESET_ON_BREAKPOINT = (CONFIG.VIEW && CONFIG.VIEW.RESET_ON_BREAKPOINT) || false;
      if (currentlyMobile !== this._isMobile) {
        // Update platform-dependent parameters without clearing dynamic entities.
        try {
          this.softReinitForPlatformChange(currentlyMobile);
        } catch (_e) {
          /* fallback: if soft reinit fails we can still attempt a full reset */
          try {
            this.fullReset();
          } catch (_err) {
            /* ignore */
          }
        }
      } else if (RESET_ON_BREAKPOINT && crossedBreakpoint) {
        // Opt-in legacy behavior.
        this.fullReset();
      }
      try {
        const prevView = { width: prevWidth, height: prevHeight };
        const ctx = getGameContext(this);
        const resized = BackgroundManager.resize(ctx, prevView);
        if (resized) {
          const widthChanged = (prevView.width || 0) !== (this.view.width || 0);
          const heightChanged = (prevView.height || 0) !== (this.view.height || 0);
          if (widthChanged || heightChanged) {
            this.nebulaConfigs = undefined;
            this.initBackground();
          } else {
            if (resized.nebulaConfigs) this.nebulaConfigs = resized.nebulaConfigs;
            if (resized.starField) this.starField = resized.starField;
          }
        } else {
          this.initBackground();
        }
      } catch (_e) {
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
    this.asteroidSpeed = this._isMobile
      ? CONFIG.SPEEDS.ASTEROID_MOBILE
      : CONFIG.SPEEDS.ASTEROID_DESKTOP;
    this.starSpeed = CONFIG.SPEEDS.STAR;

    SpawnManager.reset(this);
    this.nebulaConfigs = undefined;

    try {
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
      void 0;
    }

    if (SpriteManager && typeof SpriteManager.createSprites === "function") {
      try {
        this.sprites = SpriteManager.createSprites();
      } catch (_e) {
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
    if (this.loop) {
      this.loop.stop();
      this._loopRunning = false;
    }
    if (this.performanceMonitor) {
      this.performanceMonitor.reset(this._performanceLevel);
    }
    this._engineTrailStep = 0;
    this._releaseAllDynamic();
    this._resetCoreRuntimeState();
    this.timeMs = 0;
    this.timeSec = 0;

    SpawnManager.reset(this);

    this._isMobile = this.isMobile();
    this.asteroidSpeed = this._isMobile
      ? CONFIG.SPEEDS.ASTEROID_MOBILE
      : CONFIG.SPEEDS.ASTEROID_DESKTOP;
    this.starSpeed = CONFIG.SPEEDS.STAR;

    this._warmUpPools();

    try {
      this.sprites = SpriteManager.createSprites();
    } catch (_e) {
      void 0;
    }
    this.initBackground();
    this.drawBackground();

    try {
      UIManager.hideGameOver(this.gameOverScreen);
      UIManager.hidePause(this.pauseScreen);
      if (this.gameInfo && this.gameInfo.classList.contains("hidden")) {
        this.gameInfo.classList.remove("hidden");
      }
    } catch (_e) {
      void 0;
    }

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
      void 0;
    }

    try {
      UIManager.focusWithRetry(this.startBtn);
    } catch (_e) {
      void 0;
    }

    this.state = new GameStateMachine();

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
    this.resizeCanvas();
    this.hideGameInfo();
    this.state.start();
    this.initBackground();
    this.loop.start();
    this._loopRunning = true;
  }

  /**
   * Reset score and clear dynamic entity arrays.
   */
  resetGameState(forceNebula = false) {
    this._releaseAllDynamic();
    this._resetCoreRuntimeState();
    SpawnManager.reset(this);
    if (forceNebula) {
      this.nebulaConfigs = undefined;
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
    // Arm UI touch guard if a gameplay touch was active (continuous fire / drag).
    try {
      if (this.input && this.input.fireHeld) {
        this._uiTouchGuardActive = true;
        if (this._uiTouchGuardTimeout) clearTimeout(this._uiTouchGuardTimeout);
        this._uiTouchGuardTimeout = setTimeout(() => {
          this._uiTouchGuardActive = false;
        }, 0);
      }
    } catch (_e) {
      /* ignore */
    }
    this.state.end();
    this.updateHighScore();
    UIManager.hidePause(this.pauseScreen);
    let submittedScore = false;
    try {
      if (this.score > 0) {
        this._suppressFullResetOnResize = true;
        const lbEl = this.leaderboardListEl || document.getElementById("leaderboardList");

        const initialsEntry = document.querySelector(".initials-entry");
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

        // Hide any inline initials UI (was used when initials were inside game over overlay).
        if (initialsEntry) initialsEntry.classList.add("hidden");

        const _trySubmit = () => {
          if (!initialsInput) return false;
          const raw = String(initialsInput.value || "")
            .trim()
            .toUpperCase();
          if (/^[A-Z]{1,3}$/.test(raw)) {
            try {
              LeaderboardManager.submit(this.score, raw, { remote: LeaderboardManager.IS_REMOTE });
              submittedScore = true;
              initialsInput.value = "";
            } catch (_e) {
              /* ignore */
            }
            return true;
          }
          try {
            if (initialsInput) {
              initialsInput.classList.add("invalid");
              setTimeout(() => initialsInput.classList.remove("invalid"), 0);
              initialsInput.focus({ preventScroll: true });
            }
          } catch (_e) {
            /* ignore */
          }
          return false;
        };

        if (submitBtn && initialsInput) {
          /** @type {(e: Event) => void | undefined} */
          let onInput;
          try {
            /** @param {Event} e */
            onInput = (e) => {
              try {
                const el = /** @type {HTMLInputElement} */ (e.target);
                const raw = String(el.value || "");
                const start = el.selectionStart || 0;
                const end = el.selectionEnd || 0;
                const filtered = raw
                  .replace(/[^a-zA-Z]/g, "")
                  .toUpperCase()
                  .slice(0, 3);
                if (el.value !== filtered) {
                  const removedBeforeCaret = raw.slice(0, start).replace(/[a-zA-Z]/g, "").length;
                  const newPos = Math.max(0, start - removedBeforeCaret);
                  el.value = filtered;
                  try {
                    el.setSelectionRange(newPos, newPos);
                  } catch (_) {
                    /* intentionally empty */
                  }
                } else {
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
          /** @param {MouseEvent} e */
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
            try {
              UIManager.syncInitialsSubmitFocusGuard();
            } catch (_err) {
              /* ignore */
            }
          };

          /** @param {MouseEvent} e */
          const onClick = (e) => {
            if (submittedScore) return;
            if (submitBtn && submitBtn.dataset && submitBtn.dataset.cooldown === "1") return;
            e.preventDefault();
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
              // After successful submit, render leaderboard and transition to Game Over overlay.
              if (lbEl) LeaderboardManager.render(lbEl);
            } catch (_e) {
              /* ignore */
            }
            try {
              hideInitialsUI();
            } catch (_e) {
              /* ignore */
            }
            try {
              // If we have a standalone initials screen, hide it and then show game over overlay.
              if (initialsScreen) initialsScreen.classList.add("hidden");
              if (gameOverScreen) gameOverScreen.classList.remove("hidden");
            } catch (_e) {
              /* ignore */
            }
            try {
              UIManager.recenterLeaderboard();
            } catch (_) {
              /* ignore */
            }
            try {
              UIManager.focusWithRetry(this.restartBtn);
            } catch (_e) {
              /* ignore */
            }
          };
          submitBtn.addEventListener("click", onClick);
          try {
            submitBtn.addEventListener("pointerdown", (ev) => {
              if (submittedScore) return;
              if (submitBtn && submitBtn.dataset && submitBtn.dataset.cooldown === "1") return;
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

          /** @param {KeyboardEvent} ev */
          const onKey = (ev) => {
            if (ev.key === "Enter") {
              ev.preventDefault();
              if (submitBtn && submitBtn.dataset && submitBtn.dataset.cooldown === "1") {
                return;
              }
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
              try {
                hideInitialsUI();
              } catch (_e) {
                /* ignore */
              }
              try {
                if (initialsScreen) initialsScreen.classList.add("hidden");
                if (gameOverScreen) gameOverScreen.classList.remove("hidden");
              } catch (_e) {
                /* ignore */
              }
              try {
                UIManager.recenterLeaderboard();
              } catch (_) {
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
          /** @param {FocusEvent} ev */
          onFocusOut = (ev) => {
            try {
              const related = /** @type {HTMLElement|null} */ (
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
              if (!movedToSubmit && !movedToInitials) {
                try {
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
          submitBtn.addEventListener("click", () => {
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

    try {
      const lbEl = this.leaderboardListEl || document.getElementById("leaderboardList");
      if (lbEl) LeaderboardManager.render(lbEl);
    } catch (_e) {
      /* ignore */
    }

    let allowInitials = undefined;
    UIManager.showGameOver(
      this.gameOverScreen,
      this.restartBtn,
      this.finalScoreEl,
      this.score,
      submittedScore,
      undefined
    );

    try {
      setTimeout(() => {
        this._suppressFullResetOnResize = false;
      }, 0);
    } catch (_e) {
      this._suppressFullResetOnResize = false;
    }
    if (this.loop) {
      this.loop.stop();
      this._loopRunning = false;
    }
  }

  /**
   * Capture-phase click handler to swallow the first unintended click after game over
   * if the guard is active. Prevents accidental activation of restart/submit buttons.
   * @param {MouseEvent} e
   */
  handleGuardClick(e) {
    if (!this._uiTouchGuardActive) return;
    try {
      e.preventDefault();
      e.stopImmediatePropagation();
    } catch (_e) {
      /* ignore */
    }
    this._uiTouchGuardActive = false;
    if (this._uiTouchGuardTimeout) {
      clearTimeout(this._uiTouchGuardTimeout);
      this._uiTouchGuardTimeout = null;
    }
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
    if (
      this.nebulaConfigs &&
      this.state &&
      typeof this.state.isRunning === "function" &&
      this.state.isRunning()
    ) {
      Nebula.update(
        this.view.width,
        this.view.height,
        this.nebulaConfigs,
        this._isMobile || this._isLowPowerMode,
        dtSec
      );
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

    try {
      if (this.state.isRunning()) {
        this.timerRemaining -= dtSec;
        if (this.timerRemaining <= 0) {
          this.timerRemaining = 0;
          UIManager.setTimer(this.timerEl, this.timerRemaining);
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
    const particleCount = Math.max(
      0,
      Math.round(CONFIG.EXPLOSION.PARTICLE_COUNT * this._performanceParticleMultiplier)
    );
    for (let i = 0; i < particleCount; i++) {
      if (this.particles.length >= this._particleBudget) break;
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
      this.bulletPool.warmUp(64, 0, 0, CONFIG.BULLET.WIDTH, CONFIG.BULLET.HEIGHT, this.bulletSpeed);

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

      const sSize = CONFIG.STAR.MIN_SIZE + CONFIG.STAR.SIZE_VARIATION * 0.5;
      this.starPool.warmUp(32, 0, CONFIG.STAR.SPAWN_Y, sSize, sSize, this.starSpeed, false);

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
      /* intentionally empty */
    }
  }

  /**
   * Apply the performance profile associated with the provided level.
   * @param {number} level
   * @param {{ reinitialize?: boolean, force?: boolean, initial?: boolean, averageFrameMs?: number }} [meta]
   */
  _applyPerformanceProfile(level, meta = {}) {
    const prevLevel = this._performanceLevel;
    const shouldForce = meta.force === true || meta.initial === true;
    if (!shouldForce && level === prevLevel) {
      return;
    }

    const perf = CONFIG.PERFORMANCE || {};
    const defaults = {
      dprMax: CONFIG.VIEW.DPR_MAX,
      starfieldScale: 1,
      spawnRateScale: 1,
      particleMultiplier: 1,
      particleBudget: Number.POSITIVE_INFINITY,
      engineTrailModulo: 1,
    };
    /** @type {any} */
    const levels = Array.isArray(perf.LEVELS) ? perf.LEVELS : [];
    const idx = Math.max(0, Math.min(level - 1, levels.length - 1));
    const profile = level > 0 && levels.length > 0 ? { ...defaults, ...levels[idx] } : defaults;

    const minStarfieldScale = Math.max(0, perf.MIN_STARFIELD_SCALE || 0.35);

    this._performanceLevel = level;
    this._starfieldScale = Math.max(minStarfieldScale, Math.min(1, profile.starfieldScale || 1));
    this._spawnRateScale = Math.max(0.35, Math.min(1, profile.spawnRateScale || 1));
    this._performanceParticleMultiplier = Math.max(
      0.1,
      Math.min(1, profile.particleMultiplier || 1)
    );
    this._particleBudget = Number.isFinite(profile.particleBudget)
      ? Math.max(200, profile.particleBudget)
      : Number.POSITIVE_INFINITY;
    const overrideDpr = typeof profile.dprMax === "number" ? Math.max(0.75, profile.dprMax) : null;
    this._dprOverride = level > 0 ? overrideDpr : null;
    this._engineTrailModulo = Math.max(1, Math.round(profile.engineTrailModulo || 1));
    this._isLowPowerMode = level > 0;
    this._engineTrailStep = 0;

    if (this.particles && this.particlePool && this.particles.length > this._particleBudget) {
      const excess = this.particles.splice(this._particleBudget);
      for (const particle of excess) {
        this.particlePool.release(particle);
      }
    }

    if (meta.reinitialize !== false) {
      try {
        this.resizeCanvas();
      } catch (_e) {
        /* ignore resize failures */
      }
      try {
        this.initBackground();
      } catch (_e) {
        /* ignore background refresh errors */
      }
    }

    if (level !== prevLevel && typeof console !== "undefined" && console.info) {
      const avg = typeof meta.averageFrameMs === "number" ? meta.averageFrameMs.toFixed(1) : null;
      const suffix = avg ? ` (avg ${avg}ms)` : "";
      console.info(`[Performance] Adjusted to level ${level}${suffix}`);
    }
  }

  /**
   * Draw all game objects and background for the current frame.
   */
  draw(frameDtMs = CONFIG.TIME.STEP_MS) {
    const shouldTrack = !!(
      this.state &&
      typeof this.state.isRunning === "function" &&
      this.state.isRunning() &&
      !(typeof this.state.isPaused === "function" && this.state.isPaused())
    );
    if (this.performanceMonitor) {
      const maxSample = CONFIG.TIME.STEP_MS * CONFIG.TIME.MAX_SUB_STEPS * 1.5;
      const safeFrame = Math.min(frameDtMs, maxSample || frameDtMs || CONFIG.TIME.STEP_MS);
      this.performanceMonitor.sample(safeFrame, { active: shouldTrack });
    }

    if (this.state.isPaused()) {
      if (!this._pausedFrameRendered) {
        this.drawFrame();
        this._pausedFrameRendered = true;
      }
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

  /**
   * Init the background.
   */
  initBackground() {
    const ctx = getGameContext(this);
    ctx.starfieldScale = this._starfieldScale;
    ctx.isLowPower = this._isLowPowerMode;
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has(CONFIG.RNG.SEED_PARAM)) {
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
      ctx.rng = new RNG();
    }
    const { nebulaConfigs, starField } = BackgroundManager.init(ctx);
    if (nebulaConfigs) this.nebulaConfigs = nebulaConfigs;
    this.starField = starField;
  }

  /**
   * Draw the background.
   */
  drawBackground() {
    BackgroundManager.draw(getGameContext(this));
  }
}

export { AIHorizon };
export { AIHorizon as DarkHorizon };

window.addEventListener(
  "load",
  () => {
    try {
      AIHorizon.getInstance();
    } catch (_e) {
      /* intentionally empty */
    }
  },
  { once: true }
);
