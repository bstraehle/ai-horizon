import { CONFIG, PI2 } from "../constants.js";
import { SpriteCache } from "../utils/SpriteCache.js";

/**
 * Explosion – radial expanding energy effect.
 *
 * Visual Model:
 *  - Life decays linearly; alpha derived from life/maxLife.
 *  - A flat white flash disc fades (alpha²) while a thin shockwave ring expands to
 *    (1 + (1 - alpha) * (SCALE_GAIN + 0.8)) × radius — the "clean minimal" impact.
 *
 * Pool Friendly: purely numeric state; reset overwrites all fields.
 *
 * Rendering: frames are pre-rendered per quantized alpha step and looked up through a per-size
 * table resolved at spawn (integer index per frame, no cache-key strings in `draw`).
 */
export class Explosion {
  /**
   * Construct explosion instance.
   * @param {number} x Top-left x
   * @param {number} y Top-left y
   * @param {number} width Base width (pre-scale)
   * @param {number} height Base height (pre-scale)
   * @param {number} life Initial remaining life (seconds)
   * @param {number} maxLife Full duration (seconds)
   */
  constructor(x, y, width, height, life, maxLife) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.life = life;
    this.maxLife = maxLife;
    /** @private @type {Array<ExplosionSprite|null|undefined>} */
    this._sprites = Explosion._spriteTableFor(width, height);
  }

  /**
   * Age explosion toward expiry.
   * @param {number} [dtSec=CONFIG.TIME.DEFAULT_DT] Delta seconds.
   */
  update(dtSec = CONFIG.TIME.DEFAULT_DT) {
    this.life -= dtSec;
  }

  /**
   * Render expanding radial gradient circle.
   * @param {CanvasRenderingContext2D} ctx 2D context.
   */
  draw(ctx) {
    const alphaRaw = this.maxLife > 0 ? this.life / this.maxLife : 0;
    const alpha = Math.max(0, Math.min(1, alphaRaw));
    const steps = Explosion._SPRITE_STEPS;
    const step = steps > 0 ? Math.round(alpha * steps) : 0;
    const table =
      this._sprites || (this._sprites = Explosion._spriteTableFor(this.width, this.height));
    let sprite = table[step];
    if (sprite === undefined) {
      sprite = Explosion._getSprite(this.width, this.height, steps > 0 ? step / steps : alpha);
      table[step] = sprite;
    }
    const cx = this.x + this.width / 2;
    const cy = this.y + this.height / 2;
    if (sprite) {
      const drawX = cx - sprite.radius - sprite.pad;
      const drawY = cy - sprite.radius - sprite.pad;
      ctx.drawImage(sprite.canvas, drawX, drawY);
      return;
    }
    ctx.save();
    const scale = 1 + (1 - alpha) * CONFIG.EXPLOSION.SCALE_GAIN;
    const r = (this.width / 2) * scale;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    gradient.addColorStop(0, `${CONFIG.COLORS.EXPLOSION.GRAD_IN}${alpha})`);
    gradient.addColorStop(0.3, `${CONFIG.COLORS.EXPLOSION.GRAD_MID1}${alpha * 0.8})`);
    gradient.addColorStop(0.7, `${CONFIG.COLORS.EXPLOSION.GRAD_MID2}${alpha * 0.6})`);
    gradient.addColorStop(1, CONFIG.COLORS.EXPLOSION.GRAD_OUT);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, PI2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Reinitialize for reuse (object pool).
   * @param {number} x New x
   * @param {number} y New y
   * @param {number} width Base width
   * @param {number} height Base height
   * @param {number} life Remaining life
   * @param {number} maxLife Max life
   */
  reset(x, y, width, height, life, maxLife) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.life = life;
    this.maxLife = maxLife;
    this._sprites = Explosion._spriteTableFor(width, height);
  }

  /**
   * Shared alpha-step-indexed sprite table for an explosion size (lazily filled by `draw`).
   * @param {number} width
   * @param {number} height
   * @returns {Array<ExplosionSprite|null|undefined>}
   * @private
   */
  static _spriteTableFor(width, height) {
    const key = `${width}x${height}`;
    let table = Explosion._spriteTables.get(key);
    if (!table) {
      table = new Array(Explosion._SPRITE_STEPS + 1).fill(undefined);
      Explosion._spriteTables.set(key, table);
    }
    return table;
  }

  /**
   * @param {number} width
   * @param {number} height
   * @param {number} alpha
   * @returns {ExplosionSprite | null}
   * @private
   */
  static _getSprite(width, height, alpha) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return null;
    }
    if (!Explosion._spriteCache) Explosion._spriteCache = new SpriteCache(64);
    const key = `${width.toFixed(2)}x${height.toFixed(2)}@${alpha.toFixed(3)}`;
    const cached = Explosion._spriteCache.get(key);
    if (cached) return cached;

    // Frame layout: a flat flash disc fades while a thin shockwave ring races outward; the sprite
    // is sized to the ring at this step so both stay inside the canvas.
    const progress = 1 - alpha;
    const ringRadius = (width / 2) * (1 + progress * (CONFIG.EXPLOSION.SCALE_GAIN + 0.8));
    const pad = 6;
    const outer = ringRadius;
    const size = Math.ceil(outer * 2 + pad * 2);
    let canvas;
    if (typeof OffscreenCanvas === "function") {
      canvas = new OffscreenCanvas(size, size);
    } else {
      const elem = typeof document !== "undefined" ? document.createElement("canvas") : null;
      if (!elem) return null;
      elem.width = size;
      elem.height = size;
      canvas = elem;
    }
    const offCtx = canvas.getContext("2d");
    if (!offCtx) return null;
    offCtx.clearRect(0, 0, size, size);
    const center = size / 2;
    const C = CONFIG.COLORS.EXPLOSION;
    // Flash: a flat disc that fades quickly; a soft edge keeps it from looking cut out.
    const flashRadius = (width / 2) * (0.55 + progress * 0.45);
    const flashAlpha = alpha * alpha;
    const gradient = offCtx.createRadialGradient(center, center, 0, center, center, flashRadius);
    gradient.addColorStop(0, `${C.GRAD_IN}${flashAlpha})`);
    gradient.addColorStop(0.7, `${C.GRAD_MID1}${flashAlpha * 0.9})`);
    gradient.addColorStop(1, C.GRAD_OUT);
    offCtx.fillStyle = gradient;
    offCtx.beginPath();
    offCtx.arc(center, center, flashRadius, 0, PI2);
    offCtx.fill();
    // Shockwave ring: thin line racing outward, fading as it expands.
    if (progress > 0.05 && C.RING) {
      offCtx.strokeStyle = `${C.RING}${Math.max(0, 0.95 * alpha)})`;
      offCtx.lineWidth = Math.max(1, 2.2 * alpha + 0.6);
      offCtx.beginPath();
      offCtx.arc(center, center, ringRadius, 0, PI2);
      offCtx.stroke();
    }
    const sprite = { canvas, pad, radius: outer };
    Explosion._spriteCache.set(key, sprite);
    return sprite;
  }

  /**
   * Quantize alpha to reduce sprite variants.
   * @param {number} alpha
   * @returns {number}
   * @private
   */
  static _quantizeAlpha(alpha) {
    const steps = Explosion._SPRITE_STEPS;
    return steps > 0 ? Math.round(alpha * steps) / steps : alpha;
  }

  /** Pre-populate sprite cache for common explosion states. */
  static preloadSprites() {
    const steps = Explosion._SPRITE_STEPS;
    const width = CONFIG.EXPLOSION.SIZE;
    const height = CONFIG.EXPLOSION.SIZE;
    for (let i = 0; i <= steps; i++) {
      const alpha = i / steps;
      Explosion._getSprite(width, height, alpha);
    }
  }
}

/** @typedef {{ canvas: OffscreenCanvas | HTMLCanvasElement, pad: number, radius: number }} ExplosionSprite */

/** @type {SpriteCache<ExplosionSprite> | undefined} */
Explosion._spriteCache = undefined;
/** Alpha-step-indexed sprite tables keyed by "WxH" (see `_spriteTableFor`). */
/** @type {Map<string, Array<ExplosionSprite|null|undefined>>} */
Explosion._spriteTables = new Map();
Explosion._SPRITE_STEPS = 12;
