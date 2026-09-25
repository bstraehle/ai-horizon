import { CONFIG, PI2 } from "../constants.js";
import { SpriteCache } from "../utils/SpriteCache.js";

/**
 * Nebula – procedural multi-blob soft glow backgrounds (parallax-lite layer).
 *
 * Overview:
 *  - Each nebula configuration = central position + base radius + color pair + animated sub-blobs.
 *  - Blobs wobble (offset sine/cos) & rotate / scale providing subtle motion without heavy particle cost.
 *  - Primarily aesthetic; not interactive and rendered with additive blending (lighter).
 *
 * Determinism: Optional RNGLike can seed creation for reproducible themes.
 * Performance: Blob count & wobble math chosen to remain small (O(totalBlobs)). Disable or reduce counts via CONFIG for low-end.
 */
export class Nebula {
  /** @type {WeakMap<CanvasRenderingContext2D, Map<string, CanvasGradient>>} */
  static _gradientCache = new WeakMap();

  /**
   * @typedef {Object} NebulaBlob
   * @property {number} baseOx
   * @property {number} baseOy
   * @property {number} ox
   * @property {number} oy
   * @property {number} r
   * @property {number} rot
   * @property {number} sx
   * @property {number} sy
   * @property {number} wobbleAmp
   * @property {number} wobbleRate
   * @property {number} wobbleOffset
   * @property {{ canvas: OffscreenCanvas | HTMLCanvasElement, size: number, halfSize: number } | null} [_sprite] Render cache: resolved sprite for `_spriteR`
   * @property {number} [_spriteR] Render cache: radius the cached sprite was resolved for
   */

  /**
   * @typedef {Object} NebulaConfig
   * @property {number} x
   * @property {number} y
   * @property {number} r
   * @property {string} color0
   * @property {string} color1
   * @property {number} [_variantIndex]
   * @property {number} dx
   * @property {number} dy
   * @property {number} dr
   * @property {number} t
   * @property {NebulaBlob[]} blobs
   */

