import { CONFIG, PI2 } from "../constants.js";
import { SpriteCache } from "../utils/SpriteCache.js";

/** @typedef {{ canvas: OffscreenCanvas | HTMLCanvasElement, halfWidth: number, halfHeight: number }} TrailSprite */
/** @typedef {{ x:number, y:number, life:number, maxLife:number, size:number, _sprites: Array<TrailSprite|null|undefined>|null }} TrailParticle */

/** Upper bound on recycled particle records kept for reuse. */
const FREE_LIST_MAX = 256;

/**
 * EngineTrail – transient flame puff particles emitted from player engine.
 *
 * Responsibilities:
 *  - Spawn short-lived particles behind the rocket for motion feedback.
 *  - Maintain an in-memory list with per-frame culling when life <= 0 (stable compaction; expired
 *    records are recycled through an internal free list so steady-state emission allocates nothing).
 *
 * Data Shape: { x, y, life, maxLife, size, _sprites }
 *  - life decrements toward 0 (alpha derived as life / maxLife).
 *  - size randomized to add visual variety; optionally from provided RNG for determinism.
 *  - _sprites: per-size table of alpha-bucketed sprites resolved at spawn, so `draw` indexes an
 *    array instead of building a cache key per particle per frame.
 */
export class EngineTrail {
  /** Create empty trail container. */
  constructor() {
    /** @type {TrailParticle[]} Particle list */
    this.particles = [];
    /** @private @type {TrailParticle[]} Recycled particle records. */
    this._free = [];
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
    const particle = this._free.length
      ? /** @type {TrailParticle} */ (this._free.pop())
      : { x: 0, y: 0, life: 0, maxLife: 0, size: 0, _sprites: null };
    particle.x = centerX + (rng ? rng.nextFloat() - 0.5 : Math.random() - 0.5) * jitter;
    particle.y = trailY;
    particle.life = maxLife;
    particle.maxLife = maxLife;
    particle.size =
      (rng && typeof rng.range === "function" ? rng.range(0, sizeMax) : Math.random() * sizeMax) +
      sizeMin;
    particle._sprites = EngineTrail._spriteTableForSize(particle.size);
    this.particles.push(particle);
  }

  /**
   * Advance particle positions (downward drift) and age them, removing expired entries.
   * Complexity: O(N) in particle count (single compaction pass); expired records are recycled.
   * @param {number} [dtSec=CONFIG.TIME.DEFAULT_DT] Delta seconds.
   */
  update(dtSec = CONFIG.TIME.DEFAULT_DT) {
    const arr = this.particles;
    let w = 0;
    for (let r = 0; r < arr.length; r++) {
      const particle = arr[r];
      particle.y += CONFIG.ENGINE_TRAIL.SPEED * dtSec;
      particle.life -= dtSec;
      if (particle.life <= 0) {
        if (this._free.length < FREE_LIST_MAX) this._free.push(particle);
        continue;
      }
      arr[w++] = particle;
    }
    if (w !== arr.length) arr.length = w;
  }

  /**
   * Draw engine trail particles as soft cyan radial gradients in elongated ellipse shape (additive pass).
   * Sprites come from the particle's per-size alpha table (integer index, no string keys).
   * @param {CanvasRenderingContext2D} ctx 2D context.
   * @param {number} [extrapolateSec=0] Seconds past the last simulated state (projects downward drift).
   */
  draw(ctx, extrapolateSec = 0) {
    const drift = extrapolateSec > 0 ? CONFIG.ENGINE_TRAIL.SPEED * extrapolateSec : 0;
    const steps = EngineTrail._ALPHA_STEPS;
    const particles = this.particles;
    // Additive exhaust: overlapping puffs bloom into a bright plume.
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      const denom = particle.maxLife || CONFIG.ENGINE_TRAIL.LIFE;
      const alpha = Math.max(0, Math.min(1, particle.life / denom));
      const step = Math.round(alpha * steps);
      if (step <= 0) continue;
      const y = particle.y + drift;
      const table =
        particle._sprites || (particle._sprites = EngineTrail._spriteTableForSize(particle.size));
      let sprite = table[step];
      if (sprite === undefined) {
        sprite = EngineTrail._getSprite(particle.size, step / steps);
        table[step] = sprite;
      }
      if (sprite) {
        ctx.globalAlpha = alpha;
        ctx.drawImage(sprite.canvas, particle.x - sprite.halfWidth, y - sprite.halfHeight);
        continue;
      }
      EngineTrail._drawParticle(ctx, particle.x, y, particle.size, alpha);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  /**
   * Shared alpha-indexed sprite table for a quantized particle size (lazily filled by `draw`).
   * @param {number} size
   * @returns {Array<TrailSprite|null|undefined>}
   * @private
   */
  static _spriteTableForSize(size) {
    const quantSize = EngineTrail._quantizeSize(size);
    let table = EngineTrail._spriteTables.get(quantSize);
    if (!table) {
      table = new Array(EngineTrail._ALPHA_STEPS + 1).fill(undefined);
      EngineTrail._spriteTables.set(quantSize, table);
    }
    return table;
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
    const C = CONFIG.COLORS.ENGINE_TRAIL;
    gradient.addColorStop(0, `${C.CORE}${0.98 * alpha})`);
    gradient.addColorStop(0.35, `${C.MID}${0.85 * alpha})`);
    gradient.addColorStop(1, C.OUT);
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
    if (!EngineTrail._spriteCache) EngineTrail._spriteCache = new SpriteCache(128);
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

/** @type {SpriteCache<TrailSprite> | undefined} */
EngineTrail._spriteCache = undefined;
/** Alpha-indexed sprite tables keyed by quantized size (see `_spriteTableForSize`). */
/** @type {Map<number, Array<TrailSprite|null|undefined>>} */
EngineTrail._spriteTables = new Map();
EngineTrail._SIZE_STEP = 0.5;
EngineTrail._ALPHA_STEPS = 8;
