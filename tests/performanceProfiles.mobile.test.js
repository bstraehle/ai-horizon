import { describe, expect, it } from "vitest";
import { CONFIG } from "../js/constants.js";
import { applyPerformanceProfile } from "../js/ui/PerformanceProfiles.js";

function createGameStub() {
  return {
    _performanceLevel: 0,
    _starfieldScale: 1,
    _spawnRateScale: 1,
    _performanceParticleMultiplier: 1,
    _particleBudget: Number.POSITIVE_INFINITY,
    _dprOverride: null,
    _engineTrailModulo: 1,
    _isLowPowerMode: false,
    _engineTrailStep: 0,
    particles: [],
    particlePool: { release() {} },
    resizeCanvas() {},
  };
}

describe("mobile performance profiles", () => {
  it("starts mobile sessions in a more conservative tier and lowers mobile render cost", () => {
    expect(CONFIG.PERFORMANCE.INITIAL_LEVEL_MOBILE).toBe(3);
    expect(CONFIG.VIEW.DPR_MOBILE_MAX).toBeLessThanOrEqual(1.2);

    const game = createGameStub();
    applyPerformanceProfile(game, 3, { reinitialize: false });

    expect(game._starfieldScale).toBeLessThanOrEqual(0.4);
    expect(game._particleBudget).toBeLessThanOrEqual(1000);
    expect(game._performanceParticleMultiplier).toBeLessThanOrEqual(0.4);
    expect(game._dprOverride).toBeLessThanOrEqual(1.0);
  });
});
