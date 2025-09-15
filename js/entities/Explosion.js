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
    ctx.save();
    const alpha = this.life / this.maxLife;
    const scale = 1 + (1 - alpha) * CONFIG.EXPLOSION.SCALE_GAIN;
    const cx = this.x + this.width / 2;
    const cy = this.y + this.height / 2;
    const r = (this.width / 2) * scale;
    const explosionGradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    explosionGradient.addColorStop(0, `${CONFIG.COLORS.EXPLOSION.GRAD_IN}${alpha})`);
    explosionGradient.addColorStop(0.3, `${CONFIG.COLORS.EXPLOSION.GRAD_MID1}${alpha * 0.8})`);
    explosionGradient.addColorStop(0.7, `${CONFIG.COLORS.EXPLOSION.GRAD_MID2}${alpha * 0.6})`);
    explosionGradient.addColorStop(1, CONFIG.COLORS.EXPLOSION.GRAD_OUT);
    ctx.fillStyle = explosionGradient;
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
}
