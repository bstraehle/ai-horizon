import { CONFIG } from "../constants.js";

/** Move asteroids and release off-screen ones.
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

/** Move bullets and release off-screen ones.
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

/** Update engine trail and spawn particles when running.
 * @param {import('../types.js').SystemsGame} game
 * @param {number} [dtSec]
 */
export function updateEngineTrail(game, dtSec = CONFIG.TIME.DEFAULT_DT) {
  if (game.gameRunning) {
    game.engineTrail.add(game.player, game.rng);
  }
  game.engineTrail.update(dtSec);
}

/** Update explosions and release finished ones.
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

/** Update particles and release finished ones.
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

/** Move collectible stars and release off-screen ones.
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
