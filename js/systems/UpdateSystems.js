import { CONFIG } from "../constants.js";
import { isOnscreen } from "../utils/bounds.js";

/**
 * Logical view width for culling (0 when unknown → treated as unbounded by isOnscreen).
 * @param {import('../types.js').SystemsGame} game
 * @returns {number}
 */
function viewWidth(game) {
  const view = game && game.view;
  return view && Number.isFinite(view.width) ? view.width : 0;
}

/**
 * Logical view height for culling (0 when unknown → treated as unbounded by isOnscreen).
 * @param {import('../types.js').SystemsGame} game
 * @returns {number}
 */
function viewHeight(game) {
  const view = game && game.view;
  return view && Number.isFinite(view.height) ? view.height : 0;
}

/**
 * UpdateSystems – stateless per‑frame mutation helpers for entity arrays / pools.
 *
 * Philosophy
 * ---------
 * Keep hot‑path update logic lean, allocation‑free, and trivially testable. Each function focuses
 * on a single collection type and performs: integration step, liveness/off‑screen culling, and
 * pool recycling. Shared invariants: stable in-place compaction (write index) for removals; default
 * timestep argument to enable both fixed and variable timestep architectures.
 *
 * Determinism
 * -----------
 * Pure deterministic behavior assuming each entity's `update(dt)` is deterministic and the input
 * ordering of collections is stable. Compaction preserves relative order, so downstream systems
 * (collision "first hit" resolution, draw order) see the same sequence they would with splicing.
 * No RNG usage occurs inside these helpers.
 *
 * Performance
 * -----------
 * All loops are O(N) with N = collection length, including removals: survivors are written back
 * at a moving write index and the array is truncated once, instead of an O(N) `splice` per dead
 * entity (which made heavy particle frames O(N·k)). No temporary arrays are created; recycling
 * returns objects to their respective pools immediately.
 *
 * Failure Modes
 * -------------
 * Assumes entities expose an `update(dt)` method and required scalar properties (`y`, `height`,
 * `life`). Absent or malformed entities can throw upstream; no internal try/catch to preserve
 * visibility of logic errors during development/testing.
 */

/**
 * updateAsteroids
 * ---------------
 * Advance asteroid positions and recycle any that move past the bottom of the viewport.
 *
 * Inputs: game.asteroids (Array), game.view (width/height), asteroidPool
 * Mutations: In‑place per‑asteroid state (via asteroid.update) + compaction & pool release.
 * Performance: O(A) where A = number of asteroids.
 * Determinism: Deterministic given asteroid.update is deterministic.
 * Side Effects: Returns asteroids to `asteroidPool` for reuse; no allocations.
 * Failure Modes: Missing update() on an asteroid throws; improper pool release could surface memory leaks externally.
 * @param {import('../types.js').SystemsGame} game
 * @param {number} [dtSec]
 */
export function updateAsteroids(game, dtSec = CONFIG.TIME.DEFAULT_DT) {
  const vw = viewWidth(game);
  const vh = viewHeight(game);
  const arr = game.asteroids;
  let w = 0;
  for (let r = 0; r < arr.length; r++) {
    const asteroid = arr[r];
    asteroid.update(dtSec);
    if (!isOnscreen(asteroid, vw, vh)) {
      game.asteroidPool.release(asteroid);
      continue;
    }
    arr[w++] = asteroid;
  }
  if (w !== arr.length) arr.length = w;
}

/**
 * updateBullets
 * -------------
 * Integrate bullet positions and recycle bullets that leave the top of the viewport.
 *
 * Inputs: game.bullets (Array), bulletPool
 * Mutations: Bullet internal coords via bullet.update; compaction for spent bullets.
 * Performance: O(B).
 * Determinism: Deterministic absent randomness in bullet.update.
 * Side Effects: Releases bullet objects back to pool.
 * Failure Modes: Missing update() or dimension data triggers upstream exception.
 * @param {import('../types.js').SystemsGame} game
 * @param {number} [dtSec]
 */
export function updateBullets(game, dtSec = CONFIG.TIME.DEFAULT_DT) {
  const vw = viewWidth(game);
  const vh = viewHeight(game);
  const arr = game.bullets;
  let w = 0;
  for (let r = 0; r < arr.length; r++) {
    const bullet = arr[r];
    bullet.update(dtSec);
    if (!isOnscreen(bullet, vw, vh, 16)) {
      game.bulletPool.release(bullet);
      continue;
    }
    arr[w++] = bullet;
  }
  if (w !== arr.length) arr.length = w;
}

