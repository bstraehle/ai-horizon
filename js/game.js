/**
 * AI Horizon - Main game module.
 *
 * Core responsibilities:
 *  - Bootstraps canvas (HIDPI), input, state machine, managers & object pools
 *  - Owns primary entity collections (asteroids, bullets, particles, stars, explosions)
 *  - Orchestrates fixed-step updates & rendering through `GameLoop`
 *  - Seeds & exposes deterministic RNG (query param: `?seed=VALUE`)
 *  - Handles lifecycle: start, pause/resume, game over, full & soft resets
 *  - Wires cross-cutting event handlers (see `systems/EventHandlers.js`)
 *
 * Design highlights:
 *  - Object pools pre-warmed to avoid first-interaction jank
 *  - Mobile / desktop adaptive configuration & soft reinit on platform change
 *  - Performance tiers auto-applied via `PerformanceMonitor`
 */

// @ts-nocheck

import { CONFIG } from "./constants.js";

import { GameLoop } from "./core/GameLoop.js";
import { getGameContext } from "./core/GameContext.js";
import { InputState } from "./core/InputState.js";

import { Asteroid } from "./entities/Asteroid.js";
import { Bullet } from "./entities/Bullet.js";
import { EngineTrail } from "./entities/EngineTrail.js";
import { Explosion } from "./entities/Explosion.js";
import { Particle } from "./entities/Particle.js";
import { Player } from "./entities/Player.js";
import { Star } from "./entities/Star.js";

import { BackgroundManager } from "./managers/BackgroundManager.js";
import { InputBindings } from "./ui/InputBindings.js";
import { GameFactories } from "./ui/GameFactories.js";
import { SpriteManager } from "./managers/SpriteManager.js";
import { UIManager } from "./managers/UIManager.js";
import { GameUI } from "./ui/GameUI.js";
import { handleGameOver } from "./ui/GameOver.js";
import { LeaderboardManager } from "./managers/LeaderboardManager.js";
import { AIAnalysisManager } from "./managers/AIAnalysisManager.js";
import { ViewManager } from "./managers/ViewManager.js";
import { ScoringManager } from "./managers/ScoringManager.js";

import { ObjectPool } from "./utils/ObjectPool.js";
import { RateLimiter } from "./utils/RateLimiter.js";
import { RNG } from "./utils/RNG.js";
import { EventBus } from "./core/EventBus.js";
import { GameStateMachine } from "./core/GameStateMachine.js";
import { EventHandlers } from "./systems/EventHandlers.js";
import { PerformanceMonitor } from "./core/PerformanceMonitor.js";
import { applyPerformanceProfile } from "./ui/PerformanceProfiles.js";
import { warmUpPools } from "./ui/PoolWarmup.js";
import { updateGame } from "./systems/GameUpdate.js";
import { drawGame, drawFrame } from "./systems/GameRender.js";
import { initBackgroundLifecycle, drawBackgroundLifecycle } from "./systems/BackgroundLifecycle.js";
import { softReinitForPlatformChange as platformSoftReinit } from "./systems/PlatformLifecycle.js";
import {
  fullReset as resetFull,
  resetGameState as resetState,
  releaseAllDynamic as releaseAllDyn,
  resetCoreRuntimeState as resetCoreState,
} from "./systems/ResetLifecycle.js";
/** @typedef {import('./types.js').GameState} GameState */

