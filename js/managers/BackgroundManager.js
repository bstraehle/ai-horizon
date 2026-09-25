import { CONFIG } from "../constants.js";
import { Background } from "../entities/Background.js";
import { BackgroundLayer } from "../entities/BackgroundLayer.js";
import { Nebula } from "../entities/Nebula.js";
import { StarField } from "../entities/StarField.js";

/**
 * Cached gradient + nebula layer per main context (see BackgroundLayer).
 * @type {WeakMap<object, BackgroundLayer>}
 */
const LAYERS = new WeakMap();
/** @typedef {import('../types.js').RNGLike} RNGLike */

/**
 * @typedef {Object} ViewSize
 * @property {number} width
 * @property {number} height
 */
/**
 * @typedef {Object} BackgroundInitContext
 * @property {ViewSize} view Canvas dimensions
 * @property {boolean} running True once gameplay has begun
 * @property {boolean} isMobile Device/mobile hint
 * @property {boolean} [isLowPower] Low power rendering hint
 * @property {number} [starfieldScale] Optional scale multiplier
 * @property {RNGLike} [rng] Optional deterministic RNG
 * @property {"red"|"blue"} [nebulaPalette] Optional palette override
 * @property {boolean} [preservePalette] If true, don't flip palette (for performance adjustments)
 */
/**
 * @typedef {Object} BackgroundResizeContext
 * @property {ViewSize} view New canvas dimensions
 * @property {{ nebulaConfigs?: any, starField?: any }} [background] Existing background state
 */
/**
 * @typedef {Object} BackgroundDrawContext
 * @property {CanvasRenderingContext2D} ctx 2D rendering context
 * @property {ViewSize} view Canvas dimensions
 * @property {boolean} running Whether gameplay started (nebula gating)
 * @property {boolean} paused If true freezes time-based animation deltas
 * @property {boolean} [gameOver]
 * @property {boolean} [suppressNebula] If true, skip drawing nebula even when otherwise visible
 * @property {number} animTime Accumulated animation time in ms
 * @property {number} [timeSec] Override absolute time in seconds
 * @property {number} [dtSec] Override frame delta in seconds
 * @property {{ nebulaConfigs?: any, starField: any }} background Pre-initialised background assets
 * @property {RNGLike} [rng]
 */
/**
 * @typedef {{ nebulaConfigs?: any, starField: any }} BackgroundState
 */

/**
 * BackgroundManager centralises creation, proportional resize and draw of the parallax background.
 * All methods are pure w.r.t their inputs (no mutation of passed objects) except for direct drawing
 * and `setStarfieldDensity`, which deliberately adjusts an existing starfield in place.
 *
 * Star budget follows the platform (`isMobile`); the low-power hint only affects nebula density,
 * so adaptive quality tiers scale the desktop starfield gradually rather than collapsing it to the
 * mobile budget.
 */
export class BackgroundManager {
  /**
   * Create background layers. Nebula is only generated after gameplay starts to avoid initial cost.
   * @param {BackgroundInitContext} ctxObj
   * @returns {BackgroundState}
   */
  static init(ctxObj) {
    const {
      view: { width, height },
      running,
      isMobile,
      isLowPower,
      starfieldScale,
      rng,
      nebulaPalette,
      preservePalette,
    } = ctxObj;
    const mobileHint = isMobile || !!isLowPower;
    const scale = typeof starfieldScale === "number" ? starfieldScale : 1;
    const state = {};
    if (running) {
      let palette;
      if (typeof nebulaPalette === "string") {
        palette = nebulaPalette;
      } else if (preservePalette === true) {
        palette = BackgroundManager._nebulaCurrentPalette || "red";
      } else {
        palette = BackgroundManager._getAndFlipNebulaPalette();
      }
      BackgroundManager._nebulaCurrentPalette = palette;
      state.nebulaConfigs = Nebula.init(width, height, mobileHint, rng, palette);
    } else {
      const palette =
        typeof nebulaPalette === "string"
          ? nebulaPalette
          : BackgroundManager._nebulaNextPalette || "red";
      BackgroundManager._nebulaCurrentPalette = palette;
      state.nebulaConfigs = Nebula.init(width, height, mobileHint, rng, palette);
    }
    state.starField = StarField.init(width, height, rng, isMobile, scale);
    return state;
  }