/**
 * updateEngineTrail
 * -----------------
 * Conditionally append new engine trail segments/particles while the game is in a running state,
 * then advance existing trail animation/lifetimes.
 *
 * Inputs: game.state.isRunning(), game.engineTrail, game.player, game.rng
 * Mutations: Potential allocation via trail.add (which may itself leverage pooling), internal trail
 * lifecycle state progressed by trail.update.
 * Performance: O(1) for spawn gate + O(T) for internal engineTrail.update where T = trail elements.
 * Determinism: Dependent on any RNG consumption inside engineTrail.add (seeded externally).
 * Failure Modes: Missing state or engineTrail references cause exceptions—unchecked by design.
 * @param {import('../types.js').SystemsGame} game
 * @param {number} [dtSec]
 */
export function updateEngineTrail(game, dtSec = CONFIG.TIME.DEFAULT_DT) {
  if (game.state && typeof game.state.isRunning === "function" && game.state.isRunning()) {
    const rawModulo = typeof game._engineTrailModulo === "number" ? game._engineTrailModulo : 1;
    const modulo = rawModulo > 1 ? Math.max(1, Math.floor(rawModulo)) : 1;
    if (modulo > 1) {
      const step = typeof game._engineTrailStep === "number" ? game._engineTrailStep + 1 : 1;
      game._engineTrailStep = step;
      if (step % modulo === 0) {
        game.engineTrail.add(game.player, game.rng);
      }
    } else {
      game._engineTrailStep = 0;
      game.engineTrail.add(game.player, game.rng);
    }
  }
  game.engineTrail.update(dtSec);
}

/**
 * updateExplosions
 * ----------------
 * Progress explosion animations and recycle those whose lifetime has expired (life <= 0).
 *
 * Inputs: game.explosions (Array), explosionPool
 * Mutations: Explosion life/time state via explosion.update; compaction + pool release.
 * Performance: O(E) where E = number of explosions.
 * Determinism: Deterministic given explosion.update is deterministic.
 * Failure Modes: Missing life property or update() leads to exceptions.
 * @param {import('../types.js').SystemsGame} game
 * @param {number} [dtSec]
 */
export function updateExplosions(game, dtSec = CONFIG.TIME.DEFAULT_DT) {
  const vw = viewWidth(game);
  const vh = viewHeight(game);
  const arr = game.explosions;
  let w = 0;
  for (let r = 0; r < arr.length; r++) {
    const explosion = arr[r];
    explosion.update(dtSec);
    if (explosion.life <= 0 || !isOnscreen(explosion, vw, vh, 64)) {
      game.explosionPool.release(explosion);
      continue;
    }
    arr[w++] = explosion;
  }
  if (w !== arr.length) arr.length = w;
}

/**
 * updateParticles
 * ---------------
 * Integrate generic particle physics (position, velocity, gravity) then recycle dead particles.
 *
 * Inputs: game.particles (Array), particlePool
 * Mutations: Particle internal kinematics + compaction for dead particles.
 * Performance: O(P) where P = particle count, regardless of how many die this frame.
 * Determinism: Deterministic if particle.update is deterministic and no random forces applied.
 * Failure Modes: Absent life property or update() method raises exceptions upstream.
 * @param {import('../types.js').SystemsGame} game
 * @param {number} [dtSec]
 */
export function updateParticles(game, dtSec = CONFIG.TIME.DEFAULT_DT) {
  const vw = viewWidth(game);
  const vh = viewHeight(game);
  const arr = game.particles;
  let w = 0;
  for (let r = 0; r < arr.length; r++) {
    const particle = arr[r];
    particle.update(dtSec);
    if (particle.life <= 0 || !isOnscreen(particle, vw, vh, 48)) {
      game.particlePool.release(particle);
      continue;
    }
    arr[w++] = particle;
  }
  if (w !== arr.length) arr.length = w;
}

/**
 * updateStars
 * -----------
 * Move collectible stars downward and recycle stars that fall below the viewport.
 *
 * Inputs: game.stars (Array), view.height, starPool
 * Mutations: Star position via star.update; compaction + pool release for off‑screen stars.
 * Performance: O(S) where S = number of stars.
 * Determinism: Deterministic provided star.update is deterministic.
 * Failure Modes: Missing update() or dimension properties yields exceptions.
 * @param {import('../types.js').SystemsGame} game
 * @param {number} [dtSec]
 */
export function updateStars(game, dtSec = CONFIG.TIME.DEFAULT_DT) {
  const vw = viewWidth(game);
  const vh = viewHeight(game);
  const arr = game.stars;
  let w = 0;
  for (let r = 0; r < arr.length; r++) {
    const star = arr[r];
    star.update(dtSec);
    if (!isOnscreen(star, vw, vh, 24)) {
      game.starPool.release(star);
      continue;
    }
    arr[w++] = star;
  }
  if (w !== arr.length) arr.length = w;
}
