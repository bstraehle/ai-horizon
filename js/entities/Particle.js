import { CONFIG, PI2 } from "../constants.js";
import { SpriteCache } from "../utils/SpriteCache.js";

/**
 * Particle – generic visual effect sprite (glow circle) used for explosions, dust, etc.
 *
 * Lifecycle:
 *  - life counts down toward 0; alpha derived from life/maxLife.
 *  - Optional gravity applied each update (vy += GRAVITY * dt).
 *
 * Pool Friendly: purely numeric + color string. Reset overwrites all fields.
 *
 * Rendering / Performance:
 *  - The glow sprite is resolved once per spawn (constructor / reset) from a bounded shared cache
 *    keyed by quantized size + color, so `draw` is a single `drawImage` with no string building.
 *  - Callers must supply colors from a small discrete palette (see CONFIG.EXPLOSION.PARTICLE_GRAY_*);
 *    a continuous color would create one cached canvas per particle.
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
    /** @private @type {{ canvas: OffscreenCanvas | HTMLCanvasElement, halfSize: number } | null} */
    this._sprite = Particle._getSprite(size, color);
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
   * @param {number} [extrapolateSec=0] Seconds past the last simulated state (projects velocity).
   */
  draw(ctx, extrapolateSec = 0) {
    const alphaRaw = this.maxLife > 0 ? this.life / this.maxLife : 0;
    const alpha = Math.max(0, Math.min(1, alphaRaw));
    if (alpha <= 0) return;
    const x = extrapolateSec > 0 ? this.x + this.vx * extrapolateSec : this.x;
    const y = extrapolateSec > 0 ? this.y + this.vy * extrapolateSec : this.y;
    const sprite = this._sprite;
    if (sprite) {
      ctx.globalAlpha = alpha;
      ctx.drawImage(sprite.canvas, x - sprite.halfSize, y - sprite.halfSize);
      ctx.globalAlpha = 1;
      return;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = this.size;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(x, y, this.size, 0, PI2);
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
    this._sprite = Particle._getSprite(size, color);
  }

  /**
   * Snap an explosion gray level to the discrete palette (CONFIG.EXPLOSION.PARTICLE_GRAY_*), so the
   * number of distinct particle colors – and therefore cached sprites – stays small and bounded.
   * @param {number} gray Raw lightness percentage (e.g. from the RNG).
   * @returns {number} Quantized lightness percentage within [GRAY_MIN, GRAY_MAX].
   */
  static quantizeGray(gray) {
    const cfg = CONFIG.EXPLOSION;
    const min = cfg.PARTICLE_GRAY_MIN;
    const max = cfg.PARTICLE_GRAY_MAX;
    const step = cfg.PARTICLE_GRAY_STEP > 0 ? cfg.PARTICLE_GRAY_STEP : 1;
    const clamped = Math.max(min, Math.min(max, gray));
    return Math.min(max, min + Math.round((clamped - min) / step) * step);
  }

  /**
   * Map a quantized explosion level (see quantizeGray) to a warm spark colour: low levels are deep
   * orange, high levels gold-white. Integer components keep the colour set bounded.
   * @param {number} level Quantized lightness percentage within [GRAY_MIN, GRAY_MAX].
   * @returns {string} CSS hsl() colour.
   */
  static sparkColor(level) {
    const cfg = CONFIG.EXPLOSION;
    const span = Math.max(1, cfg.PARTICLE_GRAY_MAX - cfg.PARTICLE_GRAY_MIN);
    const t = Math.max(0, Math.min(1, (level - cfg.PARTICLE_GRAY_MIN) / span));
    const hue = Math.round(14 + t * 32);
    const light = Math.round(52 + t * 22);
    return `hsl(${hue}, 100%, ${light}%)`;
  }

  /**
   * Pre-render the sprites the game is expected to use (explosion sparks, star burst colors, crater
   * dust) across their quantized size ranges so the first explosions do not pay canvas creation.
   * @param {Array<{ colors: string[], sizeMin: number, sizeMax: number }>} [specs] Override palette specs.
   */
  static preloadSprites(specs) {
    const list = Array.isArray(specs) && specs.length ? specs : Particle._defaultPreloadSpecs();
    const step = Particle._SIZE_STEP;
    for (const spec of list) {
      const from = Particle._quantizeSize(spec.sizeMin);
      const to = Particle._quantizeSize(spec.sizeMax);
      for (const color of spec.colors) {
        for (let size = from; size <= to + 1e-9; size += step) Particle._getSprite(size, color);
      }
    }
  }

  /**
   * @returns {Array<{ colors: string[], sizeMin: number, sizeMax: number }>}
   * @private
   */
  static _defaultPreloadSpecs() {
    const ex = CONFIG.EXPLOSION;
    const grays = [];
    for (let g = ex.PARTICLE_GRAY_MIN; g <= ex.PARTICLE_GRAY_MAX; g += ex.PARTICLE_GRAY_STEP) {
      grays.push(Particle.sparkColor(g));
    }
    const st = CONFIG.STAR;
    const puff = CONFIG.ASTEROID.CRATER_EMBOSS;
    return [
      {
        colors: grays,
        sizeMin: ex.PARTICLE_SIZE_MIN,
        sizeMax: ex.PARTICLE_SIZE_MIN + ex.PARTICLE_SIZE_VARIATION,
      },
      {
        colors: [
          CONFIG.COLORS.STAR.BASE,
          CONFIG.COLORS.STAR_RED.BASE,
          CONFIG.COLORS.STAR_BLUE.BASE,
        ],
        sizeMin: st.PARTICLE_SIZE_MIN,
        sizeMax: st.PARTICLE_SIZE_MIN + st.PARTICLE_SIZE_VARIATION,
      },
      {
        colors: [puff.PUFF_COLOR],
        sizeMin: puff.PUFF_SIZE_MIN,
        sizeMax: puff.PUFF_SIZE_MIN + puff.PUFF_SIZE_VAR,
      },
    ];
  }

  /**
   * @param {number} size
   * @param {string} color
   * @returns {{ canvas: OffscreenCanvas | HTMLCanvasElement, halfSize: number } | null}
   * @private
   */
  static _getSprite(size, color) {
    if (!Number.isFinite(size) || size <= 0 || !color) return null;
    if (!Particle._spriteCache) Particle._spriteCache = new SpriteCache(Particle._CACHE_MAX);
    const quantSize = Particle._quantizeSize(size);
    const key = `${quantSize.toFixed(2)}|${String(color)}`;
    const cached = Particle._spriteCache.get(key);
    if (cached) return cached;

    const radius = quantSize;
    const pad = Math.ceil(radius + 2);
    const spriteSize = Math.ceil(radius * 2 + pad * 2);
    let canvas;
    if (typeof OffscreenCanvas === "function") {
      canvas = new OffscreenCanvas(spriteSize, spriteSize);
    } else {
      const elem = typeof document !== "undefined" ? document.createElement("canvas") : null;
      if (!elem) return null;
      elem.width = spriteSize;
      elem.height = spriteSize;
      canvas = elem;
    }
    const offCtx = canvas.getContext("2d");
    if (!offCtx) return null;
    const center = spriteSize / 2;
    offCtx.clearRect(0, 0, spriteSize, spriteSize);
    offCtx.shadowColor = color;
    offCtx.shadowBlur = radius;
    offCtx.fillStyle = color;
    offCtx.beginPath();
    offCtx.arc(center, center, radius, 0, PI2);
    offCtx.fill();

    const sprite = { canvas, halfSize: spriteSize / 2 };
    return Particle._spriteCache.set(key, sprite);
  }

  /**
   * @param {number} size
   * @returns {number}
   * @private
   */
  static _quantizeSize(size) {
    const step = Particle._SIZE_STEP;
    return Math.round(size / step) * step;
  }
}

/** @type {SpriteCache<{ canvas: OffscreenCanvas | HTMLCanvasElement, halfSize: number }> | undefined} */
Particle._spriteCache = undefined;

/** @type {number} */
Particle._SIZE_STEP = 0.5;

/** Upper bound on distinct cached particle sprites (safety net; palette keeps steady state ~100). */
Particle._CACHE_MAX = 256;
