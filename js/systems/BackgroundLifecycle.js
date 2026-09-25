// @ts-nocheck
import { CONFIG } from "../constants.js";
import { BackgroundManager } from "../managers/BackgroundManager.js";
import { getGameContext, fillGameContext } from "../core/GameContext.js";
import { RNG } from "../utils/RNG.js";
/** @typedef {import('../game.js').AIHorizon} AIHorizon */

/**
 * Per-game reusable draw snapshot so the per-frame background draw allocates nothing.
 * @type {WeakMap<object, import('../core/GameContext.js').GameContext & { suppressNebula?: boolean }>}
 */
const DRAW_CONTEXTS = new WeakMap();

/**
 * Initialize background layers (nebula configs + starfield) using current game context.
 *
 * Creates or regenerates the procedural background elements based on current view dimensions,
 * platform detection, and performance settings. Skips reinitialization during game over state
 * if backgrounds already exist to preserve visual continuity.
 *
 * Behavior:
 *  - Builds GameContext snapshot with current performance flags (_starfieldScale, _isLowPowerMode).
 *  - Generates fresh RNG seed if not provided via URL parameter for varied backgrounds.
 *  - Delegates to BackgroundManager.init for actual nebula and starfield generation.
 *
 * Side Effects:
 *  - Mutates game.nebulaConfigs and game.starField with new background data.
 *
 * @param {AIHorizon} game Game instance to initialize backgrounds for.
 * @param {{ preservePalette?: boolean }} [options] Optional settings.
 *   preservePalette: If true, keeps current nebula palette instead of flipping (for performance adjustments).
 */
export function initBackgroundLifecycle(game, options = {}) {
  try {
    const isGameOver =
      game && game.state && typeof game.state.isGameOver === "function" && game.state.isGameOver();
    if (isGameOver && game.nebulaConfigs && game.starField) {
      return;
    }
  } catch {
    /* ignore state checks; fall through to init */
  }
  const ctx = getGameContext(game);
  ctx.starfieldScale = game._starfieldScale;
  ctx.isLowPower = game._isLowPowerMode;
  // Layout generation is part of the seeded run (it happens at deterministic points); only the
  // per-frame draw path uses the visual RNG.
  ctx.rng = game.rng;
  if (options.preservePalette === true) {
    ctx.preservePalette = true;
  }
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(CONFIG.RNG.SEED_PARAM)) {
      let seed = (Date.now() >>> 0) ^ 0;
      try {
        if (typeof performance !== "undefined" && typeof performance.now === "function") {
          seed = (seed ^ (Math.floor(performance.now()) & 0xffffffff)) >>> 0;
        }
      } catch {
        /* ignore */
      }
      seed = (seed ^ ((Math.random() * 0xffffffff) >>> 0)) >>> 0;
      ctx.rng = new RNG(seed);
    }
  } catch {
    ctx.rng = new RNG();
  }
  const { nebulaConfigs, starField } = BackgroundManager.init(ctx);
  if (nebulaConfigs) game.nebulaConfigs = nebulaConfigs;
  game.starField = starField;
}

/**
 * Apply the current performance tier to the existing background without regenerating it.
 *
 * Adjusts starfield density in place (append/truncate) using the visual RNG, so a tier change
 * mid-game neither re-rolls the sky nor touches the simulation RNG. No-op before the background
 * exists (startGame initialises it with the tier already applied).
 *
 * @param {AIHorizon} game Game instance whose `starField` should reflect `_starfieldScale`.
 */
export function adjustBackgroundQuality(game) {
  if (!game || !game.starField || !game.view) return;
  BackgroundManager.setStarfieldDensity({
    view: game.view,
    isMobile: !!game._isMobile,
    starfieldScale: game._starfieldScale,
    rng: game.visualRng || game.rng,
    background: { starField: game.starField },
  });
}

/**
 * Draw only the background layers (nebula and starfield) for the current frame.
 *
 * Refreshes a per-game GameContext snapshot in place (no per-frame allocation) and delegates to
 * BackgroundManager.draw for actual rendering. Supports optional nebula suppression for
 * performance or visual effect purposes.
 *
 * @param {AIHorizon} game Game instance containing background data and rendering context.
 * @param {{ suppressNebula?: boolean }} [options] Optional rendering flags.
 *   suppressNebula: If true, skips nebula layer rendering (useful during transitions).
 */
export function drawBackgroundLifecycle(game, options) {
  let ctx = DRAW_CONTEXTS.get(game);
  if (!ctx) {
    ctx = getGameContext(game);
    DRAW_CONTEXTS.set(game, ctx);
  } else {
    fillGameContext(game, ctx);
  }
  ctx.suppressNebula = !!(options && options.suppressNebula);
  BackgroundManager.draw(/** @type {any} */ (ctx));
}
