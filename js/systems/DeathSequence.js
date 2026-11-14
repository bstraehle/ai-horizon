import { CONFIG } from "../constants.js";
import {
  updateAsteroids,
  updateEngineTrail,
  updateExplosions,
  updateParticles,
  updateStars,
} from "./UpdateSystems.js";

/**
 * DeathSequence – the moments between a crash and the game-over screens.
 *
 * The run ends on the tick the ship is hit (state, score and run summary are final), but the
 * loop keeps running for CONFIG.DEATH.SECONDS so the wreck plays out before the dialog covers
 * it: the ship's blast, its sparks and the death jolt run at full speed while asteroids and stars
 * drift on in slow motion (CONFIG.DEATH.WORLD_TIME_SCALE), which keeps the asteroid that hit the
 * ship in view. Nothing spawns, collides or scores, and the ship is no longer drawn
 * (RenderManager). Bullets in flight are removed, since nothing stops them any more.
 *
 * State lives on the game object (`_deathT`, seconds left; 0 when idle) and advances with the
 * fixed simulation step, so recordings that step the clock frame by frame reproduce it.
 *
 * Lifecycle: `AIHorizon.gameOver` starts it on a crash and `AIHorizon.update` advances it,
 * showing the game-over screens when it reports the end; a run reset cancels it
 * (systems/ResetLifecycle).
 */

/** @typedef {import('../types.js').SystemsGame & { _deathT?: number }} DeathHost */

/**
 * Begin the sequence.
 * @param {DeathHost} game
 * @returns {boolean} False when it is disabled (CONFIG.DEATH.SECONDS <= 0): show the screens now.
 */
export function startDeathSequence(game) {
  const seconds = CONFIG.DEATH.SECONDS;
  if (!(seconds > 0)) return false;
  game._deathT = seconds;
  for (const bullet of game.bullets) game.bulletPool.release(bullet);
  game.bullets.length = 0;
  return true;
}

/**
 * Whether the wreck is still playing out.
 * @param {{ _deathT?: number }} game
 * @returns {boolean}
 */
export function isDying(game) {
  return !!game && (game._deathT || 0) > 0;
}

/**
 * Advance the sequence by one simulation step.
 * @param {DeathHost} game
 * @param {number} [dtSec=CONFIG.TIME.DEFAULT_DT]
 * @returns {boolean} True once it has ended (the caller shows the game-over screens).
 */
export function updateDeathSequence(game, dtSec = CONFIG.TIME.DEFAULT_DT) {
  const worldDt = dtSec * CONFIG.DEATH.WORLD_TIME_SCALE;
  updateAsteroids(game, worldDt);
  updateStars(game, worldDt);
  updateEngineTrail(game, dtSec);
  updateExplosions(game, dtSec);
  updateParticles(game, dtSec);
  game._deathT = Math.max(0, (game._deathT || 0) - dtSec);
  return game._deathT === 0;
}

/**
 * Drop a sequence in progress (run reset).
 * @param {{ _deathT?: number }} game
 */
export function cancelDeathSequence(game) {
  if (game) game._deathT = 0;
}
