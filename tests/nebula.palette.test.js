import { describe, it, expect, beforeEach } from "vitest";
import { BackgroundManager } from "../js/managers/BackgroundManager.js";
import { CONFIG } from "../js/constants.js";

function createInitCtx({ running }) {
  return {
    view: { width: 800, height: 600 },
    running,
    isMobile: false,
    isLowPower: false,
    starfieldScale: 1,
    rng: { nextFloat: () => 0.5 },
  };
}

function collectColors(nebulaConfigs) {
  return nebulaConfigs.map((n) => `${n.color0}|${n.color1}`);
}

function redSet() {
  return new Set([
    `${CONFIG.COLORS.NEBULA.N1}|${CONFIG.COLORS.NEBULA.N1_OUT}`,
    `${CONFIG.COLORS.NEBULA.N2}|${CONFIG.COLORS.NEBULA.N2_OUT}`,
    `${CONFIG.COLORS.NEBULA.N3}|${CONFIG.COLORS.NEBULA.N3_OUT}`,
    `${CONFIG.COLORS.NEBULA.N4}|${CONFIG.COLORS.NEBULA.N4_OUT}`,
  ]);
}
function blueSet() {
  return new Set([
    `${CONFIG.COLORS.NEBULA_BLUE.B1}|${CONFIG.COLORS.NEBULA_BLUE.B1_OUT}`,
    `${CONFIG.COLORS.NEBULA_BLUE.B2}|${CONFIG.COLORS.NEBULA_BLUE.B2_OUT}`,
    `${CONFIG.COLORS.NEBULA_BLUE.B3}|${CONFIG.COLORS.NEBULA_BLUE.B3_OUT}`,
    `${CONFIG.COLORS.NEBULA_BLUE.B4}|${CONFIG.COLORS.NEBULA_BLUE.B4_OUT}`,
  ]);
}

describe("Nebula palette alternation", () => {
  beforeEach(() => {
    // reset flip-flop to a known start
    BackgroundManager._nebulaNextPalette = "red";
  });

  it("defaults first running game to red", () => {
    const ctx = createInitCtx({ running: true });
    const { nebulaConfigs } = BackgroundManager.init(ctx);
    const reds = redSet();
    for (const key of collectColors(nebulaConfigs)) {
      expect(reds.has(key)).toBe(true);
    }
  });

  it("alternates next running game to blue, then back to red", () => {
    // first game (red)
    let ctx = createInitCtx({ running: true });
    BackgroundManager.init(ctx);
    // second game (blue)
    ctx = createInitCtx({ running: true });
    let { nebulaConfigs } = BackgroundManager.init(ctx);
    const blues = blueSet();
    for (const key of collectColors(nebulaConfigs)) {
      expect(blues.has(key)).toBe(true);
    }
    // third game (red again)
    ctx = createInitCtx({ running: true });
    nebulaConfigs = BackgroundManager.init(ctx).nebulaConfigs;
    const reds = redSet();
    for (const key of collectColors(nebulaConfigs)) {
      expect(reds.has(key)).toBe(true);
    }
  });

  it("menu (not running) uses current palette without flipping", () => {
    // currently should be red
    let ctx = createInitCtx({ running: false });
    let { nebulaConfigs } = BackgroundManager.init(ctx);
    const reds = redSet();
    for (const key of collectColors(nebulaConfigs)) {
      expect(reds.has(key)).toBe(true);
    }
    // ensure next running is red (not flipped yet)
    ctx = createInitCtx({ running: true });
    nebulaConfigs = BackgroundManager.init(ctx).nebulaConfigs;
    for (const key of collectColors(nebulaConfigs)) {
      expect(reds.has(key)).toBe(true);
    }
  });
});
