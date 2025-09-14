import { CONFIG } from "../constants.js";

/** Background collectible/pulsing star. */
export class Star {
  /** @param {number} x @param {number} y @param {number} width @param {number} height @param {number} speed @param {boolean} [isRed=false] */
  constructor(x, y, width, height, speed, isRed = false) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.speed = speed;
    /** @type {boolean} */
    this.isRed = !!isRed;
  }

  /** Move downward. */
  update(dtSec = CONFIG.TIME.DEFAULT_DT) {
    this.y += this.speed * dtSec;
  }

  /** Draw star (with optional pulse).
   * @param {CanvasRenderingContext2D} ctx @param {number} timeSec
   */
  draw(ctx, timeSec) {
    ctx.save();
    const centerX = this.x + this.width / 2;
    const centerY = this.y + this.height / 2;
    const size = this.width / 2;
    let scaledSize = size;
    if (CONFIG.STAR.PULSE) {
      const amp = CONFIG.STAR.PULSE_AMPLITUDE;
      const speedHz = CONFIG.STAR.PULSE_SPEED;
      const pulse = Math.sin(timeSec * speedHz * 2 * Math.PI) * amp + (1 - amp);
      scaledSize = size * pulse;
    }

    const colors = this.isRed ? CONFIG.COLORS.STAR_RED : CONFIG.COLORS.STAR;
    ctx.shadowColor = colors.BASE;
    ctx.shadowBlur = CONFIG.STAR.SHADOW_BLUR;

    const starGradient = ctx.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      scaledSize
    );
    starGradient.addColorStop(0, colors.GRAD_IN);
    starGradient.addColorStop(0.3, colors.GRAD_MID);
    starGradient.addColorStop(1, colors.GRAD_OUT);

    ctx.fillStyle = starGradient;
    Star.drawStar(ctx, centerX, centerY, scaledSize);
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
   * @param {boolean} [isRed=false]
   */
  reset(x, y, width, height, speed, isRed = false) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.speed = speed;
    this.isRed = !!isRed;
  }

  /** Draw raw star polygon.
   * @param {CanvasRenderingContext2D} ctx
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
}
