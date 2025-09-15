import { CONFIG } from "../constants.js";

/**
 * Star – falling collectible / background glow with optional red variant.
 *
 * Features:
 *  - Optional pulse scaling (CONFIG.STAR.PULSE) using sinus wave.
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
   * @param {number} timeSec Elapsed time (seconds) for pulse animation.
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
