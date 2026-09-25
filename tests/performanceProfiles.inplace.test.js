// @ts-check
import { describe, it, expect, vi } from "vitest";
import { applyPerformanceProfile } from "../js/ui/PerformanceProfiles.js";
import { StarField } from "../js/entities/StarField.js";
import { CONFIG } from "../js/constants.js";

const rng = { nextFloat: () => 0.5 };

function makeGame(level = 0) {
  const starField = StarField.init(800, 600, rng, false, 1);
  return /** @type {any} */ ({
    _performanceLevel: level,
    _starfieldScale: 1,
    _spawnRateScale: 1,
    _performanceParticleMultiplier: 1,
    _particleBudget: Number.POSITIVE_INFINITY,
    _dprOverride: null,
    _engineTrailModulo: 1,
    _isLowPowerMode: false,
    _isMobile: false,
    _engineTrailStep: 0,
    particles: [],
    particlePool: { release() {} },
    resizeCanvas: vi.fn(),
    view: { width: 800, height: 600 },
    starField,
    nebulaConfigs: [{ x: 1 }],
    rng,
  });
}

/** @param {any} sf */
function totalStars(sf) {
  return sf.layers.reduce((/** @type {number} */ n, /** @type {any} */ l) => n + l.stars.length, 0);
}

describe("StarField.setDensity", () => {
  it("thins each layer in place, keeping the surviving stars untouched", () => {
    const sf = /** @type {any} */ (StarField.init(800, 600, rng, false, 1));
    const before = totalStars(sf);
    const firstStar = sf.layers[0].stars[0];
    StarField.setDensity(sf, 800, 600, rng, false, 0.5);
    const after = totalStars(sf);
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThanOrEqual(Math.floor(before * 0.5) - sf.layers.length);
    expect(sf.layers[0].stars[0]).toBe(firstStar);
  });

  it("thickens back to the full budget by appending, preserving existing stars", () => {
    const sf = /** @type {any} */ (StarField.init(800, 600, rng, false, 0.5));
    const kept = sf.layers.map((/** @type {any} */ l) => l.stars.slice());
    StarField.setDensity(sf, 800, 600, rng, false, 1);
    const full = /** @type {any} */ (StarField.init(800, 600, rng, false, 1));
    expect(totalStars(sf)).toBe(totalStars(full));
    sf.layers.forEach((/** @type {any} */ l, /** @type {number} */ i) => {
      kept[i].forEach((/** @type {any} */ s, /** @type {number} */ j) =>
        expect(l.stars[j]).toBe(s)
      );
      for (const s of l.stars) {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x).toBeLessThanOrEqual(800);
      }
    });
  });

  it("supports the legacy flat array shape and clamps to the minimum scale", () => {
    const flat = Array.from({ length: 40 }, () => ({
      x: 1,
      y: 1,
      size: 1,
      speed: 1,
      brightness: 1,
      twinkleOffset: 0,
    }));
    StarField.setDensity(flat, 800, 600, rng, false, 0.01);
    expect(flat.length).toBe(StarField.baseCount(false, CONFIG.PERFORMANCE.MIN_STARFIELD_SCALE));
  });

  it("uses the platform budget, not the low-power hint, for the base star count", () => {
    const desktop = /** @type {any} */ (StarField.init(800, 600, rng, false, 1));
    const mobile = /** @type {any} */ (StarField.init(800, 600, rng, true, 1));
    expect(totalStars(desktop)).toBeGreaterThan(totalStars(mobile));
  });
});

describe("applyPerformanceProfile in-place tier changes", () => {
  it("does not regenerate the background and thins the starfield in place", () => {
    const game = makeGame(0);
    const starField = game.starField;
    const nebula = game.nebulaConfigs;
    const before = totalStars(starField);
    applyPerformanceProfile(game, 2);
    expect(game.starField).toBe(starField);
    expect(game.nebulaConfigs).toBe(nebula);
    expect(totalStars(game.starField)).toBeLessThan(before);
    expect(game._isLowPowerMode).toBe(true);
  });

  it("resizes the canvas only when the DPR ceiling changes", () => {
    const game = makeGame(0);
    applyPerformanceProfile(game, 1);
    expect(game.resizeCanvas).toHaveBeenCalledTimes(1);
    // Force re-apply of the same level: DPR unchanged → no resize.
    applyPerformanceProfile(game, 1, { force: true });
    expect(game.resizeCanvas).toHaveBeenCalledTimes(1);
    applyPerformanceProfile(game, 0);
    expect(game.resizeCanvas).toHaveBeenCalledTimes(2);
    expect(game._dprOverride).toBeNull();
  });

  it("level 1 lowers resolution and effects but leaves spawn rates (gameplay) alone", () => {
    const game = makeGame(0);
    applyPerformanceProfile(game, 1, { reinitialize: false });
    expect(game._spawnRateScale).toBe(1);
    expect(game._dprOverride).toBeLessThan(CONFIG.VIEW.DPR_MAX);
    expect(game._performanceParticleMultiplier).toBeLessThan(1);
  });

  it("every tier's DPR ceiling sits below the desktop cap and decreases monotonically", () => {
    const levels = CONFIG.PERFORMANCE.LEVELS;
    let prev = CONFIG.VIEW.DPR_MAX;
    for (const lvl of levels) {
      expect(lvl.dprMax).toBeLessThan(prev);
      prev = lvl.dprMax;
    }
  });

  it("restores the full starfield when recovering to level 0", () => {
    const game = makeGame(0);
    const full = totalStars(game.starField);
    applyPerformanceProfile(game, 3);
    expect(totalStars(game.starField)).toBeLessThan(full);
    applyPerformanceProfile(game, 0);
    expect(totalStars(game.starField)).toBe(full);
  });
});
