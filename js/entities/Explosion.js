import { CONFIG, PI2 } from "../constants.js";
import { SpriteCache } from "../utils/SpriteCache.js";

/**
 * Explosion – radial expanding energy effect.
 *
 * Visual Model:
 *  - Life decays linearly; alpha derived from life/maxLife.
 *  - A flat white flash disc fades (alpha²) while a thin shockwave ring expands to
 *    (1 + (1 - alpha) * (SCALE_GAIN + 0.8)) × radius — the "clean minimal" impact.
 *  - Bigger blasts (a planet, a bonus planet, the player's ship: CONFIG.EXPLOSION.BLASTS) are the
 *    same shape at a larger width with a heavier ring; `accent` colours that ring.
 *
 * Pool Friendly: numeric state plus the accent colour; reset overwrites all fields.
 *
 * Rendering: blasts up to the standard width (CONFIG.EXPLOSION.SIZE, every destroyed rock) are
 * pre-rendered per quantized alpha step and looked up through a per-size table resolved at spawn
 * (integer index per frame, no cache-key strings in `draw`). Wider or accented blasts are rare
 * (one planet or ship at a time) and are painted directly, so their large frames take no sprite
 * memory.
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
   * @param {string|null} [accent=null] Colour of the shockwave ring (white when null)
   */
  constructor(x, y, width, height, life, maxLife, accent = null) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.life = life;
    this.maxLife = maxLife;
    this.accent = accent || null;
    /** @private @type {Array<ExplosionSprite|null|undefined>|null} Null: painted directly. */
    this._sprites = Explosion._spritesFor(width, height, this.accent);
  }

  /**
   * Age explosion toward expiry.
   * @param {number} [dtSec=CONFIG.TIME.DEFAULT_DT] Delta seconds.
   */
  update(dtSec = CONFIG.TIME.DEFAULT_DT) {
    this.life -= dtSec;
  }

  /**
   * Render the blast: a cached sprite for the standard ones, painted directly otherwise (bigger
   * or accented blasts, and environments without an offscreen canvas).
   * @param {CanvasRenderingContext2D} ctx 2D context.
   */
  draw(ctx) {
    const alphaRaw = this.maxLife > 0 ? this.life / this.maxLife : 0;
    const alpha = Math.max(0, Math.min(1, alphaRaw));
    const cx = this.x + this.width / 2;
    const cy = this.y + this.height / 2;
    const table = this._sprites;
    if (table) {
      const steps = Explosion._SPRITE_STEPS;
      const step = steps > 0 ? Math.round(alpha * steps) : 0;
      let sprite = table[step];
      if (sprite === undefined) {
        sprite = Explosion._getSprite(this.width, this.height, steps > 0 ? step / steps : alpha);
        table[step] = sprite;
      }
      if (sprite) {
        const drawX = cx - sprite.radius - sprite.pad;
        const drawY = cy - sprite.radius - sprite.pad;
        ctx.drawImage(sprite.canvas, drawX, drawY);
        return;
      }
    }
    ctx.save();
    Explosion._paint(ctx, cx, cy, this.width, alpha, this.accent);
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
   * @param {string|null} [accent=null] Colour of the shockwave ring (white when null)
   */
  reset(x, y, width, height, life, maxLife, accent = null) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.life = life;
    this.maxLife = maxLife;
    this.accent = accent || null;
    this._sprites = Explosion._spritesFor(width, height, this.accent);
  }

  /**
   * Sprite table of a blast, or null when it is painted directly: wider than the standard blast
   * or with an accent ring.
   * @param {number} width
   * @param {number} height
   * @param {string|null} accent
   * @returns {Array<ExplosionSprite|null|undefined>|null}
   * @private
   */
  static _spritesFor(width, height, accent) {
    if (accent || width > CONFIG.EXPLOSION.SIZE) return null;
    return Explosion._spriteTableFor(width, height);
  }

  /**
   * Shared alpha-step-indexed sprite table for an explosion size (lazily filled by `draw`).
   * @param {number} width
   * @param {number} height
   * @returns {Array<ExplosionSprite|null|undefined>}
   * @private
   */
  static _spriteTableFor(width, height) {
    const key = `${width}x${height}`;
    let table = Explosion._spriteTables.get(key);
    if (!table) {
      table = new Array(Explosion._SPRITE_STEPS + 1).fill(undefined);
      Explosion._spriteTables.set(key, table);
    }
    return table;
  }

  /**
   * Radius of the shockwave ring of a blast `width` wide at `alpha` (1 = just born, 0 = spent).
   * @param {number} width
   * @param {number} alpha
   * @returns {number}
   * @private
   */
  static _ringRadius(width, alpha) {
    return (width / 2) * (1 + (1 - alpha) * (CONFIG.EXPLOSION.SCALE_GAIN + 0.8));
  }

  /**
   * Paint one frame of a blast centred on (cx, cy): the fading flash disc and the shockwave ring.
   * Alphas are rounded to three decimals so the colour strings never use exponent notation.
   * Leaves fill / stroke state (and, with an accent, globalAlpha) changed.
   * @param {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} ctx
   * @param {number} cx
   * @param {number} cy
   * @param {number} width Base width of the blast.
   * @param {number} alpha Remaining life fraction in [0, 1].
   * @param {string|null} [accent=null] Colour of the ring (white when null).
   * @private
   */
  static _paint(ctx, cx, cy, width, alpha, accent = null) {
    const C = CONFIG.COLORS.EXPLOSION;
    const progress = 1 - alpha;
    const round = (/** @type {number} */ v) => Math.round(v * 1000) / 1000;
    // Flash: a flat disc that fades quickly; a soft edge keeps it from looking cut out.
    const flashRadius = (width / 2) * (0.55 + progress * 0.45);
    const flashAlpha = round(alpha * alpha);
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, flashRadius);
    gradient.addColorStop(0, `${C.GRAD_IN}${flashAlpha})`);
    gradient.addColorStop(0.7, `${C.GRAD_MID1}${round(flashAlpha * 0.9)})`);
    gradient.addColorStop(1, C.GRAD_OUT);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, flashRadius, 0, PI2);
    ctx.fill();
    // Shockwave ring: thin line racing outward, fading as it expands; heavier on bigger blasts.
    if (progress > 0.05 && C.RING) {
      const ringAlpha = round(Math.max(0, 0.95 * alpha));
      if (accent) {
        ctx.globalAlpha = ringAlpha;
        ctx.strokeStyle = accent;
      } else {
        ctx.strokeStyle = `${C.RING}${ringAlpha})`;
      }
      const weight = Math.max(1, Math.sqrt(width / CONFIG.EXPLOSION.SIZE));
      ctx.lineWidth = Math.max(1, 2.2 * alpha + 0.6) * weight;
      ctx.beginPath();
      ctx.arc(cx, cy, Explosion._ringRadius(width, alpha), 0, PI2);
      ctx.stroke();
    }
  }

  /**
   * @param {number} width
   * @param {number} height
   * @param {number} alpha
   * @returns {ExplosionSprite | null}
   * @private
   */
  static _getSprite(width, height, alpha) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return null;
    }
    if (!Explosion._spriteCache) Explosion._spriteCache = new SpriteCache(64);
    const key = `${width.toFixed(2)}x${height.toFixed(2)}@${alpha.toFixed(3)}`;
    const cached = Explosion._spriteCache.get(key);
    if (cached) return cached;

    // Frame layout: a flat flash disc fades while a thin shockwave ring races outward; the sprite
    // is sized to the ring at this step so both stay inside the canvas.
    const pad = 6;
    const outer = Explosion._ringRadius(width, alpha);
    const size = Math.ceil(outer * 2 + pad * 2);
    let canvas;
    if (typeof OffscreenCanvas === "function") {
      canvas = new OffscreenCanvas(size, size);
    } else {
      const elem = typeof document !== "undefined" ? document.createElement("canvas") : null;
      if (!elem) return null;
      elem.width = size;
      elem.height = size;
      canvas = elem;
    }
    const offCtx = canvas.getContext("2d");
    if (!offCtx) return null;
    offCtx.clearRect(0, 0, size, size);
    Explosion._paint(offCtx, size / 2, size / 2, width, alpha);
    const sprite = { canvas, pad, radius: outer };
    Explosion._spriteCache.set(key, sprite);
    return sprite;
  }

  /**
   * Quantize alpha to reduce sprite variants.
   * @param {number} alpha
   * @returns {number}
   * @private
   */
  static _quantizeAlpha(alpha) {
    const steps = Explosion._SPRITE_STEPS;
    return steps > 0 ? Math.round(alpha * steps) / steps : alpha;
  }

  /** Pre-populate sprite cache for common explosion states. */
  static preloadSprites() {
    const steps = Explosion._SPRITE_STEPS;
    const width = CONFIG.EXPLOSION.SIZE;
    const height = CONFIG.EXPLOSION.SIZE;
    for (let i = 0; i <= steps; i++) {
      const alpha = i / steps;
      Explosion._getSprite(width, height, alpha);
    }
  }
}

/** @typedef {{ canvas: OffscreenCanvas | HTMLCanvasElement, pad: number, radius: number }} ExplosionSprite */

/** @type {SpriteCache<ExplosionSprite> | undefined} */
Explosion._spriteCache = undefined;
/** Alpha-step-indexed sprite tables keyed by "WxH" (see `_spriteTableFor`). */
/** @type {Map<string, Array<ExplosionSprite|null|undefined>>} */
Explosion._spriteTables = new Map();
Explosion._SPRITE_STEPS = 12;
