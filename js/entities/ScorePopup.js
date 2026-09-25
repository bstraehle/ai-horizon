import { SpriteCache } from "../utils/SpriteCache.js";
import { isOnscreen } from "../utils/bounds.js";

/**
 * @typedef {Object} ScorePopupData
 * @property {string} text
 * @property {number} x
 * @property {number} y
 * @property {number} life Seconds alive (render-side clock)
 * @property {number} maxLife Lifetime in seconds
 * @property {number} [fontSize]
 * @property {string} [fontWeight]
 * @property {boolean} [glow]
 * @property {string} [glowColor]
 * @property {number} [glowBlur]
 * @property {string} [color]
 * @property {string|null} [stroke]
 * @property {PopupSprite|null} [_sprite] Render cache
 */

/** @typedef {{ canvas: OffscreenCanvas | HTMLCanvasElement, width: number, height: number }} PopupSprite */

const FONT_FAMILY = "system-ui, -apple-system, Segoe UI, Roboto, Arial";
/** Vertical rise (px) over a popup's lifetime. */
const RISE_PX = 20;

/**
 * ScorePopup – transient "+N" text that rises and fades above a scoring event.
 *
 * Rendering / Performance:
 *  - The styled text (glow via shadowBlur, stroke, fill) is rasterized once into a small sprite,
 *    keyed by its style + device pixel ratio and shared by identical popups (e.g. every "+100").
 *    Per frame the popup is a single `drawImage` with `globalAlpha`; previously each popup ran a
 *    save/restore, font set, and a shadow-blurred stroke + fill pass on the main canvas every frame.
 *  - Sprites are rendered at the device pixel ratio so text stays crisp on HiDPI canvases.
 *  - Falls back to direct text drawing when no offscreen canvas is available.
 *  - Lifetime advances with the real frame delta (refresh-rate independent).
 */
export class ScorePopup {
  /**
   * Advance, cull (in place, order-preserving) and draw all popups.
   * @param {CanvasRenderingContext2D} ctx Main 2D context.
   * @param {ScorePopupData[]} popups Popup list (mutated: expired entries removed).
   * @param {number} dtSec Real frame delta in seconds.
   * @param {number} viewWidth Logical view width for culling.
   * @param {number} viewHeight Logical view height for culling.
   * @param {number} [dpr=1] Device pixel ratio used to rasterize crisp sprites.
   */
  static drawAll(ctx, popups, dtSec, viewWidth, viewHeight, dpr = 1) {
    let w = 0;
    for (let r = 0, n = popups.length; r < n; r++) {
      const p = popups[r];
      p.life += dtSec;
      if (p.life >= p.maxLife) continue;
      popups[w++] = p;
      if (!isOnscreen(p, viewWidth, viewHeight, 48)) continue;
      const t = p.life / p.maxLife;
      const rise = -RISE_PX * t;
      const sprite = ScorePopup._spriteFor(p, dpr);
      if (sprite) {
        ctx.globalAlpha = 1 - t;
        ctx.drawImage(
          sprite.canvas,
          p.x - sprite.width / 2,
          p.y + rise - sprite.height / 2,
          sprite.width,
          sprite.height
        );
        continue;
      }
      ScorePopup._drawDirect(ctx, p, rise, 1 - t);
    }
    ctx.globalAlpha = 1;
    if (w !== popups.length) popups.length = w;
  }

  /**
   * Resolve (and cache on the popup) its rasterized sprite.
   * @param {ScorePopupData} p
   * @param {number} dpr
   * @returns {PopupSprite|null}
   * @private
   */
  static _spriteFor(p, dpr) {
    if (p._sprite !== undefined) return p._sprite;
    const sprite = ScorePopup._getSprite(p, dpr);
    p._sprite = sprite;
    return sprite;
  }

