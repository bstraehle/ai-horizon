// @ts-check
import { describe, it, expect } from "vitest";
import {
  updateAsteroids,
  updateBullets,
  updateExplosions,
  updateParticles,
  updateStars,
} from "../js/systems/UpdateSystems.js";

/** Entity that moves down by `speed * dt`; records update calls. */
function mover(id, x, y, speed = 100, size = 10) {
  return {
    id,
    x,
    y,
    width: size,
    height: size,
    speed,
    life: 1,
    updates: 0,
    update(/** @type {number} */ dt) {
      this.updates++;
      this.y += this.speed * dt;
    },
  };
}

function makePool() {
  /** @type {any[]} */
  const released = [];
  return { released, release: (/** @type {any} */ o) => released.push(o) };
}

function makeGame() {
  return /** @type {any} */ ({
    view: { width: 800, height: 600 },
    asteroids: [],
    bullets: [],
    explosions: [],
    particles: [],
    stars: [],
    asteroidPool: makePool(),
    bulletPool: makePool(),
    explosionPool: makePool(),
    particlePool: makePool(),
    starPool: makePool(),
  });
}

describe("UpdateSystems compaction", () => {
  it("removes off-screen asteroids while preserving the relative order of survivors", () => {
    const game = makeGame();
    game.asteroids = [
      mover("a", 0, 100),
      mover("b", 0, 700), // already below the view
      mover("c", 0, 200),
      mover("d", 0, 650), // below after this step
      mover("e", 0, 300),
    ];
    updateAsteroids(game, 0.1);
    expect(game.asteroids.map((/** @type {any} */ a) => a.id)).toEqual(["a", "c", "e"]);
    expect(game.asteroidPool.released.map((/** @type {any} */ a) => a.id)).toEqual(["b", "d"]);
    for (const a of game.asteroids) expect(a.updates).toBe(1);
  });

  it("recycles every dead particle in a single pass", () => {
    const game = makeGame();
    for (let i = 0; i < 100; i++) {
      const p = mover(String(i), 10, 10, 0, 2);
      p.life = i % 2 === 0 ? 0.001 : 1; // even ones expire this tick
      game.particles.push(p);
    }
    for (const p of game.particles) {
      p.update = function (/** @type {number} */ dt) {
        this.life -= dt;
      };
    }
    updateParticles(game, 0.016);
    expect(game.particles.length).toBe(50);
    expect(game.particlePool.released.length).toBe(50);
    expect(game.particles.every((/** @type {any} */ p) => Number(p.id) % 2 === 1)).toBe(true);
  });

  it("bullets leaving the top and stars leaving the bottom are released", () => {
    const game = makeGame();
    game.bullets = [mover("keep", 0, 300, -100), mover("gone", 0, -30, -100)];
    game.stars = [mover("keep", 0, 300, 100), mover("gone", 0, 700, 100)];
    updateBullets(game, 0.1);
    updateStars(game, 0.1);
    expect(game.bullets.map((/** @type {any} */ b) => b.id)).toEqual(["keep"]);
    expect(game.stars.map((/** @type {any} */ s) => s.id)).toEqual(["keep"]);
    expect(game.bulletPool.released.length).toBe(1);
    expect(game.starPool.released.length).toBe(1);
  });

  it("explosions expire on life and keep array identity", () => {
    const game = makeGame();
    const arr = game.explosions;
    const live = mover("live", 100, 100, 0);
    const dead = mover("dead", 100, 100, 0);
    dead.life = 0.01;
    for (const e of [live, dead]) {
      e.update = function (/** @type {number} */ dt) {
        this.life -= dt;
      };
    }
    arr.push(dead, live);
    updateExplosions(game, 0.02);
    expect(game.explosions).toBe(arr);
    expect(arr.map((/** @type {any} */ e) => e.id)).toEqual(["live"]);
  });

  it("treats an unknown view size as unbounded (fail-open)", () => {
    const game = makeGame();
    game.view = {};
    game.asteroids = [mover("far", 0, 5000)];
    updateAsteroids(game, 0.016);
    expect(game.asteroids.length).toBe(1);
  });
});
