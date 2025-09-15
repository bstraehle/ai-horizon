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
    ctx.save();
    ctx.shadowColor = CONFIG.COLORS.BULLET.SHADOW;
    ctx.shadowBlur = CONFIG.BULLET.SHADOW_BLUR;
    const bulletGradient = ctx.createLinearGradient(this.x, this.y, this.x, this.y + this.height);
    bulletGradient.addColorStop(0, CONFIG.COLORS.BULLET.GRAD_TOP);
    bulletGradient.addColorStop(0.5, CONFIG.COLORS.BULLET.GRAD_MID);
    bulletGradient.addColorStop(1, CONFIG.COLORS.BULLET.GRAD_BOTTOM);
    ctx.fillStyle = bulletGradient;
    ctx.fillRect(this.x, this.y, this.width, this.height);
    ctx.fillStyle = CONFIG.COLORS.BULLET.TRAIL;
    ctx.fillRect(this.x, this.y + this.height, this.width, CONFIG.BULLET.TRAIL);
    ctx.restore();
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
}
