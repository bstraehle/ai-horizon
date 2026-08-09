import { CONFIG, PI2 } from "../constants.js";

/**
 * Particle – generic visual effect sprite (glow circle) used for explosions, dust, etc.
 *
 * Lifecycle:
 *  - life counts down toward 0; alpha derived from life/maxLife.
 *  - Optional gravity applied each update (vy += GRAVITY * dt).
 *
 * Pool Friendly: purely numeric + color string. Reset overwrites all fields.
 */
export class Particle {
  /**
   * Construct particle.
   * @param {number} x Start x
   * @param {number} y Start y
   * @param {number} vx Velocity x (px/sec)
   * @param {number} vy Velocity y (px/sec)
   * @param {number} life Remaining life seconds
   * @param {number} maxLife Max life seconds
   * @param {number} size Radius for draw
   * @param {string} color Fill & glow color (rgba/hex)
   */
  constructor(x, y, vx, vy, life, maxLife, size, color) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = maxLife;
    this.size = size;
    this.color = color;
  }

  /**
   * Integrate motion, apply gravity, and age toward expiry.
   * @param {number} [dtSec=CONFIG.TIME.DEFAULT_DT] Delta seconds.
   */
  update(dtSec = CONFIG.TIME.DEFAULT_DT) {
    this.x += this.vx * dtSec;
    this.y += this.vy * dtSec;
    this.life -= dtSec;
    this.vy += CONFIG.PARTICLE.GRAVITY * dtSec;
  }

  /**
   * Render particle as soft glowing circle (shadowBlur sized by radius).
   * @param {CanvasRenderingContext2D} ctx 2D context.
   */
  draw(ctx) {
    const alphaRaw = this.maxLife > 0 ? this.life / this.maxLife : 0;
    const alpha = Math.max(0, Math.min(1, alphaRaw));
    if (alpha <= 0) return;
    const sprite = Particle._getSprite(this.size, this.color);
    if (sprite) {
      ctx.globalAlpha = alpha;
      ctx.drawImage(sprite.canvas, this.x - sprite.halfSize, this.y - sprite.halfSize);
      ctx.globalAlpha = 1;
      return;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = this.size;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, PI2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Reinitialize particle for reuse (object pool pattern).
   * @param {number} x New x
   * @param {number} y New y
   * @param {number} vx Velocity x
   * @param {number} vy Velocity y
   * @param {number} life Remaining life
   * @param {number} maxLife Max life
   * @param {number} size Radius
   * @param {string} color Color
   */
  reset(x, y, vx, vy, life, maxLife, size, color) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = maxLife;
    this.size = size;
    this.color = color;
  }

  /**
   * @param {number} size
   * @param {string} color
   * @returns {{ canvas: OffscreenCanvas | HTMLCanvasElement, halfSize: number } | null}
   * @private
   */
  static _getSprite(size, color) {
    if (!Number.isFinite(size) || size <= 0 || !color) return null;
    if (!Particle._spriteCache) Particle._spriteCache = new Map();
    const quantSize = Particle._quantizeSize(size);
    const key = `${quantSize.toFixed(2)}|${String(color)}`;
    const cached = Particle._spriteCache.get(key);
    if (cached) return cached;

    const radius = quantSize;
    const pad = Math.ceil(radius + 2);
    const spriteSize = Math.ceil(radius * 2 + pad * 2);
    let canvas;
    if (typeof OffscreenCanvas === "function") {
      canvas = new OffscreenCanvas(spriteSize, spriteSize);
    } else {
      const elem = typeof document !== "undefined" ? document.createElement("canvas") : null;
      if (!elem) return null;
      elem.width = spriteSize;
      elem.height = spriteSize;
      canvas = elem;
    }
    const offCtx = canvas.getContext("2d");
    if (!offCtx) return null;
    const center = spriteSize / 2;
    offCtx.clearRect(0, 0, spriteSize, spriteSize);
    offCtx.shadowColor = color;
    offCtx.shadowBlur = radius;
    offCtx.fillStyle = color;
    offCtx.beginPath();
    offCtx.arc(center, center, radius, 0, PI2);
    offCtx.fill();

    const sprite = { canvas, halfSize: spriteSize / 2 };
    Particle._spriteCache.set(key, sprite);
    return sprite;
  }

  /**
   * @param {number} size
   * @returns {number}
   * @private
   */
  static _quantizeSize(size) {
    const step = Particle._SIZE_STEP;
    return Math.round(size / step) * step;
  }
}

/** @type {Map<string, { canvas: OffscreenCanvas | HTMLCanvasElement, halfSize: number }> | undefined} */
Particle._spriteCache = undefined;

/** @type {number} */
Particle._SIZE_STEP = 0.5;
