import { CONFIG, PI2 } from "../constants.js";

/**
 * Explosion – radial expanding energy effect.
 *
 * Visual Model:
 *  - Life decays linearly; alpha derived from life/maxLife.
 *  - Scale grows using (1 + (1 - alpha) * SCALE_GAIN) for ease-out like expansion.
 *  - Multi-stop radial gradient provides hot core -> cooler edge fade.
 *
 * Pool Friendly: purely numeric state; reset overwrites all fields.
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
    const quantAlpha = Explosion._quantizeAlpha(alpha);
    const sprite = Explosion._getSprite(this.width, this.height, quantAlpha);
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
  }

  /**
   * @param {number} width
   * @param {number} height
   * @param {number} alpha
   * @returns {{ canvas: OffscreenCanvas | HTMLCanvasElement, pad: number, radius: number } | null}
   * @private
   */
  static _getSprite(width, height, alpha) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return null;
    }
    if (!Explosion._spriteCache) Explosion._spriteCache = new Map();
    const key = `${width.toFixed(2)}x${height.toFixed(2)}@${alpha.toFixed(3)}`;
    const cached = Explosion._spriteCache.get(key);
    if (cached) return cached;

    const scale = 1 + (1 - alpha) * CONFIG.EXPLOSION.SCALE_GAIN;
    const radius = (width / 2) * scale;
    const pad = 4;
    const size = Math.ceil(radius * 2 + pad * 2);
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
    const gradient = offCtx.createRadialGradient(center, center, 0, center, center, radius);
    gradient.addColorStop(0, `${CONFIG.COLORS.EXPLOSION.GRAD_IN}${alpha})`);
    gradient.addColorStop(0.3, `${CONFIG.COLORS.EXPLOSION.GRAD_MID1}${alpha * 0.8})`);
    gradient.addColorStop(0.7, `${CONFIG.COLORS.EXPLOSION.GRAD_MID2}${alpha * 0.6})`);
    gradient.addColorStop(1, CONFIG.COLORS.EXPLOSION.GRAD_OUT);
    offCtx.fillStyle = gradient;
    offCtx.beginPath();
    offCtx.arc(center, center, radius, 0, PI2);
    offCtx.fill();
    const sprite = { canvas, pad, radius };
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

/** @type {Map<string, { canvas: OffscreenCanvas | HTMLCanvasElement, pad: number, radius: number }> | undefined} */
Explosion._spriteCache = undefined;
Explosion._SPRITE_STEPS = 12;
