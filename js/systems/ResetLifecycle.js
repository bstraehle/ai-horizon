// @ts-nocheck
import { BackgroundManager } from "../managers/BackgroundManager.js";
import { SpawnManager } from "../managers/SpawnManager.js";
import { UIManager } from "../managers/UIManager.js";
import { FocusManager } from "../managers/FocusManager.js";
import { GameStateMachine } from "../core/GameStateMachine.js";
import { EventHandlers } from "../systems/EventHandlers.js";
import { SpriteManager } from "../managers/SpriteManager.js";
import { CONFIG } from "../constants.js";
import { InputState } from "../core/InputState.js";
import { warmUpPools } from "../ui/PoolWarmup.js";
/** @typedef {import('../game.js').AIHorizon} AIHorizon */

function releaseAll(arr, pool) {
  if (!arr || !pool) return;
  for (const it of arr) {
    try {
      pool.release(it);
    } catch {
      /* ignore */
    }
  }
}

export function releaseAllDynamic(game) {
  releaseAll(game.asteroids, game.asteroidPool);
  releaseAll(game.bullets, game.bulletPool);
  releaseAll(game.explosions, game.explosionPool);
  releaseAll(game.particles, game.particlePool);
  releaseAll(game.stars, game.starPool);
}

export function resetCoreRuntimeState(game) {
  game.score = 0;
  game.shotsFired = 0;
  game.regularAsteroidsKilled = 0;
  game.hardenedAsteroidsKilled = 0;
  game.hardenedAsteroidHitBullets = 0;
  game.bonusAsteroidsKilled = 0;
  game.bonusAsteroidHitBullets = 0;
  game.regularStarsCollected = 0;
  game.bonusStarsCollected = 0;
  game.regularStarsSpawned = 0;
  game.bonusStarsSpawned = 0;
  game.regularAsteroidsSpawned = 0;
  game.bonusAsteroidsSpawned = 0;
  game.hardenedAsteroidsSpawned = 0;
  game.accuracy = 0;
  game.accuracyBonus = 0;
  game.finaleBaseScore = 0;
  game.finaleBonus = 0;
  game._accuracyBonusApplied = false;
  game.updateScore();
  game.timerRemaining = game.timerSeconds;
  try {
    UIManager.setTimer(game.timerEl, game.timerRemaining);
  } catch {
    /* ignore */
  }
  game.asteroids = [];
  game.bullets = [];
  game.explosions = [];
  game.particles = [];
  game.stars = [];
  game.scorePopups = [];
  game.fireLimiter.reset();
  game.input = new InputState();
}

export function resetGameState(game, forceNebula = false) {
  releaseAllDynamic(game);
  resetCoreRuntimeState(game);
  SpawnManager.reset(game);
  if (forceNebula) game.nebulaConfigs = undefined;
}

export function fullReset(game) {
  if (game.loop) {
    try {
      game.loop.stop();
    } catch {
      /* ignore */
    }
    game._loopRunning = false;
  }
  if (game.performanceMonitor) {
    try {
      game.performanceMonitor.reset(game._performanceLevel);
    } catch {
      /* ignore */
    }
  }
  game._engineTrailStep = 0;
  releaseAllDynamic(game);
  resetCoreRuntimeState(game);
  game.timeMs = 0;
  game.timeSec = 0;
  SpawnManager.reset(game);

  game._isMobile = game.isMobile();
  game.asteroidSpeed = game._isMobile
    ? CONFIG.SPEEDS.ASTEROID_MOBILE
    : CONFIG.SPEEDS.ASTEROID_DESKTOP;
  game.starSpeed = CONFIG.SPEEDS.STAR;

  // Rewarm pools to ensure smooth first frame after reset.
  try {
    warmUpPools(game);
  } catch {
    /* ignore */
  }

  try {
    if ((game.sprites = SpriteManager.createSprites())) void 0;
  } catch {
    /* ignore */
  }
  try {
    game.initBackground();
  } catch {
    /* ignore */
  }
  try {
    game.drawBackground({ suppressNebula: true });
  } catch {
    /* ignore */
  }

  try {
    UIManager.hideGameOver(game.leaderboardScreen, game.gameOverScreen || null);
    UIManager.hidePause(game.pauseScreen);
    if (game.gameInfo && game.gameInfo.classList.contains("hidden")) {
      game.gameInfo.classList.remove("hidden");
    }
  } catch {
    /* ignore */
  }

  try {
    const bg = BackgroundManager.init({
      view: game.view,
      running: false,
      isMobile: game._isMobile,
      rng: game.rng,
    });
    if (bg && bg.nebulaConfigs) game.nebulaConfigs = bg.nebulaConfigs;
    game.starField = bg && bg.starField ? bg.starField : game.starField;
  } catch {
    /* ignore */
  }

  try {
    UIManager.focusWithRetry(game.startBtn);
    try {
      FocusManager.lock(/** @type {HTMLElement|null} */ (game.startBtn || null), {
        scope: /** @type {HTMLElement|null} */ (game.gameInfo || null),
        allowedSelectors: ["#startBtn", "a"],
        preserveScroll: true,
      });
    } catch {
      /* optional start overlay focus lock */
    }
  } catch {
    /* ignore */
  }

  game.state = new GameStateMachine();
  if (game._unsubscribeEvents) {
    try {
      game._unsubscribeEvents();
    } catch {
      /* ignore */
    }
  }
  game._unsubscribeEvents = EventHandlers.register(game);
}
