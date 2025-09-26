import { CONFIG } from "../constants.js";

/**
 * Background – static utility for painting the vertical space gradient.
 *
 * Purpose:
 *  - Provide a single inexpensive fill each frame before any parallax / entities render.
 *  - Centralize palette usage (CONFIG.COLORS.BACKGROUND) for theme adjustments.
 *
 * Design Notes:
 *  - No state retained; stateless pure helper aside from canvas side-effects.
 *  - Gradient recreated each call (fast enough for typical canvas sizes; could be cached if profiling warrants).
 *
 * Failure Modes: none (guards not required; relies on valid ctx).
 */
export class Background {
  /** @type {WeakMap<CanvasRenderingContext2D, { width:number, height:number, gradient:CanvasGradient }>} */
  static _gradientCache = new WeakMap();
  /**
   * Paint the background gradient from TOP -> MID -> BOTTOM colors.
   *
   * Side Effects: mutates canvas drawing state (restored via save/restore).
   * Performance: single rect fill; negligible vs entity rendering.
   *
   * @param {CanvasRenderingContext2D} ctx Target 2D context.
   * @param {number} width Canvas logical width.
   * @param {number} height Canvas logical height.
   */
  static draw(ctx, width, height) {
    ctx.save();
    let cache = Background._gradientCache.get(ctx);
    if (!cache || cache.width !== width || cache.height !== height) {
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, CONFIG.COLORS.BACKGROUND.TOP);
      gradient.addColorStop(0.5, CONFIG.COLORS.BACKGROUND.MID);
      gradient.addColorStop(1, CONFIG.COLORS.BACKGROUND.BOTTOM);
      cache = { width, height, gradient };
      Background._gradientCache.set(ctx, cache);
    }
    ctx.fillStyle = cache.gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}
