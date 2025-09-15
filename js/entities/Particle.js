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
    ctx.save();
    const alpha = this.life / this.maxLife;
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
}
