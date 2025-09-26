import { CONFIG } from "../constants.js";

/**
 * UpdateSystems – stateless per‑frame mutation helpers for entity arrays / pools.
 *
 * Philosophy
 * ---------
 * Keep hot‑path update logic lean, allocation‑free, and trivially testable. Each function focuses
 * on a single collection type and performs: integration step, liveness/off‑screen culling, and
 * pool recycling. Shared invariants: reverse iteration for safe splicing; default timestep argument
 * to enable both fixed and variable timestep architectures.
 *
 * Determinism
 * -----------
 * Pure deterministic behavior assuming each entity's `update(dt)` is deterministic and the input
 * ordering of collections is stable. No RNG usage occurs inside these helpers.
 *
 * Performance
 * -----------
 * All loops are O(N) with N = collection length. Removals use `splice` which is O(N) worst‑case,
 * but amortized impact is minimal due to typically sparse removals per frame. No temporary arrays
 * are created; recycling returns objects to their respective pools immediately.
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
 * Inputs: game.asteroids (Array), game.view.height (number), asteroidPool
 * Mutations: In‑place per‑asteroid state (via asteroid.update) + potential removal & pool release.
 * Performance: O(A) where A = number of asteroids. At most one splice per off‑screen asteroid.
 * Determinism: Deterministic given asteroid.update is deterministic.
 * Side Effects: Returns asteroids to `asteroidPool` for reuse; no new allocations beyond splice.
 * Failure Modes: Missing update() on an asteroid throws; improper pool release could surface memory leaks externally.
 * @param {import('../types.js').SystemsGame} game
 * @param {number} [dtSec]
 */
export function updateAsteroids(game, dtSec = CONFIG.TIME.DEFAULT_DT) {
  for (let i = game.asteroids.length - 1; i >= 0; i--) {
    const asteroid = game.asteroids[i];
    asteroid.update(dtSec);
    if (asteroid.y > game.view.height) {
      const a = game.asteroids.splice(i, 1)[0];
      game.asteroidPool.release(a);
    }
  }
}

/**
 * updateBullets
 * -------------
 * Integrate bullet positions and recycle bullets that leave the top of the viewport.
 *
 * Inputs: game.bullets (Array), bulletPool
 * Mutations: Bullet internal coords via bullet.update; array shrink via splice for spent bullets.
 * Performance: O(B). Each off‑screen bullet triggers one splice + pool release.
 * Determinism: Deterministic absent randomness in bullet.update.
 * Side Effects: Releases bullet objects back to pool.
 * Failure Modes: Missing update() or dimension data triggers upstream exception.
 * @param {import('../types.js').SystemsGame} game
 * @param {number} [dtSec]
 */
export function updateBullets(game, dtSec = CONFIG.TIME.DEFAULT_DT) {
  for (let i = game.bullets.length - 1; i >= 0; i--) {
    const bullet = game.bullets[i];
    bullet.update(dtSec);
    if (bullet.y + bullet.height < 0) {
      game.bullets.splice(i, 1);
      game.bulletPool.release(bullet);
    }
  }
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
 * Mutations: Explosion life/time state via explosion.update; array removals + pool release.
 * Performance: O(E) where E = number of explosions.
 * Determinism: Deterministic given explosion.update is deterministic.
 * Failure Modes: Missing life property or update() leads to exceptions.
 * @param {import('../types.js').SystemsGame} game
 * @param {number} [dtSec]
 */
export function updateExplosions(game, dtSec = CONFIG.TIME.DEFAULT_DT) {
  for (let i = game.explosions.length - 1; i >= 0; i--) {
    const explosion = game.explosions[i];
    explosion.update(dtSec);
    if (explosion.life <= 0) {
      const e = game.explosions.splice(i, 1)[0];
      game.explosionPool.release(e);
    }
  }
}

/**
 * updateParticles
 * ---------------
 * Integrate generic particle physics (position, velocity, gravity) then recycle dead particles.
 *
 * Inputs: game.particles (Array), particlePool
 * Mutations: Particle internal kinematics + array shrink via splice for dead particles.
 * Performance: O(P) where P = particle count.
 * Determinism: Deterministic if particle.update is deterministic and no random forces applied.
 * Failure Modes: Absent life property or update() method raises exceptions upstream.
 * @param {import('../types.js').SystemsGame} game
 * @param {number} [dtSec]
 */
export function updateParticles(game, dtSec = CONFIG.TIME.DEFAULT_DT) {
  for (let i = game.particles.length - 1; i >= 0; i--) {
    const particle = game.particles[i];
    particle.update(dtSec);
    if (particle.life <= 0) {
      game.particles.splice(i, 1);
      game.particlePool.release(particle);
    }
  }
}

/**
 * updateStars
 * -----------
 * Move collectible stars downward and recycle stars that fall below the viewport.
 *
 * Inputs: game.stars (Array), view.height, starPool
 * Mutations: Star position via star.update; removal + pool release for off‑screen stars.
 * Performance: O(S) where S = number of stars.
 * Determinism: Deterministic provided star.update is deterministic.
 * Failure Modes: Missing update() or dimension properties yields exceptions.
 * @param {import('../types.js').SystemsGame} game
 * @param {number} [dtSec]
 */
export function updateStars(game, dtSec = CONFIG.TIME.DEFAULT_DT) {
  for (let i = game.stars.length - 1; i >= 0; i--) {
    const star = game.stars[i];
    star.update(dtSec);
    if (star.y > game.view.height) {
      const s = game.stars.splice(i, 1)[0];
      game.starPool.release(s);
    }
  }
}