  /**
   * Initialize a nebula configuration array.
   *
   * Behavior:
   *  - Chooses color variant randomly from theme list.
   *  - Derives blobCount with mobile-aware config differences.
   *  - Each blob stores base offsets (baseOx/baseOy) plus runtime wobble parameters.
   *
   * @param {number} width Canvas width.
   * @param {number} height Canvas height.
   * @param {boolean} isMobile Mobile flag (affects counts & size ranges).
   * @param {import('../types.js').RNGLike} [rng] Optional RNG for determinism (must expose nextFloat()).
   * @param {"red"|"blue"} [palette="red"] Palette to use for nebula color variants.
   * @returns {NebulaConfig[]} Array of nebula runtime configs.
   */
  static init(width, height, isMobile, rng, palette = "red") {
    const useBlue = palette === "blue";
    const nebulaColors = useBlue
      ? [
          { color0: CONFIG.COLORS.NEBULA_BLUE.B1, color1: CONFIG.COLORS.NEBULA_BLUE.B1_OUT },
          { color0: CONFIG.COLORS.NEBULA_BLUE.B2, color1: CONFIG.COLORS.NEBULA_BLUE.B2_OUT },
          { color0: CONFIG.COLORS.NEBULA_BLUE.B3, color1: CONFIG.COLORS.NEBULA_BLUE.B3_OUT },
          { color0: CONFIG.COLORS.NEBULA_BLUE.B4, color1: CONFIG.COLORS.NEBULA_BLUE.B4_OUT },
        ]
      : [
          { color0: CONFIG.COLORS.NEBULA_RED.N1, color1: CONFIG.COLORS.NEBULA_RED.N1_OUT },
          { color0: CONFIG.COLORS.NEBULA_RED.N2, color1: CONFIG.COLORS.NEBULA_RED.N2_OUT },
          { color0: CONFIG.COLORS.NEBULA_RED.N3, color1: CONFIG.COLORS.NEBULA_RED.N3_OUT },
          { color0: CONFIG.COLORS.NEBULA_RED.N4, color1: CONFIG.COLORS.NEBULA_RED.N4_OUT },
        ];
    const count = isMobile ? CONFIG.NEBULA.COUNT_MOBILE : CONFIG.NEBULA.COUNT_DESKTOP;
    const radiusMin = isMobile ? CONFIG.NEBULA.RADIUS_MIN_MOBILE : CONFIG.NEBULA.RADIUS_MIN_DESKTOP;
    const radiusMax = isMobile ? CONFIG.NEBULA.RADIUS_MAX_MOBILE : CONFIG.NEBULA.RADIUS_MAX_DESKTOP;
    const rand = rng || { nextFloat: Math.random.bind(Math) };
    return Array.from({ length: count }, () => {
      const colorSet = nebulaColors[Math.floor(rand.nextFloat() * nebulaColors.length)];
      const baseR = rand.nextFloat() * radiusMax + radiusMin;
      const blobCount =
        (isMobile ? CONFIG.NEBULA.BLOB_COUNT_BASE_MOBILE : CONFIG.NEBULA.BLOB_COUNT_BASE_DESKTOP) +
        Math.floor(
          rand.nextFloat() *
            (isMobile ? CONFIG.NEBULA.BLOB_COUNT_VAR_MOBILE : CONFIG.NEBULA.BLOB_COUNT_VAR_DESKTOP)
        );
      const blobs = Array.from({ length: blobCount }, () => {
        const dist = rand.nextFloat() * baseR * 0.6;
        const ang = rand.nextFloat() * CONFIG.TWO_PI;
        const r =
          baseR *
          (CONFIG.NEBULA.BLOB_MIN_FACTOR + rand.nextFloat() * CONFIG.NEBULA.BLOB_VAR_FACTOR);
        const sx = 0.8 + rand.nextFloat() * 1.2;
        const sy = 0.6 + rand.nextFloat() * 1.0;
        const baseOx = Math.cos(ang) * dist;
        const baseOy = Math.sin(ang) * dist;
        return {
          baseOx,
          baseOy,
          ox: baseOx,
          oy: baseOy,
          r,
          rot: rand.nextFloat() * CONFIG.TWO_PI,
          sx,
          sy,
          wobbleAmp: CONFIG.NEBULA.WOBBLE_AMP_MIN + rand.nextFloat() * CONFIG.NEBULA.WOBBLE_AMP_VAR,
          wobbleRate:
            (CONFIG.NEBULA.WOBBLE_RATE_BASE + rand.nextFloat() * CONFIG.NEBULA.WOBBLE_RATE_VAR) *
            CONFIG.NEBULA.WOBBLE_RATE_SCALE,
          wobbleOffset: rand.nextFloat() * 1000,
        };
      });
      return {
        x: rand.nextFloat() * width,
        y: rand.nextFloat() * height,
        r: baseR,
        color0: colorSet.color0,
        color1: colorSet.color1,
        _variantIndex: nebulaColors.indexOf(colorSet),
        dx: (rand.nextFloat() - 0.5) * CONFIG.NEBULA.SPEED_JITTER * CONFIG.NEBULA.SPEED_SCALE,
        dy: (rand.nextFloat() - 0.5) * CONFIG.NEBULA.SPEED_JITTER * CONFIG.NEBULA.SPEED_SCALE,
        dr:
          (rand.nextFloat() - 0.5) *
          CONFIG.NEBULA.RADIUS_RATE_JITTER *
          CONFIG.NEBULA.RADIUS_RATE_SCALE,
        t: rand.nextFloat() * 10,
        blobs,
      };
    });
  }

