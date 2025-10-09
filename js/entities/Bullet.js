import { CONFIG } from "../constants.js";

/**
 * Bullet – lightweight upward projectile fired by player.
 *
 * Design:
 *  - No acceleration; linear motion only (speed in pixels/sec).
 *  - Minimal draw: gradient body + trail rectangle to keep fill rate low.
 *  - Pool friendly: all state primitive; reset simply overwrites fields.
 */
export class Bullet {
  /**
   * Construct bullet instance (usually via object pool acquire).
   * @param {number} x Spawn x (top-left)
   * @param {number} y Spawn y (top-left)
   * @param {number} width Visual width
   * @param {number} height Visual height (body length)
   * @param {number} speed Upward speed (pixels/sec)
   */
  constructor(x, y, width, height, speed) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.speed = speed;
  }

  /**
   * Advance bullet along negative Y axis.
   * @param {number} [dtSec=CONFIG.TIME.DEFAULT_DT] Delta seconds.
   */
  update(dtSec = CONFIG.TIME.DEFAULT_DT) {
    this.y -= this.speed * dtSec;
  }

  /**
   * Render bullet body + small trailing segment.
   * @param {CanvasRenderingContext2D} ctx 2D context (state saved/restored outside caller responsibility).
   */
  draw(ctx) {
    const sprite = Bullet._getSprite(this.width, this.height);
    if (sprite) {
      ctx.drawImage(sprite.canvas, this.x - sprite.padX, this.y - sprite.padY);
      return;
    }
    Bullet._drawBullet(ctx, this.width, this.height, this.x, this.y);
  }

  /**
   * Get current axis-aligned bounds for collision system.
   * @returns {import('../types.js').Rect}
   */
  getBounds() {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }

  /**
   * Reinitialize bullet for reuse (object pool pattern).
   * @param {number} x New x
   * @param {number} y New y
   * @param {number} width Width
   * @param {number} height Height
   * @param {number} speed Upward speed
   */
  reset(x, y, width, height, speed) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.speed = speed;
  }

  /**
   * @param {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} ctx
   * @param {number} width
   * @param {number} height
   * @param {number} originX
   * @param {number} originY
   * @private
   */
  static _drawBullet(ctx, width, height, originX, originY) {
    ctx.save();
    ctx.shadowColor = CONFIG.COLORS.BULLET.SHADOW;
    ctx.shadowBlur = CONFIG.BULLET.SHADOW_BLUR;
    const gradient = ctx.createLinearGradient(originX, originY, originX, originY + height);
    gradient.addColorStop(0, CONFIG.COLORS.BULLET.GRAD_TOP);
    gradient.addColorStop(0.5, CONFIG.COLORS.BULLET.GRAD_MID);
    gradient.addColorStop(1, CONFIG.COLORS.BULLET.GRAD_BOTTOM);
    ctx.fillStyle = gradient;
    ctx.fillRect(originX, originY, width, height);
    ctx.fillStyle = CONFIG.COLORS.BULLET.TRAIL;
    ctx.fillRect(originX, originY + height, width, CONFIG.BULLET.TRAIL);
    ctx.restore();
  }

  /**
   * Retrieve or generate cached bullet sprite for given dimensions.
   * @param {number} width
   * @param {number} height
   * @returns {{ canvas: OffscreenCanvas | HTMLCanvasElement, padX: number, padY: number } | null}
   * @private
   */
  static _getSprite(width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return null;
    }
    if (!Bullet._spriteCache) {
      Bullet._spriteCache = new Map();
    }
    const key = `${width.toFixed(2)}x${height.toFixed(2)}`;
    const cached = Bullet._spriteCache.get(key);
    if (cached) return cached;

    const padX = 2;
    const padY = 2;
    const totalHeight = height + CONFIG.BULLET.TRAIL;
    const canvasWidth = Math.ceil(width + padX * 2);
    const canvasHeight = Math.ceil(totalHeight + padY * 2);
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
    Bullet._drawBullet(offCtx, width, height, padX, padY);
    const sprite = { canvas, padX, padY };
    Bullet._spriteCache.set(key, sprite);
    return sprite;
  }

  /** Preload the canonical bullet sprite used by the atlas. */
  static preloadSprites() {
    Bullet._getSprite(CONFIG.BULLET.WIDTH, CONFIG.BULLET.HEIGHT);
  }
}

/** @type {Map<string, { canvas: OffscreenCanvas | HTMLCanvasElement, padX: number, padY: number }> | undefined} */
Bullet._spriteCache = undefined;
