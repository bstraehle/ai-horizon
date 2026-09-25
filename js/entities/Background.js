import { CONFIG } from "../constants.js";

/**
 * Background – static utility for painting the deep-space field.
 *
 * Purpose:
 *  - Provide the base fill each frame before any parallax / entities render: a vertical
 *    gradient (CONFIG.COLORS.BACKGROUND TOP → MID → BOTTOM) plus a soft radial vignette that
 *    darkens the corners and pulls focus to the centre of play.
 *  - Centralize palette usage (CONFIG.COLORS.BACKGROUND) for theme adjustments.
 *
 * Design Notes:
 *  - No state retained apart from per-context gradient caches keyed on the view size.
 *  - Normally drawn into the cached low-resolution BackgroundLayer, so the two full-screen fills
 *    are not paid per frame.
 *
 * Failure Modes: none (guards not required; relies on valid ctx).
 */
export class Background {
  /** @type {WeakMap<CanvasRenderingContext2D, { width:number, height:number, gradient:CanvasGradient, vignette:CanvasGradient|null }>} */
  static _gradientCache = new WeakMap();
  /**
   * Paint the background gradient from TOP -> MID -> BOTTOM colors, then the vignette.
   *
   * Side Effects: mutates canvas drawing state (restored via save/restore).
   * Performance: two rect fills; negligible when routed through the cached background layer.
   *
   * @param {CanvasRenderingContext2D} ctx Target 2D context.
   * @param {number} width Canvas logical width.
   * @param {number} height Canvas logical height.
   */
  static draw(ctx, width, height) {
    ctx.save();
    let cache = Background._gradientCache.get(ctx);
    if (!cache || cache.width !== width || cache.height !== height) {
      const colors = CONFIG.COLORS.BACKGROUND;
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, colors.TOP);
      gradient.addColorStop(0.55, colors.MID);
      gradient.addColorStop(1, colors.BOTTOM);
      let vignette = null;
      if (colors.VIGNETTE && typeof ctx.createRadialGradient === "function") {
        const cx = width / 2;
        const cy = height * 0.45;
        const radius = Math.max(width, height) * 0.75;
        vignette = ctx.createRadialGradient(cx, cy, radius * 0.35, cx, cy, radius);
        vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
        vignette.addColorStop(1, colors.VIGNETTE);
      }
      cache = { width, height, gradient, vignette };
      Background._gradientCache.set(ctx, cache);
    }
    ctx.fillStyle = cache.gradient;
    ctx.fillRect(0, 0, width, height);
    if (cache.vignette) {
      ctx.fillStyle = cache.vignette;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.restore();
  }
}
