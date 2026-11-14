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

  it("uses only palette colors (bounded gray spark set)", () => {
    const game = makeGame();
    for (let i = 0; i < 20; i++) GameFactories.createExplosion(game, 100, 100);
    const colors = new Set(game.particles.map((/** @type {any} */ p) => p.color));
    expect(colors.size).toBeLessThanOrEqual(9);
    for (const c of colors) expect(c).toMatch(/^hsl\(0, 0%, \d+%\)$/);
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

  const kinematics = (/** @type {any} */ p) => [p.vx, p.vy, p.size, p.color];

  it("adds a bigger blast's sparks from the visual RNG without shifting the game RNG", () => {
    const rock = makeGame(7);
    const bonus = makeGame(7);
    bonus.visualRng = new RNG(99);
    GameFactories.createExplosion(rock, 50, 60);
    GameFactories.createExplosion(bonus, 50, 60, "bonus", 100);
    const standard = rock.particles.length;
    const extra = bonus.particles.slice(standard);
    expect(extra.length).toBe(CONFIG.EXPLOSION.BLASTS.bonus.sparks);
    expect(bonus.particles.slice(0, standard).map(kinematics)).toEqual(
      rock.particles.map(kinematics)
    );
    expect(bonus.rng.nextFloat()).toBe(rock.rng.nextFloat());
    // Every other extra spark takes the run's accent colour; the rest stay in the gray palette.
    const accent = bonus.explosions[0].args[6];
    expect([CONFIG.COLORS.ACCENT.RED, CONFIG.COLORS.ACCENT.BLUE]).toContain(accent);
    expect(extra.filter((/** @type {any} */ p) => p.color === accent).length).toBe(
      Math.ceil(extra.length / 2)
    );
  });

  it("leaves the game RNG alone even without a visual RNG", () => {
    const rock = makeGame(7);
    const ship = makeGame(7);
    GameFactories.createExplosion(rock, 50, 60);
    GameFactories.createExplosion(ship, 50, 60, "ship");
    expect(ship.particles.length).toBeGreaterThan(rock.particles.length);
    expect(ship.rng.nextFloat()).toBe(rock.rng.nextFloat());
  });

  it("sizes the flash to what was destroyed, never smaller than a rock's", () => {
    const game = makeGame();
    game.visualRng = new RNG(1);
    const { SIZE, OFFSET, LIFE, BLASTS } = CONFIG.EXPLOSION;
    GameFactories.createExplosion(game, 200, 300);
    GameFactories.createExplosion(game, 200, 300, "planet", 80);
    GameFactories.createExplosion(game, 200, 300, "planet", 20);
    GameFactories.createExplosion(game, 200, 300, "bonus", 80);
    GameFactories.createExplosion(game, 200, 300, "ship");
    const [rock, planet, small, bonus, ship] = game.explosions.map(
      (/** @type {any} */ e) => e.args
    );
    expect(rock).toEqual([200 - OFFSET, 300 - OFFSET, SIZE, SIZE, LIFE, LIFE]);
    expect(planet).toEqual([160, 260, 80, 80, BLASTS.planet.life, BLASTS.planet.life, null]);
    expect(small.slice(2, 4)).toEqual([SIZE, SIZE]);
    expect(bonus.slice(0, 6)).toEqual([150, 250, 100, 100, BLASTS.bonus.life, BLASTS.bonus.life]);
    expect(ship.slice(2, 6)).toEqual([
      BLASTS.ship.size,
      BLASTS.ship.size,
      BLASTS.ship.life,
      BLASTS.ship.life,
    ]);
    expect(ship[6]).toBe(bonus[6]);
  });

  it("scales and caps the extra sparks with the performance tier", () => {
    const game = makeGame();
    game._performanceParticleMultiplier = 0.5;
    GameFactories.createExplosion(game, 0, 0, "planet", 80);
    const standard = Math.round(CONFIG.EXPLOSION.PARTICLE_COUNT * 0.5);
    expect(game.particles.length).toBe(
      standard + Math.round(CONFIG.EXPLOSION.BLASTS.planet.sparks * 0.5)
    );
    const capped = makeGame();
    capped._particleBudget = CONFIG.EXPLOSION.PARTICLE_COUNT + 3;
    GameFactories.createExplosion(capped, 0, 0, "planet", 80);
    expect(capped.particles.length).toBe(CONFIG.EXPLOSION.PARTICLE_COUNT + 3);
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
