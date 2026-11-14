// @ts-check
import { describe, it, expect, vi } from "vitest";
import {
  cancelDeathSequence,
  isDying,
  startDeathSequence,
  updateDeathSequence,
} from "../js/systems/DeathSequence.js";
import { resetCoreRuntimeState } from "../js/systems/ResetLifecycle.js";
import { EventHandlers } from "../js/systems/EventHandlers.js";
import { EventBus } from "../js/core/EventBus.js";
import { RenderManager } from "../js/managers/RenderManager.js";
import { CONFIG } from "../js/constants.js";

const STEP = 1 / 60;

/** Entity that moves down by `speed * dt` and ages by `dt`. */
function mover(speed = 120) {
  return {
    x: 100,
    y: 100,
    width: 10,
    height: 10,
    speed,
    life: 10,
    update(/** @type {number} */ dt) {
      this.y += this.speed * dt;
      this.life -= dt;
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
    state: { isRunning: () => false },
    asteroids: [mover()],
    stars: [mover()],
    bullets: [mover(), mover()],
    explosions: [mover(0)],
    particles: [mover()],
    engineTrail: { add: vi.fn(), update: vi.fn() },
    asteroidPool: makePool(),
    starPool: makePool(),
    bulletPool: makePool(),
    explosionPool: makePool(),
    particlePool: makePool(),
  });
}

describe("DeathSequence", () => {
  it("starts on a crash and removes the bullets in flight", () => {
    const game = makeGame();
    const bullets = [...game.bullets];
    expect(isDying(game)).toBe(false);
    expect(startDeathSequence(game)).toBe(true);
    expect(isDying(game)).toBe(true);
    expect(game.bullets).toEqual([]);
    expect(game.bulletPool.released).toEqual(bullets);
  });

  it("plays the wreck at full speed while asteroids and stars drift in slow motion", () => {
    const game = makeGame();
    startDeathSequence(game);
    expect(updateDeathSequence(game, STEP)).toBe(false);
    const slow = 120 * STEP * CONFIG.DEATH.WORLD_TIME_SCALE;
    expect(game.asteroids[0].y).toBeCloseTo(100 + slow, 9);
    expect(game.stars[0].y).toBeCloseTo(100 + slow, 9);
    expect(game.particles[0].y).toBeCloseTo(100 + 120 * STEP, 9);
    expect(game.explosions[0].life).toBeCloseTo(10 - STEP, 9);
    expect(game.engineTrail.update).toHaveBeenCalledWith(STEP);
    // The destroyed ship leaves no new exhaust.
    expect(game.engineTrail.add).not.toHaveBeenCalled();
  });

  it("ends after CONFIG.DEATH.SECONDS of simulation steps", () => {
    const game = makeGame();
    startDeathSequence(game);
    let steps = 0;
    while (!updateDeathSequence(game, STEP)) steps++;
    expect(steps + 1).toBe(Math.ceil(CONFIG.DEATH.SECONDS / STEP - 1e-9));
    expect(isDying(game)).toBe(false);
  });

  it("is cancelled by a run reset", () => {
    const game = makeGame();
    startDeathSequence(game);
    cancelDeathSequence(game);
    expect(isDying(game)).toBe(false);

    const next = /** @type {any} */ ({
      ...makeGame(),
      timerSeconds: 90,
      updateScore() {},
      fireLimiter: { reset() {} },
    });
    startDeathSequence(next);
    resetCoreRuntimeState(next);
    expect(isDying(next)).toBe(false);
  });
});

describe("blast kinds and the destroyed ship", () => {
  function makeHandlerGame() {
    return /** @type {any} */ ({
      score: 0,
      timerRemaining: 60,
      updateScore: () => {},
      events: new EventBus(),
      createExplosion: vi.fn(),
      gameOver: vi.fn(),
      player: { x: 100, y: 200, width: 20, height: 30 },
    });
  }

  it("blows up the ship with the ship blast and ends the run", () => {
    const game = makeHandlerGame();
    const unsub = EventHandlers.register(game);
    game.events.emit("playerHitAsteroid", { asteroid: {} });
    expect(game.createExplosion.mock.calls).toEqual([[110, 215, "ship"]]);
    expect(game._dramaticEndPlayed).toBe(true);
    expect(game.gameOver).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("sizes an asteroid's blast to what was destroyed", () => {
    const game = makeHandlerGame();
    const unsub = EventHandlers.register(game);
    const base = { x: 0, y: 0, width: 60, height: 60 };
    game.events.emit("bulletHitAsteroid", { asteroid: { ...base } });
    game.events.emit("bulletHitAsteroid", { asteroid: { ...base, isHardened: true } });
    game.events.emit("bulletHitAsteroid", {
      asteroid: { ...base, isHardened: true, isBonus: true },
    });
    expect(game.createExplosion.mock.calls).toEqual([
      [30, 30, "rock", 60],
      [30, 30, "planet", 60],
      [30, 30, "bonus", 60],
    ]);
    unsub();
  });

  it("no longer draws the ship once it has crashed", () => {
    const ctx = {
      globalAlpha: 1,
      globalCompositeOperation: "source-over",
      save() {},
      restore() {},
      translate() {},
      drawImage() {},
    };
    const game = /** @type {any} */ ({
      ctx,
      asteroids: [],
      bullets: [],
      stars: [],
      explosions: [],
      particles: [],
      sprites: null,
      timeSec: 0,
      player: { draw: vi.fn() },
      engineTrail: { draw: vi.fn() },
    });
    RenderManager.draw(game);
    expect(game.player.draw).toHaveBeenCalledTimes(1);
    game._dramaticEndPlayed = true;
    RenderManager.draw(game);
    expect(game.player.draw).toHaveBeenCalledTimes(1);
    // The exhaust left behind keeps fading out.
    expect(game.engineTrail.draw).toHaveBeenCalledTimes(2);
  });
});