/**
 * Main game class orchestrating simulation & rendering.
 * @implements {Partial<GameState>}
 *
 * Lifecycle states are governed by `GameStateMachine` (running, paused, game over, etc.).
 * Public API surface (selected):
 *  - startGame(), togglePause(), gameOver(), fullReset()
 *  - update(dt), draw(dt), drawFrame()
 *  - createScorePopup(x,y,score,opts)
 *
 * Entity & resource pools are exposed as properties for systems modules.
 * Most mutation is funneled through small facade helpers in `systems/` & `ui/` for cohesion.
 */
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
    this.leaderboardScreen = /** @type {HTMLElement} */ (
      document.getElementById("leaderboardScreen")
    );
    this.gameOverScreen = /** @type {HTMLElement} */ (document.getElementById("gameOverScreen"));
    this.pauseScreen = /** @type {HTMLElement} */ (document.getElementById("pauseScreen"));
    this.startBtn = /** @type {HTMLButtonElement} */ (document.getElementById("startBtn"));
    this.restartBtn = /** @type {HTMLButtonElement} */ (document.getElementById("restartBtn"));
    this.okBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById("okBtn"));
    this.highScoreEl = /** @type {HTMLElement} */ (document.getElementById("highScore"));
    this.highScoreBox = /** @type {HTMLElement|null} */ (document.getElementById("highScoreBox"));
    this.currentScoreEl = /** @type {HTMLElement} */ (document.getElementById("currentScore"));
    this.currentScoreBox = /** @type {HTMLElement|null} */ (
      document.getElementById("currentScoreBox")
    );
    this.timerEl = /** @type {HTMLElement|null} */ (document.getElementById("timer"));
    this.timerBox = /** @type {HTMLElement|null} */ (document.getElementById("timerBox"));
    this.leaderboardListEl = /** @type {HTMLElement} */ (
      document.getElementById("leaderboardList")
    );

    this.highScore = 0;
    this.score = 0;
    this.shotsFired = 0;
    this.asteroidsKilled = 0;
    this.hardenedAsteroidsKilled = 0;
    this.hardenedAsteroidHitBullets = 0;
    this.bonusAsteroidsKilled = 0;
    this.bonusAsteroidHitBullets = 0;
    this.starsCollected = 0;
    this.bonusStarsCollected = 0;
    this.starsSpawned = 0;
    this.bonusStarsSpawned = 0;
    this.asteroidsSpawned = 0;
    this.bonusAsteroidsSpawned = 0;
    this.hardenedAsteroidsSpawned = 0;
    this.accuracy = 0;
    this.accuracyBonus = 0;
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
    this._mouseDown = false;
    /** @type {any|null} */
    this._lastRunSummary = null;
    /** @type {any|null} */
    this._lastAIAnalysis = null;

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
    this.drawBackground({ suppressNebula: true });

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
      (x, y, w, h, speed, rng, isHardened = false, paletteOverride = null) =>
        new Asteroid(x, y, w, h, speed, rng, isHardened, paletteOverride),
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

    /** @param {number} x @param {number} y */
    this.createExplosion = (x, y) => {
      try {
        GameFactories.createExplosion(this, x, y);
      } catch (_e) {
        /* ignore */
      }
    };

    const perfConfig = CONFIG.PERFORMANCE || {};
    this.performanceMonitor = new PerformanceMonitor({
      levels: Array.isArray(perfConfig.LEVELS) ? perfConfig.LEVELS : undefined,
      sampleWindow: perfConfig.SAMPLE_WINDOW,
      cooldownFrames: perfConfig.COOLDOWN_FRAMES,
      onLevelChange: (level, meta) => applyPerformanceProfile(this, level, meta),
    });
    applyPerformanceProfile(this, this._performanceLevel, { reinitialize: false, initial: true });

    warmUpPools(this);

    InputBindings.bind(this);
    InputBindings.setup(this);
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
    LeaderboardManager.detectRemote({ timeoutMs: 1200 })
      .then((isRemote) => {
        LeaderboardManager.IS_REMOTE = !!isRemote;
        AIAnalysisManager.IS_REMOTE = !!isRemote;
        try {
          const boxes = [
            this.highScoreBox || document.getElementById("highScoreBox"),
            this.currentScoreBox || document.getElementById("currentScoreBox"),
            this.timerBox || document.getElementById("timerBox"),
          ];
          for (const box of boxes) {
            if (!box) continue;
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
        try {
          LeaderboardManager.IS_REMOTE = false;
          AIAnalysisManager.IS_REMOTE = false;
          try {
            const boxes = [
              this.highScoreBox || document.getElementById("highScoreBox"),
              this.currentScoreBox || document.getElementById("currentScoreBox"),
              this.timerBox || document.getElementById("timerBox"),
            ];
            for (const box of boxes) {
              if (!box) continue;
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

    this._frameMetrics = null;
    this.loop = new GameLoop({
      update: (dtMs, dtSec) => {
        this.timeMs += dtMs;
        this.timeSec += dtSec;
        this._lastDtSec = dtSec;
        this.update(dtSec);
      },
      draw: (frameDtMs, metrics) => {
        if (metrics) this._frameMetrics = metrics;
        this.draw(frameDtMs);
      },
      shouldUpdate: () => this.state.isRunning(),
      stepMs: CONFIG.TIME.STEP_MS,
      maxSubSteps: CONFIG.TIME.MAX_SUB_STEPS,
      onMetrics: (m) => {
        try {
          this.performanceMonitor.sample(m.frameDt, { active: this.state.isRunning() });
        } catch (_e) {
          /* ignore */
        }
      },
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

  /** Reset helpers delegated (see systems/ResetLifecycle). */
  _releaseAllDynamic() {
    releaseAllDyn(this);
  }

  /**
   * Reset score, timer, scoreboard UI, fire limiter, input state & dynamic collections.
   * (Time counters & performance monitor resets are handled by fullReset separately.)
   */
  _resetCoreRuntimeState() {
    resetCoreState(this);
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
      glowColor: o.glowColor || "#fff",
      glowBlur: typeof o.glowBlur === "number" ? o.glowBlur : 8,
      stroke: o.stroke || null,
    });
  }
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
    try {
      const initialsScreen = /** @type {HTMLElement|null} */ (
        document.getElementById("initialsScreen")
      );
      const gameOverVisible = !!(
        this.leaderboardScreen && !this.leaderboardScreen.classList.contains("hidden")
      );
      const startVisible = !!(this.gameInfo && !this.gameInfo.classList.contains("hidden"));
      const postGameVisible = !!(
        this.gameOverScreen && !this.gameOverScreen.classList.contains("hidden")
      );
      const initialsVisible = !!(initialsScreen && !initialsScreen.classList.contains("hidden"));
      if (gameOverVisible || postGameVisible || initialsVisible || startVisible) return false;
    } catch (_) {
      /* ignore */
    }
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
    UIManager.handleGameOverFocusGuard(
      e,
      this.leaderboardScreen,
      this.restartBtn,
      this.gameOverScreen,
      this.okBtn
    );
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
      this.leaderboardScreen,
      this.restartBtn,
      this.gameOverScreen,
      this.okBtn
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
    if (
      document.activeElement === this.startBtn ||
      document.activeElement === this.restartBtn ||
      document.activeElement === this.okBtn
    )
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

  /** Begin continuous fire (mouse). */
  handleMouseDown() {
    if (!this.state.isRunning()) return;
    this._mouseDown = true;
    this.input.fireHeld = true;
    this.shoot();
  }

  /** End continuous fire (mouse). */
  handleMouseUp() {
    this._mouseDown = false;
    this.input.fireHeld = false;
  }

  /** Cancel continuous fire if pointer leaves canvas. */
  handleMouseLeave() {
    if (this._mouseDown) return;
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
    if (this.restartBtn && this.restartBtn.dataset && this.restartBtn.dataset.cooldown === "1")
      return;

    try {
      const postGameMessage = /** @type {HTMLElement|null} */ (
        document.getElementById("postGameMessage")
      );
      if (postGameMessage) {
        postGameMessage.textContent = "";
      }
    } catch (_) {
      /* ignore */
    }

    GameUI.hideGameOver(this);
    this.startGame();
    try {
      this.startBtn.focus();
    } catch (_) {
      /* intentionally ignored: focus may fail if button not yet in DOM or not focusable */
    }
  }

  /** Dismiss the post-game overlay and return focus to restart. */
  handlePostGameOkClick() {
    /** @type {HTMLElement|null} */
    let initialsScreen = null;
    /** @type {HTMLElement|null} */
    let initialsInput = null;
    try {
      initialsScreen = /** @type {HTMLElement|null} */ (document.getElementById("initialsScreen"));
      initialsInput = /** @type {HTMLElement|null} */ (document.getElementById("initialsInput"));
    } catch (_) {
      initialsScreen = null;
      initialsInput = null;
    }

    const outcome = UIManager.advancePostGameFlow({
      postGameScreen: this.gameOverScreen || null,
      initialsScreen,
      leaderboardScreen: this.leaderboardScreen || null,
      initialsInput,
      restartBtn: this.restartBtn || null,
    });

    try {
      if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
        window.dispatchEvent(
          new CustomEvent("postGame:ok", {
            bubbles: true,
            detail: { skipUiAdvance: true, outcome },
          })
        );
      }
    } catch (_) {
      /* ignore */
    }

    if (outcome === "initials") return;
    GameUI.focusRestart(this);
  }

  /** Keyboard accessibility for post-game OK button: block Space, allow Enter via native click. */
  handlePostGameOkKeyDown(e) {
    if (e.code === "Space" || e.key === " ") {
      e.preventDefault();
      return;
    }
  }

  /**
   * Keyboard accessibility for start button.
   * @param {KeyboardEvent} e - The keyboard event.
   */
  handleStartKeyDown(e) {
    if (e.code === "Space" || e.key === " ") {
      e.preventDefault();
      return;
    }
    if (e.code === "Escape" || e.key === "Escape" || e.key === "Esc") {
      e.preventDefault();
      return;
    }
  }

  /**
   * Keyboard accessibility for restart button.
   * @param {KeyboardEvent} e - The keyboard event.
   */
  handleRestartKeyDown(e) {
    if (e.code === "Space" || e.key === " ") {
      e.preventDefault();
      return;
    }
    if (e.code === "Escape" || e.key === "Escape" || e.key === "Esc") {
      e.preventDefault();
      return;
    }
  }

  /**
   * Fire a bullet if cooldown allows.
   */
  shoot() {
    if (!this.state.isRunning()) return;
    this.fireLimiter.try(() => {
      this.bullets.push(GameFactories.createBullet(this));
      this.shotsFired = (this.shotsFired || 0) + 1;
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
        this.drawBackground({ suppressNebula: true });
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
    platformSoftReinit(this, nowMobile);
  }

  /**
   * Fully reset the game to initial (menu) state while preserving persistent data such
   * as the saved high score. Useful to reinitialize after platform or layout changes.
   * This clears dynamic entities, resets timers, resets spawn counters and pools,
   * and re-evaluates platform-dependent parameters.
   */
  // fullReset implementation delegated to systems/ResetLifecycle.js (resetFull)

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
    GameUI.hideGameInfo(this);
    this.state.start();
    this.initBackground();
    this.loop.start();
    this._loopRunning = true;
  }

  /**
   * Reset score and clear dynamic entity arrays.
   */
  resetGameState(forceNebula = false) {
    resetState(this, forceNebula);
  }

  /**
   * Toggle pause state.
   */
  togglePause() {
    if (this.state.isPaused()) {
      this.state.resume();
      GameUI.hidePause(this);
    } else if (this.state.isRunning()) {
      this.state.pause();
      GameUI.showPause(this);
    }
    this._pausedFrameRendered = false;
  }

  /**
   * End the game.
   */
  gameOver() {
    /** @type {{ applied:boolean, baseScore:number, accuracy:number, bonus:number, newScore:number }|null} */
    let accuracySummary = null;
    try {
      if (this.input && this.input.fireHeld) {
        this._uiTouchGuardActive = true;
        if (this._uiTouchGuardTimeout) clearTimeout(this._uiTouchGuardTimeout);
        this._uiTouchGuardTimeout = setTimeout(() => {
          this._uiTouchGuardActive = false;
        }, 0);
      }
    } catch {
      /* ignore */
    }
    try {
      if (ScoringManager && typeof ScoringManager.applyAccuracyBonus === "function") {
        accuracySummary = ScoringManager.applyAccuracyBonus(this);
        try {
          this.updateScore();
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* optional bonus application */
    }
    this.state.end();
    this.updateHighScore();
    GameUI.hidePause(this);
    try {
      this._lastRunSummary = this._logRunSummary(accuracySummary);
    } catch (_e) {
      this._lastRunSummary = null;
    }
    handleGameOver(this);
    if (this.loop) {
      this.loop.stop();
      this._loopRunning = false;
    }
  }

  /**
   * Build an aggregated run summary for downstream AI/analytics.
   * Instead of logging, this returns the JSON-friendly object so callers can send it.
   * @param {{ applied:boolean, baseScore:number, accuracy:number, bonus:number, newScore:number }|null} accuracySummary
   * @returns {any}
   * @private
   */
  _logRunSummary(accuracySummary) {
    let shotsFiredAccuracy = 0;
    const scoreSummary = (() => {
      if (!accuracySummary) return null;
      const {
        applied: _applied,
        newScore,
        accuracy: rawAccuracy,
        baseScore = null,
        bonus = null,
        ...rest
      } = accuracySummary;
      const roundedAccuracy =
        typeof rawAccuracy === "number"
          ? Math.max(0, Math.min(1, Math.round(rawAccuracy * 100) / 100))
          : 0;
      shotsFiredAccuracy = roundedAccuracy;
      const finalScoreNormalized = typeof newScore === "number" ? newScore : (newScore ?? null);
      const highScoreValue = Number.isFinite(this.highScore) ? this.highScore : null;

      let lowScoreValue = null;
      try {
        const cachedEntries = LeaderboardManager.getCached();
        if (Array.isArray(cachedEntries) && cachedEntries.length > 0) {
          const lastEntry = cachedEntries[cachedEntries.length - 1];
          if (lastEntry && typeof lastEntry.score === "number") {
            lowScoreValue = lastEntry.score;
          }
        }
      } catch (_e) {
        /* ignore */
      }

      const differencePlayerFinalScoreToLeaderBoardHighScore =
        typeof highScoreValue === "number" && typeof finalScoreNormalized === "number"
          ? highScoreValue - finalScoreNormalized
          : null;
      const differencePlayerFinalScoreToLeaderBoardLowScore =
        typeof lowScoreValue === "number" && typeof finalScoreNormalized === "number"
          ? lowScoreValue - finalScoreNormalized
          : null;

      return {
        playerBaseScore: baseScore,
        playerBonusEarned: bonus,
        playerFinalScore: finalScoreNormalized,
        leaderBoardHighScore: highScoreValue,
        leaderBoardLowScore: lowScoreValue,
        differencePlayerFinalScoreToLeaderBoardHighScore,
        differencePlayerFinalScoreToLeaderBoardLowScore,
        ...rest,
      };
    })();
    const timerInitialRaw = Number.isFinite(this.timerSeconds) ? this.timerSeconds : null;
    const timerRemainingRaw = Number.isFinite(this.timerRemaining) ? this.timerRemaining : null;
    /**
     * @param {number|null} value
     * @param {"round"|"floor"} mode
     */
    const toSeconds = (value, mode = "round") => {
      if (!Number.isFinite(value)) return null;
      if (mode === "floor") return Math.max(0, Math.floor(/** @type {number} */ (value)));
      return Math.max(0, Math.round(/** @type {number} */ (value)));
    };
    let runtimeSeconds = Number.isFinite(this.timeSec) ? this.timeSec : null;
    const totalSecondsInt = toSeconds(timerInitialRaw, "round");
    const remainingSecondsInt = toSeconds(timerRemainingRaw, "floor");
    let runtimeSecondsInt = null;
    if (typeof totalSecondsInt === "number" && typeof remainingSecondsInt === "number") {
      runtimeSecondsInt = Math.max(0, totalSecondsInt - remainingSecondsInt);
    } else if (Number.isFinite(runtimeSeconds)) {
      runtimeSecondsInt = toSeconds(runtimeSeconds, "round");
    }
    /**
     * @param {number|null|undefined} numerator
     * @param {number|null|undefined} denominator
     */
    const ratioOrNull = (numerator, denominator) => {
      if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0)
        return 0;
      const clamped = Math.max(0, Math.min(1, numerator / denominator));
      return Math.round(clamped * 100) / 100;
    };
    const starsCollectedAccuracy = ratioOrNull(this.starsCollected, this.starsSpawned);
    const bonusStarsCollectedAccuracy = ratioOrNull(
      this.bonusStarsCollected,
      this.bonusStarsSpawned
    );
    const asteroidsKilledAccuracy = ratioOrNull(this.asteroidsKilled, this.asteroidsSpawned);
    const hardenedAsteroidsKilledAccuracy = ratioOrNull(
      this.hardenedAsteroidsKilled,
      this.hardenedAsteroidsSpawned
    );
    const bonusAsteroidsKilledAccuracy = ratioOrNull(
      this.bonusAsteroidsKilled,
      this.bonusAsteroidsSpawned
    );
    const summary = {
      timestamp: (() => {
        try {
          return new Date().toISOString();
        } catch (_e) {
          return null;
        }
      })(),
      timer: {
        totalSeconds: totalSecondsInt,
        survivedSeconds: runtimeSecondsInt,
        toPlaySeconds: remainingSecondsInt,
      },
      score: scoreSummary,
      stats: {
        starsSpawned: typeof this.starsSpawned === "number" ? this.starsSpawned : null,
        starsCollected: typeof this.starsCollected === "number" ? this.starsCollected : null,
        starsCollectedAccuracy: starsCollectedAccuracy,
        bonusStarsSpawned:
          typeof this.bonusStarsSpawned === "number" ? this.bonusStarsSpawned : null,
        bonusStarsCollected:
          typeof this.bonusStarsCollected === "number" ? this.bonusStarsCollected : null,
        bonusStarsCollectedAccuracy: bonusStarsCollectedAccuracy,
        asteroidsSpawned: typeof this.asteroidsSpawned === "number" ? this.asteroidsSpawned : null,
        asteroidsKilled: typeof this.asteroidsKilled === "number" ? this.asteroidsKilled : null,
        asteroidsKilledAccuracy: asteroidsKilledAccuracy,
        hardenedAsteroidsSpawned:
          typeof this.hardenedAsteroidsSpawned === "number" ? this.hardenedAsteroidsSpawned : null,
        hardenedAsteroidsKilled:
          typeof this.hardenedAsteroidsKilled === "number" ? this.hardenedAsteroidsKilled : null,
        hardenedAsteroidsKilledAccuracy: hardenedAsteroidsKilledAccuracy,
        bonusAsteroidsSpawned:
          typeof this.bonusAsteroidsSpawned === "number" ? this.bonusAsteroidsSpawned : null,
        bonusAsteroidsKilled:
          typeof this.bonusAsteroidsKilled === "number" ? this.bonusAsteroidsKilled : null,
        bonusAsteroidsKilledAccuracy: bonusAsteroidsKilledAccuracy,
        hardenedAsteroidHitBullets:
          typeof this.hardenedAsteroidHitBullets === "number"
            ? this.hardenedAsteroidHitBullets
            : null,
        bonusAsteroidHitBullets:
          typeof this.bonusAsteroidHitBullets === "number" ? this.bonusAsteroidHitBullets : null,
        shotsFired: typeof this.shotsFired === "number" ? this.shotsFired : null,
        shotsFiredOnTarget:
          (typeof this.asteroidsKilled === "number" ? this.asteroidsKilled : 0) +
          (typeof this.hardenedAsteroidHitBullets === "number"
            ? this.hardenedAsteroidHitBullets
            : 0),
        shotsFiredAccuracy: shotsFiredAccuracy,
      },
      device: (() => {
        try {
          const ua = typeof navigator !== "undefined" ? navigator.userAgent : null;
          const width = typeof window !== "undefined" ? window.innerWidth : null;
          const height = typeof window !== "undefined" ? window.innerHeight : null;
          const locale =
            typeof navigator !== "undefined" && navigator.language ? navigator.language : null;
          const timeZone =
            typeof Intl !== "undefined" && Intl.DateTimeFormat
              ? new Intl.DateTimeFormat().resolvedOptions().timeZone || null
              : null;
          const platform = typeof navigator !== "undefined" ? navigator.platform : null;
          return { userAgent: ua, width, height, locale, timeZone, platform };
        } catch (_e) {
          return {
            userAgent: null,
            width: null,
            height: null,
            locale: null,
            timeZone: null,
            platform: null,
          };
        }
      })(),
    };
    return summary;
  }

  /**
   * Capture-phase click handler to swallow the first unintended click after game over
   * if the guard is active. Prevents accidental activation of restart/submit buttons.
   * @param {MouseEvent} e
   */
  handleGuardClick(e) {
    if (!this._uiTouchGuardActive) return;
    try {
      // If the click originates inside the post-game or initials overlays
      // (for example the Ok button or the initials submit), allow it to
      // proceed and simply clear the guard — don't swallow user intent.
      const t = e && /** @type {any} */ (e.target);
      try {
        if (
          t &&
          typeof t.closest === "function" &&
          (t.closest("#gameOverScreen") ||
            t.closest("#initialsScreen") ||
            t.closest("#okBtn") ||
            t.closest("#submitScoreBtn"))
        ) {
          this._uiTouchGuardActive = false;
          if (this._uiTouchGuardTimeout) {
            clearTimeout(this._uiTouchGuardTimeout);
            this._uiTouchGuardTimeout = null;
          }
          return;
        }
      } catch (_inner) {
        /* ignore */
      }
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

  /** Fully reset the game to menu state. */
  fullReset() {
    resetFull(this);
  }

  /** Update the on-screen score display. */
  updateScore() {
    GameUI.setScore(this);
  }
  /** Recalculate and persist high score if exceeded. */
  updateHighScore() {
    this.highScore = LeaderboardManager.setHighScore(this.score, this.highScore, this.highScoreEl);
  }

  /** Update all game objects and advance simulation for one tick. */
  update(dtSec = CONFIG.TIME.DEFAULT_DT) {
    updateGame(this, dtSec);
  }

  /**
   * Draw all game objects and background for the current frame.
   */
  draw(frameDtMs = CONFIG.TIME.STEP_MS) {
    drawGame(this, frameDtMs);
  }
  drawFrame() {
    drawFrame(this);
  }

  /**
   * Init the background.
   */
  initBackground() {
    initBackgroundLifecycle(this);
  }

  /**
   * Draw the background.
   */
  drawBackground(options) {
    drawBackgroundLifecycle(this, options);
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
