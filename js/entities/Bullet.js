import { CONFIG } from "../constants.js";

/** Player projectile. */
export class Bullet {
  /** @param {number} x @param {number} y @param {number} width @param {number} height @param {number} speed */
  constructor(x, y, width, height, speed) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.speed = speed;
  }

  /** Move upward. */
  update(dtSec = CONFIG.TIME.DEFAULT_DT) {
    this.y -= this.speed * dtSec;
  }

  /** Draw bullet.
   * @param {CanvasRenderingContext2D} ctx
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

  /** Returns the axis-aligned bounding box for collisions.
   * @returns {import('../types.js').Rect}
   */
  getBounds() {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }

  /** Reset to a fresh state for pooling.
   * @param {number} x
   * @param {number} y
   * @param {number} width
   * @param {number} height
   * @param {number} speed
   */
  reset(x, y, width, height, speed) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.speed = speed;
  }
}