  /**
   * Rasterize the styled text into a shared sprite (bounded cache keyed by style + dpr).
   * @param {ScorePopupData} p
   * @param {number} dpr
   * @returns {PopupSprite|null}
   * @private
   */
  static _getSprite(p, dpr) {
    const scale = Number.isFinite(dpr) && dpr > 0 ? Math.min(3, dpr) : 1;
    const fontSize = p.fontSize || 18;
    const fontWeight = p.fontWeight || "700";
    const color = p.color || "#fff";
    const glowBlur = p.glow ? p.glowBlur || 12 : 0;
    const glowColor = p.glow ? p.glowColor || color : "";
    const stroke = p.stroke || "";
    const key = `${p.text}|${color}|${fontSize}|${fontWeight}|${glowColor}|${glowBlur}|${stroke}|${scale.toFixed(2)}`;
    if (!ScorePopup._spriteCache) ScorePopup._spriteCache = new SpriteCache(64);
    const cached = ScorePopup._spriteCache.get(key);
    if (cached) return cached;

    const lineWidth = stroke ? ScorePopup._strokeWidth(fontSize) : 0;
    const pad = Math.ceil(glowBlur + lineWidth + 2);
    const font = `${fontWeight} ${fontSize}px ${FONT_FAMILY}`;
    const measured = ScorePopup._measure(p.text, font, scale);
    if (measured === null) return null;
    const width = Math.ceil(measured) + pad * 2;
    const height = Math.ceil(fontSize * 1.4) + pad * 2;
    const canvas = ScorePopup._createCanvas(Math.ceil(width * scale), Math.ceil(height * scale));
    if (!canvas) return null;
    const off = /** @type {any} */ (canvas.getContext("2d"));
    if (!off) return null;
    off.scale(scale, scale);
    off.font = font;
    off.textAlign = "center";
    off.textBaseline = "middle";
    if (glowBlur > 0) {
      off.shadowColor = glowColor;
      off.shadowBlur = glowBlur;
    }
    if (stroke) {
      off.strokeStyle = stroke;
      off.lineWidth = lineWidth;
      off.strokeText(p.text, width / 2, height / 2);
    }
    off.fillStyle = color;
    off.fillText(p.text, width / 2, height / 2);
    return ScorePopup._spriteCache.set(key, { canvas, width, height });
  }

  /**
   * Direct (uncached) drawing path used when no offscreen canvas exists.
   * @param {CanvasRenderingContext2D} ctx
   * @param {ScorePopupData} p
   * @param {number} rise
   * @param {number} alpha
   * @private
   */
  static _drawDirect(ctx, p, rise, alpha) {
    const fontSize = p.fontSize || 18;
    const fontWeight = p.fontWeight || "700";
    ctx.save();
    ctx.font = `${fontWeight} ${fontSize}px ${FONT_FAMILY}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = alpha;
    if (p.glow) {
      ctx.shadowColor = p.glowColor || p.color || "#fff";
      ctx.shadowBlur = p.glowBlur || 12;
    }
    if (p.stroke) {
      ctx.strokeStyle = p.stroke;
      ctx.lineWidth = ScorePopup._strokeWidth(fontSize);
      ctx.strokeText(p.text, p.x, p.y + rise);
    }
    ctx.fillStyle = p.color || "#fff";
    ctx.fillText(p.text, p.x, p.y + rise);
    ctx.restore();
  }

  /**
   * Outline width used for stroked popups (odd integer >= 1, growing with font size).
   * @param {number} fontSize
   * @returns {number}
   * @private
   */
  static _strokeWidth(fontSize) {
    return Math.max(1, (fontSize / 14) | 1);
  }

  /**
   * Measure text width using a shared scratch context; null when unavailable.
   * @param {string} text
   * @param {string} font
   * @param {number} scale
   * @returns {number|null}
   * @private
   */
  static _measure(text, font, scale) {
    if (!ScorePopup._measureCtx) {
      const c = ScorePopup._createCanvas(Math.ceil(8 * scale), Math.ceil(8 * scale));
      ScorePopup._measureCtx = c ? /** @type {any} */ (c.getContext("2d")) : null;
    }
    const mctx = ScorePopup._measureCtx;
    if (!mctx || typeof mctx.measureText !== "function") return null;
    mctx.font = font;
    const m = mctx.measureText(text);
    return m && Number.isFinite(m.width) ? m.width : null;
  }

  /**
   * @param {number} width
   * @param {number} height
   * @returns {OffscreenCanvas | HTMLCanvasElement | null}
   * @private
   */
  static _createCanvas(width, height) {
    if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(width, height);
    if (typeof document !== "undefined") {
      const elem = document.createElement("canvas");
      elem.width = width;
      elem.height = height;
      return elem;
    }
    return null;
  }
}

/** @type {SpriteCache<PopupSprite> | undefined} */
ScorePopup._spriteCache = undefined;
/** @type {any} */
ScorePopup._measureCtx = undefined;
