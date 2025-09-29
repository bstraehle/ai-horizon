import { CONFIG } from "../constants.js";
import { initBackgroundLifecycle } from "../systems/BackgroundLifecycle.js";
/** @typedef {import('../game.js').AIHorizon} AIHorizon */

/**
 * Apply performance profile mutations to the game instance.
 * Externalized from game.js to isolate tuning logic.
 * Mirrors previous private method _applyPerformanceProfile.
 * @param {AIHorizon} game
 * @param {number} level
 * @param {{ reinitialize?: boolean, force?: boolean, initial?: boolean, averageFrameMs?: number }} [meta]
 */
export function applyPerformanceProfile(game, level, meta = {}) {
  const prevLevel = game._performanceLevel;
  const shouldForce = meta.force === true || meta.initial === true;
  if (!shouldForce && level === prevLevel) return;

  const perf = CONFIG.PERFORMANCE || {};
  const defaults = {
    dprMax: CONFIG.VIEW.DPR_MAX,
    starfieldScale: 1,
    spawnRateScale: 1,
    particleMultiplier: 1,
    particleBudget: Number.POSITIVE_INFINITY,
    engineTrailModulo: 1,
  };
  const levels = Array.isArray(perf.LEVELS) ? perf.LEVELS : [];
  const idx = Math.max(0, Math.min(level - 1, levels.length - 1));
  const profile = level > 0 && levels.length > 0 ? { ...defaults, ...levels[idx] } : defaults;
  const minStarfieldScale = Math.max(0, perf.MIN_STARFIELD_SCALE || 0.35);

  game._performanceLevel = level;
  game._starfieldScale = Math.max(minStarfieldScale, Math.min(1, profile.starfieldScale || 1));
  game._spawnRateScale = Math.max(0.35, Math.min(1, profile.spawnRateScale || 1));
  game._performanceParticleMultiplier = Math.max(0.1, Math.min(1, profile.particleMultiplier || 1));
  game._particleBudget = Number.isFinite(profile.particleBudget)
    ? Math.max(200, profile.particleBudget)
    : Number.POSITIVE_INFINITY;
  const overrideDpr = typeof profile.dprMax === "number" ? Math.max(0.75, profile.dprMax) : null;
  game._dprOverride = level > 0 ? overrideDpr : null;
  game._engineTrailModulo = Math.max(1, Math.round(profile.engineTrailModulo || 1));
  game._isLowPowerMode = level > 0;
  game._engineTrailStep = 0;

  if (game.particles && game.particlePool && game.particles.length > game._particleBudget) {
    const excess = game.particles.splice(game._particleBudget);
    for (const particle of excess) {
      game.particlePool.release(particle);
    }
  }

  if (meta.reinitialize !== false) {
    try {
      game.resizeCanvas();
    } catch {
      /* ignore */
    }
    try {
      initBackgroundLifecycle(game);
    } catch {
      /* ignore */
    }
  }

  if (level !== prevLevel && typeof console !== "undefined" && console.info) {
    const avg = typeof meta.averageFrameMs === "number" ? meta.averageFrameMs.toFixed(1) : null;
    const suffix = avg ? ` (avg ${avg}ms)` : "";
    console.info(`[Performance] Adjusted to level ${level}${suffix}`);
  }
}