  /**
   * Advance nebula animation (position drift + radius modulation + blob wobble).
   *
   * Wobble Model: Each blob uses independent sine/cos pairs with rate offsets for organic motion.
   * Clamping: Reverses velocity components when exceeding canvas or radius limits.
   * Complexity: O(N + totalBlobs) each frame.
   *
   * @param {number} width Canvas width.
   * @param {number} height Canvas height.
   * @param {NebulaConfig[]} nebulaConfigs Mutable array from init().
   * @param {boolean} isMobile Mobile flag (used for min/max radius bounds).
   * @param {number} [dtSec=CONFIG.TIME.DEFAULT_DT] Delta time seconds.
   */
  static update(width, height, nebulaConfigs, isMobile, dtSec = CONFIG.TIME.DEFAULT_DT) {
    for (const nebula of nebulaConfigs) {
      nebula.x += nebula.dx * dtSec;
      nebula.y += nebula.dy * dtSec;
      nebula.r += nebula.dr * dtSec;
      nebula.t += dtSec;
      const radiusMin = isMobile
        ? CONFIG.NEBULA.RADIUS_MIN_MOBILE
        : CONFIG.NEBULA.RADIUS_MIN_DESKTOP;
      const radiusMax = isMobile
        ? CONFIG.NEBULA.RADIUS_MAX_MOBILE
        : CONFIG.NEBULA.RADIUS_MAX_DESKTOP;
      if (nebula.x < 0 || nebula.x > width) nebula.dx *= -1;
      if (nebula.y < 0 || nebula.y > height) nebula.dy *= -1;
      if (nebula.r < radiusMin || nebula.r > radiusMax) nebula.dr *= -1;
      if (nebula.blobs) {
        for (let i = 0; i < nebula.blobs.length; i++) {
          const b = nebula.blobs[i];
          const phase = nebula.t * b.wobbleRate + b.wobbleOffset;
          const wobX = Math.cos(phase) * b.wobbleAmp;
          const wobY = Math.sin(phase * 0.9) * b.wobbleAmp * 0.7;
          b.ox = b.baseOx + wobX;
          b.oy = b.baseOy + wobY;
        }
      }
    }
  }