  /**
   * Adjust starfield density in place for a new quality scale (adaptive performance tiers).
   * Unlike `init`, nothing is regenerated: existing stars keep their positions.
   * @param {{ view: ViewSize, isMobile: boolean, starfieldScale?: number, rng?: RNGLike, background: { starField: any } }} ctxObj
   */
  static setStarfieldDensity(ctxObj) {
    const { view, isMobile, starfieldScale, rng, background } = ctxObj;
    if (!background || !background.starField || !view) return;
    const scale = typeof starfieldScale === "number" ? starfieldScale : 1;
    StarField.setDensity(background.starField, view.width, view.height, rng, isMobile, scale);
  }

  /**
   * Proportionally resize existing background layers to new viewport.
   * Fails soft per-layer: on error preserves previous data for that layer.
   * @param {BackgroundResizeContext & { rng?: RNGLike }} ctxObj
   * @param {ViewSize} prevView Previous view dimensions
   * @returns {BackgroundState | null}
   */
  static resize(ctxObj, prevView) {
    const { view, background } = ctxObj;
    if (!view || !prevView) return null;
    const prevW = prevView.width || 0;
    const prevH = prevView.height || 0;
    const newW = view.width || 0;
    const newH = view.height || 0;
    if (!background) return null;
    const out = {};
    if (background.nebulaConfigs) {
      try {
        out.nebulaConfigs = Nebula.resize(background.nebulaConfigs, prevW, prevH, newW, newH);
      } catch (_e) {
        out.nebulaConfigs = background.nebulaConfigs;
      }
    }
    if (background.starField) {
      try {
        out.starField = StarField.resize(background.starField, prevW, prevH, newW, newH);
      } catch (_e) {
        out.starField = background.starField;
      }
    }
    return out;
  }

  /**
   * Draw all background layers. Paused state freezes star field animation time.
   *
   * The gradient and nebula come from a cached reduced-resolution layer (one drawImage per frame,
   * re-rendered every few frames); when no offscreen canvas is available they are drawn directly.
   * The starfield moves quickly and is always drawn per frame on the main context.
   * @param {BackgroundDrawContext} ctxObj
   */
  static draw(ctxObj) {
    const {
      ctx,
      view: { width, height },
      paused,
      animTime,
      suppressNebula,
      background: { nebulaConfigs, starField },
    } = ctxObj;
    const showNebula = !!(
      !suppressNebula &&
      nebulaConfigs &&
      (ctxObj.running || ctxObj.paused || ctxObj.gameOver)
    );
    const layer = BackgroundManager._layerFor(ctx);
    if (!layer || !layer.draw(ctx, width, height, nebulaConfigs, showNebula)) {
      Background.draw(ctx, width, height);
      if (showNebula) Nebula.draw(ctx, nebulaConfigs);
    }
    const timeSec = typeof ctxObj.timeSec === "number" ? ctxObj.timeSec : (animTime || 0) / 1000;
    const dtSec = typeof ctxObj.dtSec === "number" ? ctxObj.dtSec : CONFIG.TIME.DEFAULT_DT;
    StarField.draw(ctx, width, height, starField, timeSec, paused, dtSec, ctxObj.rng);
  }

  /**
   * Get (or lazily create) the cached background layer bound to a main context.
   * @param {CanvasRenderingContext2D} ctx
   * @returns {BackgroundLayer | null}
   * @private
   */
  static _layerFor(ctx) {
    if (!ctx || typeof ctx !== "object") return null;
    let layer = LAYERS.get(ctx);
    if (!layer) {
      layer = new BackgroundLayer();
      LAYERS.set(ctx, layer);
    }
    return layer;
  }
}

/** @type {"red"|"blue"} */
BackgroundManager._nebulaNextPalette = "red";
/** @type {"red"|"blue"} */
BackgroundManager._nebulaCurrentPalette = "red";

/**
 * Get the palette currently used for the nebula.
 * @returns {"red"|"blue"}
 */
BackgroundManager.getCurrentNebulaPalette = function () {
  return this._nebulaCurrentPalette === "blue" ? "blue" : "red";
};

/**
 * Resolve the current nebula palette and toggle for next game.
 * @param {"red"|"blue"} [override]
 * @returns {"red"|"blue"}
 */
BackgroundManager._getAndFlipNebulaPalette = function (override) {
  let palette = override === "red" || override === "blue" ? override : this._nebulaNextPalette;
  if (palette !== "red" && palette !== "blue") palette = "red";
  this._nebulaNextPalette = palette === "red" ? "blue" : "red";
  return palette;
};
