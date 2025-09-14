import { CONFIG, PI2 } from "../constants.js";

/** Visual effect particle. */
export class Particle {
  /** @param {number} x @param {number} y @param {number} vx @param {number} vy @param {number} life @param {number} maxLife @param {number} size @param {string} color */
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

  /** Integrate motion + gravity, decrement life. */
  update(dtSec = CONFIG.TIME.DEFAULT_DT) {
    this.x += this.vx * dtSec;
    this.y += this.vy * dtSec;
    this.life -= dtSec;
    this.vy += CONFIG.PARTICLE.GRAVITY * dtSec;
  }

  /** Draw particle.
   * @param {CanvasRenderingContext2D} ctx
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

  /** Reset to a fresh state for pooling.
   * @param {number} x
   * @param {number} y
   * @param {number} vx
   * @param {number} vy
   * @param {number} life
   * @param {number} maxLife
   * @param {number} size
   * @param {string} color
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
