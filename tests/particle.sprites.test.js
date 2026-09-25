// @ts-check
import { describe, it, expect } from "vitest";
import { Particle } from "../js/entities/Particle.js";
import { GameFactories } from "../js/ui/GameFactories.js";
import { ObjectPool } from "../js/utils/ObjectPool.js";
import { RNG } from "../js/utils/RNG.js";
import { CONFIG } from "../js/constants.js";

describe("Particle.quantizeGray", () => {
  it("snaps to the configured step and clamps to the palette range", () => {
    const {
      PARTICLE_GRAY_MIN: min,
      PARTICLE_GRAY_MAX: max,
      PARTICLE_GRAY_STEP: step,
    } = CONFIG.EXPLOSION;
    expect(Particle.quantizeGray(min)).toBe(min);
    expect(Particle.quantizeGray(max)).toBe(max);
    expect(Particle.quantizeGray(min + step * 0.49)).toBe(min);
    expect(Particle.quantizeGray(min + step * 0.51)).toBe(min + step);
    expect(Particle.quantizeGray(-100)).toBe(min);
    expect(Particle.quantizeGray(1000)).toBe(max);
  });

  it("yields a small, bounded set of colors over many random draws", () => {
    const rng = new RNG(123);
    const seen = new Set();
    for (let i = 0; i < 5000; i++) {
      seen.add(
        Particle.quantizeGray(
          rng.range(CONFIG.EXPLOSION.PARTICLE_GRAY_MIN, CONFIG.EXPLOSION.PARTICLE_GRAY_MAX)
        )
      );
    }
    const expectedBuckets =
      Math.floor(
        (CONFIG.EXPLOSION.PARTICLE_GRAY_MAX - CONFIG.EXPLOSION.PARTICLE_GRAY_MIN) /
          CONFIG.EXPLOSION.PARTICLE_GRAY_STEP
      ) + 1;
    expect(seen.size).toBeLessThanOrEqual(expectedBuckets);
    for (const g of seen) expect(Number.isInteger(g)).toBe(true);
  });
});

describe("GameFactories.createExplosion particle colors", () => {
  function makeGame(seed = 42) {
    return /** @type {any} */ ({
      rng: new RNG(seed),
      particles: [],
      explosions: [],
      particlePool: new ObjectPool(
        (x, y, vx, vy, life, maxLife, size, color) =>
          new Particle(x, y, vx, vy, life, maxLife, size, color),
        undefined,
        { maxSize: 64 }
      ),
      explosionPool: {
        acquire: (/** @type {any[]} */ ...args) => ({ args }),
        release() {},
      },
      _performanceParticleMultiplier: 1,
      _particleBudget: Number.POSITIVE_INFINITY,
    });
  }

  it("uses only palette colors (bounded warm spark set)", () => {
    const game = makeGame();
    for (let i = 0; i < 20; i++) GameFactories.createExplosion(game, 100, 100);
    const colors = new Set(game.particles.map((/** @type {any} */ p) => p.color));
    expect(colors.size).toBeLessThanOrEqual(9);
    for (const c of colors) expect(c).toMatch(/^hsl\(\d+, 100%, \d+%\)$/);
  });

  it("consumes the RNG identically for identical seeds (deterministic kinematics)", () => {
    const a = makeGame(7);
    const b = makeGame(7);
    GameFactories.createExplosion(a, 50, 60);
    GameFactories.createExplosion(b, 50, 60);
    expect(a.particles.map((/** @type {any} */ p) => [p.vx, p.vy, p.size, p.color])).toEqual(
      b.particles.map((/** @type {any} */ p) => [p.vx, p.vy, p.size, p.color])
    );
    expect(a.rng.nextFloat()).toBe(b.rng.nextFloat());
  });
});

describe("Particle sprite resolution", () => {
  it("resolves its sprite reference at construction and on reset (null outside a canvas env)", () => {
    const p = new Particle(0, 0, 0, 0, 1, 1, 2, "#999");
    // Node test env has no canvas: the fallback path must remain functional.
    expect(p._sprite).toBeNull();
    p.reset(1, 1, 0, 0, 1, 1, 3, "#fff");
    expect(p._sprite).toBeNull();
    expect(p.size).toBe(3);
    expect(p.color).toBe("#fff");
  });

  it("preloadSprites tolerates environments without canvas support", () => {
    expect(() => Particle.preloadSprites()).not.toThrow();
  });
});
