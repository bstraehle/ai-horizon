// @ts-check
import { describe, it, expect } from "vitest";
import { CollisionManager } from "../js/managers/CollisionManager.js";

/** Create many small asteroids tiled in a grid and matching bullets above them. */
describe("CollisionManager stress grid", () => {
  it("handles many asteroids and bullets without error and removes collisions", () => {
    const cols = 10;
    const rows = 6;
    const cellSize = 32;
    const asteroids = [];
    const bullets = [];
    // tile asteroids
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * 28 + 5;
        const y = r * 28 + 200;
        asteroids.push({ x, y, width: 24, height: 24, isHardened: false });
        // bullet aimed at center
        bullets.push({ x: x + 10, y: y + 10, width: 2, height: 4 });
      }
    }

    const game = {
      cellSize,
      asteroids,
      bullets,
      stars: [],
      player: { x: 0, y: 0, width: 10, height: 10 },
      bulletPool: { release: () => {} },
      asteroidPool: { release: () => {} },
      particlePool: { acquire: () => ({}) },
      particles: [],
      rng: { nextFloat: () => 0.5 },
      events: null,
    };

    // cast to any to avoid full Asteroid/Entity typings in test shim
    CollisionManager.check(/** @type {any} */ (game));

    // All colliding bullets and asteroids should be removed
    expect(game.asteroids.length).toBe(0);
    expect(game.bullets.length).toBe(0);
  });
});