  /**
   * Render nebula layers (each blob as a cached radial-gradient sprite with additive blending).
   *
   * Blend Mode: uses globalCompositeOperation 'lighter' for glow accumulation (set once per call).
   * Transforms: each blob's translate·rotate·scale is composed with the context's current base
   * transform and applied via a single `setTransform`, avoiding a save/restore pair per blob.
   * Contexts without `getTransform` (older browsers, test doubles) use the save/restore path.
   * Sprites are resolved once per blob and cached on the blob (`_sprite`), so steady-state draws
   * build no strings.
   * Fallback: if no blobs property, synthesizes single blob (legacy compatibility).
   *
   * @param {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} ctx 2D context.
   * @param {NebulaConfig[]} nebulaConfigs Array from init().
   */
  static draw(ctx, nebulaConfigs) {
    const anyCtx = /** @type {any} */ (ctx);
    if (typeof anyCtx.getTransform !== "function" || typeof anyCtx.setTransform !== "function") {
      Nebula._drawWithSaveRestore(ctx, nebulaConfigs);
      return;
    }
    const base = anyCtx.getTransform();
    const ba = base.a;
    const bb = base.b;
    const bc = base.c;
    const bd = base.d;
    const be = base.e;
    const bf = base.f;
    const prevComposite = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";
    for (let n = 0; n < nebulaConfigs.length; n++) {
      const nebula = nebulaConfigs[n];
      const blobs = nebula.blobs || Nebula._legacyBlobs(nebula);
      for (let i = 0; i < blobs.length; i++) {
        const b = blobs[i];
        const r = b.r || nebula.r;
        const sprite = Nebula._spriteForBlob(b, nebula, r);
        const ox = nebula.x + (b.ox || 0);
        const oy = nebula.y + (b.oy || 0);
        const rot = b.rot || 0;
        const sx = b.sx || 1;
        const sy = b.sy || 1;
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);
        // blob = translate(ox,oy) · rotate(rot) · scale(sx,sy); compose with base on the left.
        const a = cos * sx;
        const bm = sin * sx;
        const c = -sin * sy;
        const d = cos * sy;
        ctx.setTransform(
          ba * a + bc * bm,
          bb * a + bd * bm,
          ba * c + bc * d,
          bb * c + bd * d,
          ba * ox + bc * oy + be,
          bb * ox + bd * oy + bf
        );
        if (sprite) {
          ctx.drawImage(
            sprite.canvas,
            -sprite.halfSize,
            -sprite.halfSize,
            sprite.size,
            sprite.size
          );
        } else {
          Nebula._drawBlob(ctx, nebula.color0, nebula.color1, r);
        }
      }
    }
    ctx.setTransform(ba, bb, bc, bd, be, bf);
    ctx.globalCompositeOperation = prevComposite;
  }

  /**
   * Legacy drawing path using save/translate/rotate/scale/restore per blob.
   * @param {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} ctx
   * @param {NebulaConfig[]} nebulaConfigs
   * @private
   */
  static _drawWithSaveRestore(ctx, nebulaConfigs) {
    ctx.save();
    for (const nebula of nebulaConfigs) {
      const blobs = nebula.blobs || Nebula._legacyBlobs(nebula);
      for (const b of blobs) {
        const r = b.r || nebula.r;
        const sprite = Nebula._spriteForBlob(b, nebula, r);
        ctx.save();
        ctx.translate(nebula.x + (b.ox || 0), nebula.y + (b.oy || 0));
        ctx.rotate(b.rot || 0);
        ctx.scale(b.sx || 1, b.sy || 1);
        if (sprite) {
          ctx.globalCompositeOperation = "lighter";
          ctx.drawImage(
            sprite.canvas,
            -sprite.halfSize,
            -sprite.halfSize,
            sprite.size,
            sprite.size
          );
        } else {
          Nebula._drawBlob(ctx, nebula.color0, nebula.color1, r);
        }
        ctx.restore();
      }
    }
    ctx.restore();
  }

  /**
   * Resolve (and cache on the blob) the sprite for a blob radius.
   * @param {NebulaBlob} b
   * @param {NebulaConfig} nebula
   * @param {number} r
   * @returns {{ canvas: OffscreenCanvas | HTMLCanvasElement, size: number, halfSize: number } | null}
   * @private
   */
  static _spriteForBlob(b, nebula, r) {
    if (b._sprite !== undefined && b._spriteR === r) return b._sprite;
    const sprite = Nebula._getSprite(nebula.color0, nebula.color1, r);
    b._sprite = sprite;
    b._spriteR = r;
    return sprite;
  }

  /**
   * Single centered blob for configs predating the multi-blob model.
   * @param {NebulaConfig} nebula
   * @returns {NebulaBlob[]}
   * @private
   */
  static _legacyBlobs(nebula) {
    return [
      {
        baseOx: 0,
        baseOy: 0,
        ox: 0,
        oy: 0,
        r: nebula.r,
        rot: 0,
        sx: 1,
        sy: 1,
        wobbleAmp: 0,
        wobbleRate: 0,
        wobbleOffset: 0,
      },
    ];
  }

  /**
   * Scale nebula configuration set to new canvas dimensions.
   *
   * Approach:
   *  - Scale x,y independently (sx, sy) for position retention.
   *  - Radius & blob radii scaled by average factor to preserve circular aspect visually.
   *
   * @param {NebulaConfig[]} nebulaConfigs Existing config array.
   * @param {number} prevW Previous width.
   * @param {number} prevH Previous height.
   * @param {number} newW New width.
   * @param {number} newH New height.
   * @returns {NebulaConfig[]} New scaled configs.
   */
  static resize(nebulaConfigs, prevW, prevH, newW, newH) {
    if (!nebulaConfigs || prevW <= 0 || prevH <= 0) return nebulaConfigs;
    const sx = newW / prevW;
    const sy = newH / prevH;
    const sAvg = (sx + sy) / 2;
    return nebulaConfigs.map((n) => {
      const blobs = (n.blobs || []).map((b) => ({
        ...b,
        baseOx: (b.baseOx || 0) * sx,
        baseOy: (b.baseOy || 0) * sy,
        ox: (b.ox || 0) * sx,
        oy: (b.oy || 0) * sy,
        r: (b.r || 0) * sAvg,
        _sprite: undefined,
        _spriteR: undefined,
      }));
      return {
        ...n,
        x: (n.x || 0) * sx,
        y: (n.y || 0) * sy,
        r: (n.r || 0) * sAvg,
        _variantIndex: n._variantIndex,
        blobs,
      };
    });
  }

  /**
   * Draw a single blob directly to the current context (fallback when no sprite cached).
   * @param {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} ctx
   * @param {string} color0
   * @param {string} color1
   * @param {number} radius
   * @private
   */
  static _drawBlob(ctx, color0, color1, radius) {
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    grad.addColorStop(0, color0);
    grad.addColorStop(1, color1);
    ctx.fillStyle = grad;
    ctx.globalCompositeOperation = "lighter";
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, PI2);
    ctx.fill();
  }

  /**
   * Retrieve or cache a rendered nebula blob sprite by color pair + radius.
   * @param {string} color0
   * @param {string} color1
   * @param {number} radius
   * @returns {{ canvas: OffscreenCanvas | HTMLCanvasElement, size: number, halfSize: number } | null}
   * @private
   */
  static _getSprite(color0, color1, radius) {
    if (!Number.isFinite(radius) || radius <= 0) return null;
    if (!Nebula._spriteCache) Nebula._spriteCache = new SpriteCache(128);
    const quantRadius = Nebula._quantizeRadius(radius);
    const key = `${color0}|${color1}|${quantRadius.toFixed(2)}`;
    const cached = Nebula._spriteCache.get(key);
    if (cached) return cached;

    const size = Math.ceil(quantRadius * 2 + 4);
    let canvas;
    if (typeof OffscreenCanvas === "function") canvas = new OffscreenCanvas(size, size);
    else {
      const elem = typeof document !== "undefined" ? document.createElement("canvas") : null;
      if (!elem) return null;
      elem.width = size;
      elem.height = size;
      canvas = elem;
    }
    const offCtx = canvas.getContext("2d");
    if (!offCtx) return null;
    offCtx.clearRect(0, 0, size, size);
    offCtx.save();
    offCtx.translate(size / 2, size / 2);
    Nebula._drawBlob(offCtx, color0, color1, quantRadius);
    offCtx.restore();
    const sprite = { canvas, size, halfSize: size / 2 };
    Nebula._spriteCache.set(key, sprite);
    return sprite;
  }

  /**
   * Quantize radius to limit sprite variations.
   * @param {number} radius
   * @returns {number}
   * @private
   */
  static _quantizeRadius(radius) {
    const step = Nebula._RADIUS_STEP;
    return Math.round(radius / step) * step;
  }

  /**
   * Preload sprite variants for common radius buckets.
   * @param {number[]} [radii]
   */
  static preloadSprites(radii) {
    const list = Array.isArray(radii) && radii.length ? radii : [80, 120, 200];
    const colors = [
      [CONFIG.COLORS.NEBULA_RED.N1, CONFIG.COLORS.NEBULA_RED.N1_OUT],
      [CONFIG.COLORS.NEBULA_RED.N2, CONFIG.COLORS.NEBULA_RED.N2_OUT],
      [CONFIG.COLORS.NEBULA_RED.N3, CONFIG.COLORS.NEBULA_RED.N3_OUT],
      [CONFIG.COLORS.NEBULA_RED.N4, CONFIG.COLORS.NEBULA_RED.N4_OUT],
      [CONFIG.COLORS.NEBULA_BLUE.B1, CONFIG.COLORS.NEBULA_BLUE.B1_OUT],
      [CONFIG.COLORS.NEBULA_BLUE.B2, CONFIG.COLORS.NEBULA_BLUE.B2_OUT],
      [CONFIG.COLORS.NEBULA_BLUE.B3, CONFIG.COLORS.NEBULA_BLUE.B3_OUT],
      [CONFIG.COLORS.NEBULA_BLUE.B4, CONFIG.COLORS.NEBULA_BLUE.B4_OUT],
    ];
    for (const radius of list) {
      for (const [c0, c1] of colors) Nebula._getSprite(c0, c1, radius);
    }
  }
}

/** @type {SpriteCache<{ canvas: OffscreenCanvas | HTMLCanvasElement, size: number, halfSize: number }> | undefined} */
Nebula._spriteCache = undefined;
Nebula._RADIUS_STEP = 8;
