// @ts-check
import { describe, it, expect, vi } from "vitest";
import { EventHandlers } from "../js/systems/EventHandlers.js";
import { EventBus } from "../js/core/EventBus.js";
import { CollisionManager } from "../js/managers/CollisionManager.js";
import { ScoringManager } from "../js/managers/ScoringManager.js";
import { CONFIG } from "../js/constants.js";

function makeAudio() {
  return {
    playAsteroidHit: vi.fn(),
    playHardenedExplosion: vi.fn(),
    playStarCollect: vi.fn(),
    playFatal: vi.fn(),
  };
}

function makeGame() {
  return {
    score: 0,
    timerRemaining: 60,
    updateScore: () => {},
    events: new EventBus(),
    createExplosion: () => {},
    gameOver: vi.fn(),
    player: { x: 0, y: 0, width: 10, height: 10 },
    audio: makeAudio(),
  };
}

describe("star and crash sound routing", () => {
  it("plays the star or bonus-star pickup sound, panned by position", () => {
    const game = /** @type {any} */ ({ ...makeGame(), view: { width: 200 } });
    const unsub = EventHandlers.register(game);
    game.events.emit("collectedStar", { star: { x: 0, y: 0, width: 0, height: 10 } });
    game.events.emit("collectedStar", {
      star: { x: 190, y: 0, width: 20, height: 10, isRed: true },
    });
    expect(game.audio.playStarCollect.mock.calls).toEqual([
      [{ bonus: false, pan: -1 }],
      [{ bonus: true, pan: 1 }],
    ]);
    unsub();
  });

  it("plays the fatal crash once when the player is hit", () => {
    const game = makeGame();
    const unsub = EventHandlers.register(game);
    game.events.emit("playerHitAsteroid", { asteroid: {} });
    game.events.emit("playerHitAsteroid", { asteroid: {} });
    expect(game.audio.playFatal).toHaveBeenCalledTimes(1);
    expect(game.gameOver).toHaveBeenCalledTimes(2);
    unsub();
  });
});

describe("asteroid sound routing", () => {
  it("plays the hit sound for regular kills and the explosion for hardened/bonus kills", () => {
    const game = makeGame();
    const unsub = EventHandlers.register(game);
    const base = { x: 0, y: 0, width: 10, height: 10 };

    game.events.emit("bulletHitAsteroid", { asteroid: { ...base, isHardened: false } });
    expect(game.audio.playAsteroidHit).toHaveBeenCalledTimes(1);

    game.events.emit("bulletHitAsteroid", { asteroid: { ...base, isHardened: true } });
    game.events.emit("bulletHitAsteroid", {
      asteroid: { ...base, isHardened: true, isBonus: true },
    });
    expect(game.audio.playHardenedExplosion.mock.calls.map((c) => c[0])).toEqual([false, true]);
    expect(game.audio.playAsteroidHit).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("plays the regular asteroid-hit sound for non-lethal planet hits", () => {
    const game = makeGame();
    const unsub = EventHandlers.register(game);
    game.events.emit("bulletDamagedAsteroid", { asteroid: { x: 0, width: 10 } });
    game.events.emit("bulletDamagedAsteroid", {});
    expect(game.audio.playAsteroidHit).toHaveBeenCalledTimes(2);
    expect(game.audio.playHardenedExplosion).not.toHaveBeenCalled();
    unsub();
  });

  it("pans by screen position and switches to heavy impacts at the caliber upgrade", () => {
    const game = /** @type {any} */ ({ ...makeGame(), view: { width: 400 } });
    const unsub = EventHandlers.register(game);
    const threshold = CONFIG.GAME.BULLET_UPGRADE_SCORE;

    game.events.emit("bulletHitAsteroid", { asteroid: { x: 0, y: 0, width: 0, height: 10 } });
    expect(game.audio.playAsteroidHit.mock.calls[0][0]).toEqual({ heavy: false, pan: -1 });

    game.score = threshold;
    game.events.emit("bulletHitAsteroid", { asteroid: { x: 190, y: 0, width: 20, height: 10 } });
    expect(game.audio.playAsteroidHit.mock.calls[1][0]).toEqual({ heavy: true, pan: 0 });

    game.events.emit("bulletDamagedAsteroid", { asteroid: { x: 390, width: 20 } });
    expect(game.audio.playAsteroidHit.mock.calls[2][0]).toEqual({ heavy: true, pan: 1 });
    unsub();
  });

  it("judges heavy from the score before the impact's own points", () => {
    const game = /** @type {any} */ (makeGame());
    game.score = CONFIG.GAME.BULLET_UPGRADE_SCORE - 1;
    const unsub = EventHandlers.register(game);
    game.events.emit("bulletHitAsteroid", {
      asteroid: { x: 0, y: 0, width: 1, height: 1, isHardened: true },
    });
    expect(game.score).toBeGreaterThanOrEqual(CONFIG.GAME.BULLET_UPGRADE_SCORE);
    expect(game.audio.playHardenedExplosion.mock.calls[0][1].heavy).toBe(false);
    unsub();
  });

  it("ScoringManager.isBulletUpgraded follows CONFIG.GAME.BULLET_UPGRADE_SCORE", () => {
    const threshold = CONFIG.GAME.BULLET_UPGRADE_SCORE;
    expect(ScoringManager.isBulletUpgraded(threshold - 1)).toBe(false);
    expect(ScoringManager.isBulletUpgraded(threshold)).toBe(true);
    expect(ScoringManager.isBulletUpgraded(/** @type {any} */ (undefined))).toBe(false);
  });

  it("works without an audio manager", () => {
    const game = /** @type {any} */ (makeGame());
    delete game.audio;
    const unsub = EventHandlers.register(game);
    expect(() => {
      game.events.emit("bulletHitAsteroid", {
        asteroid: { x: 0, y: 0, width: 1, height: 1, isHardened: true },
      });
      game.events.emit("bulletDamagedAsteroid", { asteroid: {} });
    }).not.toThrow();
    unsub();
  });

  it("CollisionManager emits bulletDamagedAsteroid only for non-lethal hardened hits", () => {
    const events = new EventBus();
    const damaged = vi.fn();
    const killed = vi.fn();
    events.on("bulletDamagedAsteroid", damaged);
    events.on("bulletHitAsteroid", killed);
    const planet = {
      x: 40,
      y: 10,
      width: 20,
      height: 20,
      isHardened: true,
      hits: 0,
      onBulletHit() {
        this.hits++;
        return this.hits >= 2;
      },
    };
    /** @type {any} */
    const game = {
      cellSize: 64,
      asteroids: [planet],
      bullets: [],
      stars: [],
      player: { x: -9999, y: -9999, width: 1, height: 1 },
      events,
    };
    const fire = () => {
      game.bullets = [{ x: 45, y: 15, width: 5, height: 5 }];
      CollisionManager.check(game);
    };
    fire();
    expect(damaged).toHaveBeenCalledTimes(1);
    expect(killed).not.toHaveBeenCalled();
    fire();
    expect(damaged).toHaveBeenCalledTimes(1);
    expect(killed).toHaveBeenCalledTimes(1);
  });
});
