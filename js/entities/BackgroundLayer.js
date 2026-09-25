import { CONFIG } from "../constants.js";
import { Background } from "./Background.js";
import { Nebula } from "./Nebula.js";

/**
 * BackgroundLayer – cached, reduced-resolution composite of the space gradient and nebula glow.
 *
 * Why:
 *  - The nebula is ~30 large additive-blended quads covering the screen several times over; at
 *    device pixel ratios above 1 that fill rate dominates GPU time. Both the gradient and the
 *    nebula are very low-frequency content, so rendering them into an offscreen canvas at
 *    `CONFIG.NEBULA.LAYER_SCALE` of the logical size and upscaling with bilinear filtering is
 *    visually indistinguishable while costing a small fraction of the pixels.
 *  - The nebula drifts slowly (a few px/s), so the layer is only re-rendered every
 *    `CONFIG.NEBULA.LAYER_REFRESH_FRAMES` frames (or immediately when the configs, visibility, or
 *    viewport change). Every frame then composites the layer with a single full-screen drawImage,
 *    which also replaces the separate full-screen gradient fill.
 *
 * Contract:
 *  - `draw` returns false when no offscreen canvas can be created (non-browser environments);
 *    callers must then fall back to drawing the gradient and nebula directly.
 *  - Pure render cache: never mutates nebula configs.
 */
export class BackgroundLayer {
  /**
   * @param {{ scale?: number, refreshFrames?: number }} [opts]
   *  scale: layer resolution relative to the logical viewport (0 < scale <= 1).
   *  refreshFrames: re-render cadence in frames (>= 1).
   */
  constructor(opts = {}) {
    const cfg = CONFIG.NEBULA || {};
    const scale = typeof opts.scale === "number" ? opts.scale : cfg.LAYER_SCALE;
    this._scale = scale > 0 && scale <= 1 ? scale : 0.5;
    const refresh =
      typeof opts.refreshFrames === "number" ? opts.refreshFrames : cfg.LAYER_REFRESH_FRAMES;
    this._refreshFrames = Math.max(1, refresh | 0 || 1);
    /** @private @type {OffscreenCanvas | HTMLCanvasElement | null} */ this._canvas = null;
    /** @private @type {OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null} */
    this._ctx = null;
    /** @private */ this._width = 0;
    /** @private */ this._height = 0;
    /** @private */ this._frame = 0;
    /** @private */ this._renders = 0;
    /** @private @type {any} */ this._lastConfigs = undefined;
    /** @private */ this._lastShowNebula = false;
    /** @private */ this._unavailable = false;
  }

  /** Number of times the layer has been re-rendered (diagnostics / tests). */
  get renders() {
    return this._renders;
  }

  /**
   * Composite the cached gradient + nebula layer onto `ctx`, re-rendering it when stale.
   * @param {CanvasRenderingContext2D} ctx Main 2D context (logical coordinate space).
   * @param {number} width Logical viewport width.
   * @param {number} height Logical viewport height.
   * @param {any[] | undefined} nebulaConfigs Nebula runtime configs (may be undefined).
   * @param {boolean} showNebula Whether the nebula should be visible this frame.
   * @returns {boolean} False when the layer is unavailable and the caller must draw directly.
   */
  draw(ctx, width, height, nebulaConfigs, showNebula) {
    if (!(width > 0 && height > 0)) return false;
    if (!this._ensureCanvas(width, height)) return false;
    const configsChanged = showNebula && nebulaConfigs !== this._lastConfigs;
    const visibilityChanged = showNebula !== this._lastShowNebula;
    const cadenceDue = this._frame % this._refreshFrames === 0;
    if (this._renders === 0 || configsChanged || visibilityChanged || (showNebula && cadenceDue)) {
      this._render(width, height, nebulaConfigs, showNebula);
    }
    this._frame++;
    ctx.drawImage(/** @type {any} */ (this._canvas), 0, 0, width, height);
    return true;
  }

  /**
   * Force a re-render on the next draw (e.g. after a viewport or palette change).
   */
  invalidate() {
    this._renders = 0;
  }

  /**
   * @param {number} width
   * @param {number} height
   * @param {any[] | undefined} nebulaConfigs
   * @param {boolean} showNebula
   * @private
   */
  _render(width, height, nebulaConfigs, showNebula) {
    const lctx = /** @type {any} */ (this._ctx);
    const s = this._scale;
    lctx.setTransform(s, 0, 0, s, 0, 0);
    Background.draw(lctx, width, height);
    if (showNebula && nebulaConfigs && nebulaConfigs.length) Nebula.draw(lctx, nebulaConfigs);
    this._lastConfigs = nebulaConfigs;
    this._lastShowNebula = showNebula;
    this._renders++;
  }

  /**
   * Create or resize the offscreen canvas to match the logical viewport at layer scale.
   * @param {number} width
   * @param {number} height
   * @returns {boolean}
   * @private
   */
  _ensureCanvas(width, height) {
    if (this._unavailable) return false;
    const w = Math.max(1, Math.ceil(width * this._scale));
    const h = Math.max(1, Math.ceil(height * this._scale));
    if (this._canvas && this._ctx && this._width === w && this._height === h) return true;
    if (!this._canvas) {
      if (typeof OffscreenCanvas === "function") {
        this._canvas = new OffscreenCanvas(w, h);
      } else if (typeof document !== "undefined") {
        this._canvas = document.createElement("canvas");
      } else {
        this._unavailable = true;
        return false;
      }
    }
    this._canvas.width = w;
    this._canvas.height = h;
    this._ctx = /** @type {any} */ (this._canvas.getContext("2d"));
    if (!this._ctx) {
      this._unavailable = true;
      return false;
    }
    this._width = w;
    this._height = h;
    this._renders = 0;
    return true;
  }
}
