// @ts-check
import { describe, it, expect } from "vitest";
import { Autopilot } from "../js/ui/Autopilot.js";

/**
 * @param {Partial<{ running: boolean, asteroids: any[], stars: any[], player: any, view: any }>} [overrides]
 */
function makeGame(overrides = {}) {
  const running = overrides.running !== false;
  return {
    state: { isRunning: () => running },
    player: overrides.player || { x: 400 - 12.5, y: 500, width: 25, height: 25 },
    view: overrides.view || { width: 800, height: 600 },
    asteroids: overrides.asteroids || [],
    stars: overrides.stars || [],
    input: { mouse: { x: 0, y: 0 }, fireHeld: false },
  };
}

describe("Autopilot", () => {
  it("does nothing while the game is not running", () => {
    const game = makeGame({ running: false });
    new Autopilot().step(game);
    expect(game.input.fireHeld).toBe(false);
    expect(game.input.mouse).toEqual({ x: 0, y: 0 });
  });

  it("holds position and row, and keeps fire held, when nothing is around", () => {
    const game = makeGame();
    new Autopilot().step(game);
    expect(game.input.fireHeld).toBe(true);
    expect(game.input.mouse.x).toBeCloseTo(400, 5);
    expect(game.input.mouse.y).toBeCloseTo(512.5, 5);
  });

  it("steers toward the nearest star above the row", () => {
    const game = makeGame({
      stars: [
        { x: 100, y: 100, width: 20, height: 20 }, // far above
        { x: 600, y: 400, width: 20, height: 20 }, // closest to the row
        { x: 300, y: 560, width: 20, height: 20 }, // already below the row → ignored
      ],
    });
    new Autopilot().step(game);
    expect(game.input.mouse.x).toBeCloseTo(610, 5);
  });

  it("side-steps an asteroid about to reach the row", () => {
    const game = makeGame({
      asteroids: [{ x: 380, y: 400, width: 40, height: 40, speed: 200 }],
    });
    new Autopilot({ marginFactor: 0.75 }).step(game);
    const target = game.input.mouse.x;
    const margin = 25 * 0.75;
    expect(target < 380 - margin || target > 420 + margin).toBe(true);
    // Nearest safe edge is chosen (either side is equidistant here; must be adjacent to the interval)
    expect(Math.abs(target - 400)).toBeLessThan(80);
  });

  it("stops short of a threat that lies between the ship and a star", () => {
    const game = makeGame({
      stars: [{ x: 690, y: 300, width: 20, height: 20 }], // star center x = 700
      asteroids: [{ x: 530, y: 450, width: 40, height: 40, speed: 150 }], // blocks [530-m, 570+m]
    });
    new Autopilot({ marginFactor: 0.75 }).step(game);
    const target = game.input.mouse.x;
    expect(target).toBeGreaterThan(400);
    expect(target).toBeLessThan(530 - 18.75);
  });

  it("ignores asteroids that are too far away to matter within the lookahead", () => {
    const game = makeGame({
      asteroids: [{ x: 380, y: 0, width: 40, height: 40, speed: 100 }], // 460px away at 100px/s
    });
    new Autopilot({ lookaheadSec: 1 }).step(game);
    expect(game.input.mouse.x).toBeCloseTo(400, 5);
  });

  it("prefers a safe gap over a blocked star", () => {
    const game = makeGame({
      stars: [{ x: 390, y: 300, width: 20, height: 20 }],
      asteroids: [{ x: 360, y: 450, width: 80, height: 40, speed: 150 }],
    });
    new Autopilot({ marginFactor: 0.75 }).step(game);
    const target = game.input.mouse.x;
    expect(target < 360 - 18.75 || target > 440 + 18.75).toBe(true);
  });

  it("clamps targets inside the playable width", () => {
    const game = makeGame({
      stars: [{ x: -30, y: 300, width: 20, height: 20 }],
    });
    new Autopilot().step(game);
    expect(game.input.mouse.x).toBeCloseTo(12.5, 5);
  });
});
