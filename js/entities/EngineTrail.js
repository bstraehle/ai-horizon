import { CONFIG, PI2 } from "../constants.js";

/**
 * EngineTrail – transient flame puff particles emitted from player engine.
 *
 * Responsibilities:
 *  - Spawn short-lived particles behind the rocket for motion feedback.
 *  - Maintain an in-memory list (simple array) with per-frame culling when life <= 0.
 *
 * Data Shape: { x, y, life, maxLife, size }
 *  - life decrements toward 0 (alpha derived as life / maxLife).
 *  - size randomized to add visual variety; optionally from provided RNG for determinism.
 */
export class EngineTrail {
  /** Create empty trail container. */
  constructor() {
    /** @type {Array<{x:number,y:number,life:number,maxLife:number,size:number}>} Particle list */
    this.particles = [];
  }

  /**
   * Emit a new engine particle at current player exhaust position.
   *
   * Placement:
   *  - Centered horizontally on player midpoint.
   *  - Spawn Y at player bottom (creates contiguous stream below rocket).
   *
   * @param {{x:number,y:number,width:number,height:number}} player Player bounds.
   * @param {import('../types.js').RNGLike} [rng] Optional deterministic RNG.
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

  /**
   * Advance particle positions (downward drift) and age them, removing expired entries.
   * Complexity: O(N) in particle count with in-place splice removal.
   * @param {number} [dtSec=CONFIG.TIME.DEFAULT_DT] Delta seconds.
   */
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

  /**
   * Draw engine trail particles as soft radial gradients in elongated ellipse shape.
   * @param {CanvasRenderingContext2D} ctx 2D context.
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
