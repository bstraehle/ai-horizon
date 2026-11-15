import { describe, test, expect, afterEach } from "vitest";
import { StarField } from "../js/entities/StarField.js";
import { BackgroundManager } from "../js/managers/BackgroundManager.js";
import { setReducedMotion } from "../js/utils/motion.js";
import { CONFIG } from "../js/constants.js";

// Basic mock RNG for deterministic tests
class MockRNG {
  constructor(vals = []) {
    this.vals = vals;
    this.i = 0;
  }
  nextFloat() {
    if (this.vals.length === 0) return 0.5;
    const v = this.vals[this.i++ % this.vals.length];
    return v;
  }
}

describe("Layered StarField", () => {
  test("returns layered structure when CONFIG.STARFIELD.LAYERS present", () => {
    const sf = StarField.init(800, 600, new MockRNG());
    expect(sf).toHaveProperty("layers");
    expect(Array.isArray(sf.layers)).toBe(true);
    // Count factors sum to ~1; allow some rounding differences
    const base = CONFIG.GAME.STARFIELD_COUNT;
    const declared = CONFIG.STARFIELD.LAYERS.reduce((sum, l) => sum + (l.countFactor || 1), 0);
    const totalStars = sf.layers.reduce((sum, l) => sum + l.stars.length, 0);
    // Expected approximate total = baseCount * sum(countFactor)
    expect(totalStars).toBeGreaterThan(0);
    expect(totalStars).toBeLessThanOrEqual(base * declared + CONFIG.STARFIELD.LAYERS.length); // rounding slack
  });

  test("layer stars have scaled properties", () => {
    const sf = StarField.init(400, 300, new MockRNG([0.1, 0.2, 0.3, 0.4, 0.5]));
    const layerDefs = CONFIG.STARFIELD.LAYERS;
    sf.layers.forEach((layer, idx) => {
      const def = layerDefs[idx];
      expect(layer.config.twinkleRate).toBe(def.twinkleRate || CONFIG.STARFIELD.TWINKLE_RATE);
      // Spot check one star size/speed scaling (all stars created with rng sequence)
      const star = layer.stars[0];
      expect(star.size).toBeGreaterThan(0);
      expect(star.speed).toBeGreaterThan(0);
    });
  });

  test("resize scales positions, size, speed", () => {
    const orig = StarField.init(200, 100, new MockRNG([0.1, 0.2, 0.3, 0.4, 0.5]));
    const resized = StarField.resize(orig, 200, 100, 400, 200);
    expect(resized.layers.length).toBe(orig.layers.length);
    const sx = 400 / 200;
    const sy = 200 / 100;
    const sAvg = (sx + sy) / 2;
    for (let i = 0; i < orig.layers.length; i++) {
      const oLayer = orig.layers[i];
      const rLayer = resized.layers[i];
      expect(rLayer.stars.length).toBe(oLayer.stars.length);
      for (let j = 0; j < oLayer.stars.length; j++) {
        const o = oLayer.stars[j];
        const r = rLayer.stars[j];
        expect(r.x).toBeCloseTo(o.x * sx, 5);
        expect(r.y).toBeCloseTo(o.y * sy, 5);
        expect(r.size).toBeCloseTo(Math.max(1, o.size * sAvg), 5);
        expect(r.speed).toBeCloseTo(o.speed * sAvg, 5);
      }
    }
  });
});

describe("Starfield drift in the finale", () => {
  const window = CONFIG.GAME.FINALE_BONUS_WINDOW_SECONDS;
  const { FINALE_SPEED_START: start, FINALE_SPEED_END: end } = CONFIG.STARFIELD;
  const speed = (timerRemaining, running = true) =>
    BackgroundManager.starfieldSpeed({ running, timerRemaining });

  afterEach(() => setReducedMotion(null));

  test("jumps as the finale begins and climbs until the timer runs out", () => {
    setReducedMotion(false);
    expect(speed(window + 0.1)).toBe(1);
    expect(speed(window)).toBeCloseTo(start, 9);
    expect(speed(window / 2)).toBeCloseTo((start + end) / 2, 9);
    expect(speed(0.001)).toBeCloseTo(end, 2);
  });

  test("stays at normal speed outside a running finale and under reduced motion", () => {
    setReducedMotion(false);
    expect(speed(0)).toBe(1);
    expect(speed(window / 2, false)).toBe(1);
    expect(BackgroundManager.starfieldSpeed({ running: true })).toBe(1);
    setReducedMotion(true);
    expect(speed(window / 2)).toBe(1);
  });

  test("moves the stars that much further per frame", () => {
    setReducedMotion(false);
    const noop = () => {};
    const gradient = () => ({ addColorStop: noop });
    const ctx = {
      canvas: { width: 800, height: 600 },
      save: noop,
      restore: noop,
      beginPath: noop,
      arc: noop,
      fill: noop,
      fillRect: noop,
      drawImage: noop,
      createRadialGradient: gradient,
      createLinearGradient: gradient,
      fillStyle: "",
      globalAlpha: 1,
    };
    const driftOf = (timerRemaining) => {
      const star = { x: 10, y: 10, size: 1, speed: 100, brightness: 1, twinkleOffset: 0 };
      BackgroundManager.draw({
        ctx,
        view: { width: 800, height: 600 },
        running: true,
        paused: false,
        animTime: 0,
        timeSec: 0,
        dtSec: 0.01,
        timerRemaining,
        background: { starField: [star] },
      });
      return star.y - 10;
    };
    expect(driftOf(window + 5)).toBeCloseTo(1, 9);
    expect(driftOf(window / 2)).toBeCloseTo((start + end) / 2, 9);
  });
});
