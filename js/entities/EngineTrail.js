import { CONFIG, PI2 } from "../constants.js";

/** Engine exhaust trail particles. */
export class EngineTrail {
  constructor() {
    /** @type {Array<{x:number,y:number,life:number,maxLife:number,size:number}>} */
    this.particles = [];
  }

  /** Add a particle.
   * @param {{x:number,y:number,width:number,height:number}} player @param {import('../types.js').RNGLike} [rng]
   */
  add(player, rng) {
    const centerX = player.x + player.width / 2;
    const trailY = player.y + player.height;
    const maxLife = CONFIG.ENGINE_TRAIL.LIFE;
    const jitter = CONFIG.ENGINE_TRAIL.SPAWN_JITTER;
    const sizeMin = CONFIG.ENGINE_TRAIL.SIZE_MIN;
    const sizeMax = CONFIG.ENGINE_TRAIL.SIZE_MAX;
    this.particles.push({
      x: centerX + (rng ? rng.nextFloat() - 0.5 : Math.random() - 0.5) * jitter,
      y: trailY,
      life: maxLife,
      maxLife,
      // rng.range is optional on RNGLike — guard before invoking
      size:
        (rng && typeof rng.range === "function" ? rng.range(0, sizeMax) : Math.random() * sizeMax) +
        sizeMin,
    });
  }

  /** Update particles. */
  update(dtSec = CONFIG.TIME.DEFAULT_DT) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      particle.y += CONFIG.ENGINE_TRAIL.SPEED * dtSec;
      particle.life -= dtSec;
      if (particle.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  /** Draw particles.
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx) {
    ctx.save();
    this.particles.forEach((particle) => {
      const denom = particle.maxLife || CONFIG.ENGINE_TRAIL.LIFE;
      const alpha = Math.max(0, Math.min(1, particle.life / denom));
      ctx.globalAlpha = alpha;
      // Make the trail look like a tapered flame: elongated ellipse + warm flame gradient
      const r = particle.size * CONFIG.ENGINE_TRAIL.DRAW_SIZE_MULT;
      // radial gradient anchored slightly above the particle so the bright core sits near the nozzle
      const trailGradient = ctx.createRadialGradient(
        particle.x,
        particle.y - r * 0.25,
        0,
        particle.x,
        particle.y + r * 0.75,
        r * 1.25
      );
      // Make the trail whiter and more realistic: a bright white-hot core with
      // paler, less-saturated edges instead of strong orange/red.
      trailGradient.addColorStop(0, "rgba(255,255,245,0.98)"); // bright, near-white core
      trailGradient.addColorStop(0.35, "rgba(255,220,170,0.85)"); // warm, pale transition
      trailGradient.addColorStop(1, "rgba(255,180,120,0)"); // very soft faded edge
      ctx.fillStyle = trailGradient;
      ctx.beginPath();
      // Draw an elongated ellipse to simulate a flame blob
      // scale on Y for tapering effect
      ctx.ellipse(particle.x, particle.y, r * 0.6, r * 1.4, 0, 0, PI2);
      ctx.fill();
    });
    ctx.restore();
  }
}
