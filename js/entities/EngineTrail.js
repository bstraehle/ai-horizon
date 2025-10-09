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
    this.particles.forEach((particle) => {
      const denom = particle.maxLife || CONFIG.ENGINE_TRAIL.LIFE;
      const alpha = Math.max(0, Math.min(1, particle.life / denom));
      const sprite = EngineTrail._getSprite(particle.size, alpha);
      if (sprite) {
        ctx.globalAlpha = alpha;
        ctx.drawImage(sprite.canvas, particle.x - sprite.halfWidth, particle.y - sprite.halfHeight);
        return;
      }
      EngineTrail._drawParticle(ctx, particle.x, particle.y, particle.size, alpha);
    });
    ctx.globalAlpha = 1;
  }

  /**
   * @param {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} ctx
   * @param {number} x
   * @param {number} y
   * @param {number} size
   * @param {number} alpha
   * @private
   */
  static _drawParticle(ctx, x, y, size, alpha) {
    ctx.save();
    const r = size * CONFIG.ENGINE_TRAIL.DRAW_SIZE_MULT;
    const gradient = ctx.createRadialGradient(x, y - r * 0.25, 0, x, y + r * 0.75, r * 1.25);
    gradient.addColorStop(0, `rgba(255,255,245,${0.98 * alpha})`);
    gradient.addColorStop(0.35, `rgba(255,220,170,${0.85 * alpha})`);
    gradient.addColorStop(1, "rgba(255,180,120,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    if (typeof ctx.ellipse === "function") {
      ctx.ellipse(x, y, r * 0.6, r * 1.4, 0, 0, PI2);
    } else {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(0.6, 1.4);
      ctx.arc(0, 0, r, 0, PI2);
      ctx.restore();
    }
    ctx.fill();
    ctx.restore();
  }

  /**
   * Retrieve or cache a pre-rendered trail sprite for a given size + alpha bucket.
   * @param {number} size
   * @param {number} alpha
   * @returns {{ canvas: OffscreenCanvas | HTMLCanvasElement, halfWidth: number, halfHeight: number } | null}
   * @private
   */
  static _getSprite(size, alpha) {
    if (!Number.isFinite(size) || size <= 0 || alpha <= 0) return null;
    if (!EngineTrail._spriteCache) EngineTrail._spriteCache = new Map();
    const quantSize = EngineTrail._quantizeSize(size);
    const quantAlpha = EngineTrail._quantizeAlpha(alpha);
    const key = `${quantSize.toFixed(2)}@${quantAlpha.toFixed(2)}`;
    const cached = EngineTrail._spriteCache.get(key);
    if (cached) return cached;

    const r = quantSize * CONFIG.ENGINE_TRAIL.DRAW_SIZE_MULT;
    const pad = 2;
    const width = Math.ceil(r * 1.2 + pad * 2);
    const height = Math.ceil(r * 2.8 + pad * 2);
    let canvas;
    if (typeof OffscreenCanvas === "function") canvas = new OffscreenCanvas(width, height);
    else {
      const elem = typeof document !== "undefined" ? document.createElement("canvas") : null;
      if (!elem) return null;
      elem.width = width;
      elem.height = height;
      canvas = elem;
    }
    const offCtx = canvas.getContext("2d");
    if (!offCtx) return null;
    offCtx.clearRect(0, 0, width, height);
    EngineTrail._drawParticle(offCtx, width / 2, height / 2, quantSize, quantAlpha);
    const sprite = { canvas, halfWidth: width / 2, halfHeight: height / 2 };
    EngineTrail._spriteCache.set(key, sprite);
    return sprite;
  }

  /**
   * Quantize particle size to limit sprite variants.
   * @param {number} size
   * @returns {number}
   * @private
   */
  static _quantizeSize(size) {
    const step = EngineTrail._SIZE_STEP;
    return Math.round(size / step) * step;
  }

  /**
   * Quantize alpha to limit sprite variants.
   * @param {number} alpha
   * @returns {number}
   * @private
   */
  static _quantizeAlpha(alpha) {
    const steps = EngineTrail._ALPHA_STEPS;
    return steps > 0 ? Math.round(alpha * steps) / steps : alpha;
  }

  /** Preload sprite variants for anticipated size/alpha buckets. */
  static preloadSprites() {
    const sizes = [CONFIG.ENGINE_TRAIL.SIZE_MIN, CONFIG.ENGINE_TRAIL.SIZE_MAX];
    for (const size of sizes) {
      for (let i = 1; i <= EngineTrail._ALPHA_STEPS; i++) {
        EngineTrail._getSprite(size, i / EngineTrail._ALPHA_STEPS);
      }
    }
  }
}

/** @type {Map<string, { canvas: OffscreenCanvas | HTMLCanvasElement, halfWidth: number, halfHeight: number }> | undefined} */
EngineTrail._spriteCache = undefined;
EngineTrail._SIZE_STEP = 0.5;
EngineTrail._ALPHA_STEPS = 8;
