import { CONFIG } from "../constants.js";
import { Background } from "../entities/Background.js";
import { Nebula } from "../entities/Nebula.js";
import { StarField } from "../entities/StarField.js";
/** @typedef {import('../types.js').RNGLike} RNGLike */

/** Handles background initialization, resizing, and drawing. */
export class BackgroundManager {
  /**
   * Initialize background components using a GameContext-like object.
   * @param {{ view:{width:number,height:number}, running:boolean, isMobile:boolean, rng?: RNGLike }} ctxObj
   * @returns {{ nebulaConfigs?: any, starField: any }}
   */
  static init(ctxObj) {
    const {
      view: { width, height },
      running,
      isMobile,
      rng,
    } = ctxObj;
    const state = {};
    if (running) {
      state.nebulaConfigs = Nebula.init(width, height, isMobile, rng);
    }
    state.starField = StarField.init(width, height, rng, isMobile);
    return state;
  }

  /**
   * Resize existing background state to match new canvas dimensions.
   * @param {{ view:{width:number,height:number}, running:boolean, isMobile:boolean, rng?: RNGLike, background?:{nebulaConfigs?:any, starField:any} }} ctxObj
   * @param {{width:number,height:number}} prevView
   * @returns {{ nebulaConfigs?: any, starField?: any } | null}
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
    // Scale nebula positions/radii
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
   * Draw the background using a GameContext-like object.
   * @param {{ ctx: CanvasRenderingContext2D, view: {width:number,height:number}, running:boolean, paused:boolean, animTime:number, timeSec?:number, dtSec?:number, background:{nebulaConfigs?:any, starField:any}, rng?: RNGLike, timerRemaining?:number, timerSeconds?:number }} ctxObj
   */
  static draw(ctxObj) {
    const {
      ctx,
      view: { width, height },
      paused,
      animTime,
      background: { nebulaConfigs, starField },
      timerRemaining,
      timerSeconds,
    } = ctxObj;
    Background.draw(ctx, width, height);
    // Draw nebula only during active gameplay
    if (nebulaConfigs && ctxObj.running) {
      let themeProgress = 0;
      if (
        typeof timerRemaining === "number" &&
        typeof timerSeconds === "number" &&
        timerSeconds > 0
      ) {
        const elapsed = timerSeconds - Math.max(0, timerRemaining);
        themeProgress = Math.min(1, Math.max(0, elapsed / timerSeconds));
      }
      Nebula.draw(ctx, nebulaConfigs, themeProgress);
    }
    const timeSec = typeof ctxObj.timeSec === "number" ? ctxObj.timeSec : (animTime || 0) / 1000;
    const dtSec = typeof ctxObj.dtSec === "number" ? ctxObj.dtSec : CONFIG.TIME.DEFAULT_DT;
    // Freeze stars while paused
    StarField.draw(ctx, width, height, starField, timeSec, paused, dtSec, ctxObj.rng);
  }
}
