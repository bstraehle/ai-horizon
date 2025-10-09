import { CONFIG } from "../constants.js";

/**
 * Star – falling collectible / background glow with optional red variant.
 *
 * Features:
 *  - Two color palettes (normal vs red) for rarity or scoring differentiation.
 *  - Pool ready; state is primitive & resettable.
 */
export class Star {
  /**
   * Construct star instance.
   * @param {number} x Spawn x
   * @param {number} y Spawn y
   * @param {number} width Visual width (used for size calc)
   * @param {number} height Visual height
   * @param {number} speed Downward speed (px/sec)
   * @param {boolean} [isRed=false] Red palette flag
   */
  constructor(x, y, width, height, speed, isRed = false) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.speed = speed;
    /** @type {boolean} */
    this.isRed = !!isRed;
  }

  /**
   * Advance star vertically.
   * @param {number} [dtSec=CONFIG.TIME.DEFAULT_DT] Delta seconds.
   */
  update(dtSec = CONFIG.TIME.DEFAULT_DT) {
    this.y += this.speed * dtSec;
  }

  /**
   * Render star with radial gradient & optional pulse scale modulation.
   * @param {CanvasRenderingContext2D} ctx 2D context.
   */
  draw(ctx) {
    const sprite = Star._getSprite(this.width, this.height, this.isRed);
    if (sprite) {
      ctx.drawImage(sprite.canvas, this.x - sprite.padX, this.y - sprite.padY);
      return;
    }
    Star._drawStarDirect(ctx, this.x, this.y, this.width, this.height, this.isRed);
  }

  /**
   * Provide AABB for collision detection / collection.
   * @returns {import('../types.js').Rect}
   */
  getBounds() {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }

  /**
   * Reinitialize star for reuse (object pool).
   * @param {number} x New x
   * @param {number} y New y
   * @param {number} width Width
   * @param {number} height Height
   * @param {number} speed Downward speed
   * @param {boolean} [isRed=false] Red palette flag
   */
  reset(x, y, width, height, speed, isRed = false) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.speed = speed;
    this.isRed = !!isRed;
  }

  /**
   * Low-level polygon fill for 5-point star (outer/inner alternating vertices).
   * @param {CanvasRenderingContext2D} ctx 2D context.
   * @param {number} x Center x.
   * @param {number} y Center y.
   * @param {number} size Outer radius.
   */
  /**
   * @param {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} ctx
   * @param {number} x
   * @param {number} y
   * @param {number} size
   */
  static drawStar(ctx, x, y, size) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      const x1 = x + size * Math.cos(angle);
      const y1 = y + size * Math.sin(angle);
      if (i === 0) ctx.moveTo(x1, y1);
      else ctx.lineTo(x1, y1);
      const innerAngle = angle + Math.PI / 5;
      const x2 = x + size * 0.4 * Math.cos(innerAngle);
      const y2 = y + size * 0.4 * Math.sin(innerAngle);
      ctx.lineTo(x2, y2);
    }
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Draw star directly onto provided context (fallback when sprite cache unavailable).
   * @param {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} ctx
   * @param {number} originX
   * @param {number} originY
   * @param {number} width
   * @param {number} height
   * @param {boolean} isRed
   * @private
   */
  static _drawStarDirect(ctx, originX, originY, width, height, isRed) {
    ctx.save();
    const centerX = originX + width / 2;
    const centerY = originY + height / 2;
    const radius = width / 2;
    const colors = isRed ? CONFIG.COLORS.STAR_RED : CONFIG.COLORS.STAR;
    ctx.shadowColor = colors.BASE;
    ctx.shadowBlur = CONFIG.STAR.SHADOW_BLUR;
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    gradient.addColorStop(0, colors.GRAD_IN);
    gradient.addColorStop(0.3, colors.GRAD_MID);
    gradient.addColorStop(1, colors.GRAD_OUT);
    ctx.fillStyle = gradient;
    Star.drawStar(ctx, centerX, centerY, radius);
    ctx.restore();
  }

  /**
   * Retrieve or create cached sprite for star rendering.
   * @param {number} width
   * @param {number} height
   * @param {boolean} isRed
   * @returns {{ canvas: OffscreenCanvas | HTMLCanvasElement, padX: number, padY: number } | null}
   * @private
   */
  static _getSprite(width, height, isRed) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return null;
    }
    if (!Star._spriteCache) {
      Star._spriteCache = new Map();
    }
    const key = `${isRed ? "r" : "n"}:${width.toFixed(2)}x${height.toFixed(2)}`;
    const cached = Star._spriteCache.get(key);
    if (cached) return cached;

    const pad = Math.ceil(CONFIG.STAR.SHADOW_BLUR || 0) + 2;
    const canvasWidth = Math.ceil(width + pad * 2);
    const canvasHeight = Math.ceil(height + pad * 2);
    let canvas;
    if (typeof OffscreenCanvas === "function") {
      canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
    } else {
      const elem = typeof document !== "undefined" ? document.createElement("canvas") : null;
      if (!elem) return null;
      elem.width = canvasWidth;
      elem.height = canvasHeight;
      canvas = elem;
    }
    const offCtx = canvas.getContext("2d");
    if (!offCtx) return null;
    offCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    Star._drawStarDirect(offCtx, pad, pad, width, height, isRed);
    const sprite = { canvas, padX: pad, padY: pad };
    Star._spriteCache.set(key, sprite);
    return sprite;
  }

  /**
   * Pre-generate star sprites for common sizes and palette variants.
   * @param {number[]} [sizes]
   */
  static preloadSprites(sizes) {
    const baseSizes =
      Array.isArray(sizes) && sizes.length
        ? sizes
        : [
            CONFIG.STAR.MIN_SIZE,
            CONFIG.STAR.MIN_SIZE + (CONFIG.STAR.SIZE_VARIATION || 0),
            (CONFIG.STARFIELD.SIZE_MIN || CONFIG.STAR.MIN_SIZE) * 2,
          ];
    for (const size of baseSizes) {
      if (!Number.isFinite(size) || size <= 0) continue;
      Star._getSprite(size, size, false);
      Star._getSprite(size, size, true);
    }
  }
}

/** @type {Map<string, { canvas: OffscreenCanvas | HTMLCanvasElement, padX: number, padY: number }> | undefined} */
Star._spriteCache = undefined;
