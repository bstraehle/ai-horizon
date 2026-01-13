// @ts-nocheck
import { CONFIG } from "../constants.js";
import { Nebula } from "../entities/Nebula.js";
import {
  updateAsteroids,
  updateBullets,
  updateEngineTrail,
  updateExplosions,
  updateParticles,
  updateStars,
} from "./UpdateSystems.js";
import { SpawnManager } from "../managers/SpawnManager.js";
import { CollisionManager } from "../managers/CollisionManager.js";
import { UIManager } from "../managers/UIManager.js";
/** @typedef {import('../game.js').AIHorizon} AIHorizon */

/**
 * Core per-frame update routine extracted from AIHorizon.update.
 *
 * Orchestrates all per-tick game logic in deterministic order:
 *  1. Nebula animation (if running and configs exist).
 *  2. Entity updates (asteroids, bullets, engine trail, explosions, particles, stars).
 *  3. Player shooting (if fire input held).
 *  4. Entity spawning via SpawnManager.
 *  5. Collision detection via CollisionManager.
 *  6. Player movement update.
 *  7. Timer countdown and game over trigger.
 *
 * Determinism:
 *  - All updates use dtSec for frame-rate independence.
 *  - Order of operations is fixed to ensure reproducible behavior.
 *
 * Side Effects:
 *  - Mutates entity arrays and pools.
 *  - May trigger game over via game.gameOver().
 *  - Updates UI timer display.
 *
 * @param {AIHorizon} game Game instance to update.
 * @param {number} [dtSec=CONFIG.TIME.DEFAULT_DT] Delta time in seconds for this tick.
 */
export function updateGame(game, dtSec = CONFIG.TIME.DEFAULT_DT) {
  if (
    game.nebulaConfigs &&
    game.state &&
    typeof game.state.isRunning === "function" &&
    game.state.isRunning()
  ) {
    Nebula.update(
      game.view.width,
      game.view.height,
      game.nebulaConfigs,
      game._isMobile || game._isLowPowerMode,
      dtSec
    );
  }
  updateAsteroids(game, dtSec);
  updateBullets(game, dtSec);
  updateEngineTrail(game, dtSec);
  updateExplosions(game, dtSec);
  updateParticles(game, dtSec);
  updateStars(game, dtSec);
  if (game.input.fireHeld) {
    game.shoot();
  }
  SpawnManager.spawnObjects(game, dtSec);
  CollisionManager.check(game);
  game.player.update(game.input.keys, game.input.mouse, game.view, dtSec);

  try {
    if (game.state.isRunning()) {
      game.timerRemaining -= dtSec;
      if (game.timerRemaining <= 0) {
        game.timerRemaining = 0;
        UIManager.setTimer(game.timerEl, game.timerRemaining);
        game.gameOver();
      } else {
        UIManager.setTimer(game.timerEl, game.timerRemaining);
      }
    }
  } catch (_e) {
    /* ignore in non-DOM/test envs */
  }
}
