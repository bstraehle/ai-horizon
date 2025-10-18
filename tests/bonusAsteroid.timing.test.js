// @ts-check
import { describe, it, expect } from "vitest";
import { SpawnManager } from "../js/managers/SpawnManager.js";

function makeGame() {
  return {
    rng: { nextFloat: () => 0.5 },
    view: { width: 300, height: 300 },
    asteroidSpeed: 120,
    asteroidPool: null,
    timeSec: 0,
  };
}

describe("Bonus (red) asteroid timing gates", () => {
  it("never spawns bonus before 10s elapsed (relative to session start)", () => {
    const game = makeGame();
    game.timeSec = 100;
    SpawnManager.reset(game);
    game.timeSec = 100 + 9;
    for (let i = 0; i < 20; i++) {
      const a = SpawnManager.createAsteroid(game);
      expect(!!a.isBonus).toBe(false);
    }
  });

  it("spawns bonus on/after 10s, aligned to the hardened cadence", () => {
    const game = makeGame();
    game.timeSec = 200;
    SpawnManager.reset(game);

    game.timeSec = 200 + 9;
    for (let i = 0; i < 4 /* ASTEROID_NORMAL_BEFORE_HARDENED */; i++) {
      const a = SpawnManager.createAsteroid(game);
      expect(a.isBonus).toBe(false);
    }
    let a = SpawnManager.createAsteroid(game);
    expect(a.isBonus).toBe(false);

    game.timeSec = 200 + 10;
    for (let i = 0; i < 4; i++) {
      const normal = SpawnManager.createAsteroid(game);
      expect(normal.isBonus).toBe(false);
    }
    a = SpawnManager.createAsteroid(game);
    expect(a.isBonus).toBe(true);
  });

  it("caps bonus spawns at 8 total, every 10s thereafter", () => {
    const game = makeGame();
    const start = 300;
    game.timeSec = start;
    SpawnManager.reset(game);

    const spawnBlock = () => {
      for (let i = 0; i < 4; i++) {
        const n = SpawnManager.createAsteroid(game);
        expect(!!n.isBonus).toBe(false);
      }
      const hardened = SpawnManager.createAsteroid(game);
      return !!hardened.isBonus;
    };

    for (let k = 1; k <= 8; k++) {
      game.timeSec = start + k * 10;
      expect(spawnBlock()).toBe(true);
    }

    game.timeSec = start + 90;
    expect(spawnBlock()).toBe(false);
  });
});
