// @ts-check
import { describe, it, expect } from "vitest";
import { getGameContext, fillGameContext } from "../js/core/GameContext.js";

function makeGame(overrides = {}) {
  return {
    ctx: { id: "ctx" },
    view: { width: 800, height: 600, dpr: 1 },
    state: {
      isRunning: () => true,
      isPaused: () => false,
      isGameOver: () => false,
    },
    timeMs: 1000,
    timeSec: 1,
    _lastDtSec: 1 / 30,
    timerRemaining: 42,
    timerSeconds: 90,
    _isMobile: false,
    _isLowPowerMode: false,
    _starfieldScale: 0.5,
    rng: { nextFloat: () => 0.5 },
    nebulaConfigs: [{ x: 1 }],
    starField: { layers: [] },
    ...overrides,
  };
}

describe("GameContext", () => {
  it("getGameContext snapshots the relevant game fields", () => {
    const game = makeGame();
    const ctx = getGameContext(game);
    expect(ctx.ctx).toBe(game.ctx);
    expect(ctx.view).toBe(game.view);
    expect(ctx.running).toBe(true);
    expect(ctx.paused).toBe(false);
    expect(ctx.gameOver).toBe(false);
    expect(ctx.animTime).toBe(1000);
    expect(ctx.dtSec).toBeCloseTo(1 / 30, 10);
    expect(ctx.timerRemaining).toBe(42);
    expect(ctx.starfieldScale).toBe(0.5);
    expect(ctx.background.nebulaConfigs).toBe(game.nebulaConfigs);
    expect(ctx.background.starField).toBe(game.starField);
  });

  it("getGameContext returns a fresh object per call", () => {
    const game = makeGame();
    const a = getGameContext(game);
    const b = getGameContext(game);
    expect(a).not.toBe(b);
    expect(a.background).not.toBe(b.background);
  });

  it("fillGameContext refreshes a retained snapshot in place, reusing its background object", () => {
    const game = makeGame();
    const target = getGameContext(game);
    const background = target.background;
    game.timeMs = 2000;
    game.timeSec = 2;
    game.nebulaConfigs = undefined;
    game.state.isPaused = () => true;
    const result = fillGameContext(game, target);
    expect(result).toBe(target);
    expect(target.background).toBe(background);
    expect(target.animTime).toBe(2000);
    expect(target.paused).toBe(true);
    expect(target.background.nebulaConfigs).toBeUndefined();
    expect(target.background.starField).toBe(game.starField);
  });

  it("fillGameContext leaves caller-owned extra flags untouched", () => {
    const game = makeGame();
    const target = /** @type {any} */ (getGameContext(game));
    target.suppressNebula = true;
    fillGameContext(game, target);
    expect(target.suppressNebula).toBe(true);
  });
});
