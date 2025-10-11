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

describe("Golden (red) asteroid timing gates", () => {
  it("never spawns golden before 15s elapsed (relative to session start)", () => {
    const game = makeGame();
    game.timeSec = 100;
    SpawnManager.reset(game);
    game.timeSec = 100 + 10;
    for (let i = 0; i < 20; i++) {
      const a = SpawnManager.createAsteroid(game);
      expect(!!a.isGolden).toBe(false);
    }
  });

  it("spawns golden on/after 15s, aligned to the indestructible cadence", () => {
    const game = makeGame();
    game.timeSec = 200;
    SpawnManager.reset(game);

    game.timeSec = 200 + 12;
    for (let i = 0; i < 4 /* ASTEROID_NORMAL_BEFORE_INDESTRUCTIBLE */; i++) {
      const a = SpawnManager.createAsteroid(game);
      expect(a.isGolden).toBe(false);
    }
    let a = SpawnManager.createAsteroid(game);
    expect(a.isGolden).toBe(false);

    game.timeSec = 200 + 15;
    for (let i = 0; i < 4; i++) {
      const normal = SpawnManager.createAsteroid(game);
      expect(normal.isGolden).toBe(false);
    }
    a = SpawnManager.createAsteroid(game);
    expect(a.isGolden).toBe(true);
  });
});
