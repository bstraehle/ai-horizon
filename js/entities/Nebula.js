import { CONFIG, PI2 } from "../constants.js";

/**
 * Class representing nebula visual effects for the game background.
 * Provides static methods to initialize and render nebula gradients.
 *
 * Nebulae are rendered as radial gradients with randomized positions, radii, and colors.
 */
export class Nebula {
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
   */

  /**
   * @typedef {Object} NebulaConfig
   * @property {number} x
   * @property {number} y
   * @property {number} r
   * @property {string} color0
   * @property {string} color1
   * @property {number} [_variantIndex] - internal palette variant index for theme blending
   * @property {number} dx
   * @property {number} dy
   * @property {number} dr
   * @property {number} t
   * @property {NebulaBlob[]} blobs
   */

  /**
   * Initializes nebula configurations for rendering.
   * Generates an array of nebula objects with randomized position, radius, and color properties.
   *
   * @param {number} width - Canvas width in logical pixels.
   * @param {number} height - Canvas height in logical pixels.
   * @param {boolean} isMobile - Indicates if the rendering is for a mobile device, affecting nebula count and size.
   * @returns {NebulaConfig[]} Array of nebula configuration objects, each containing x, y, r, color0, and color1.
   */
  /**
   * @param {number} width
   * @param {number} height
   * @param {boolean} isMobile
   * @param {import('../types.js').RNGLike} [rng]
   */
  static init(width, height, isMobile, rng) {
    const nebulaColors = [
      { color0: CONFIG.COLORS.NEBULA.N1, color1: CONFIG.COLORS.NEBULA.N1_OUT },
      { color0: CONFIG.COLORS.NEBULA.N2, color1: CONFIG.COLORS.NEBULA.N2_OUT },
      { color0: CONFIG.COLORS.NEBULA.N3, color1: CONFIG.COLORS.NEBULA.N3_OUT },
      { color0: CONFIG.COLORS.NEBULA.N4, color1: CONFIG.COLORS.NEBULA.N4_OUT },
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
          // Initialize current offsets to the base values so the first
          // rendered frame (before any update) matches the generated layout
          // and doesn't visually jump when animation starts.
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
        // Track which palette index we chose so we can map to the target (red) theme for blending.
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
   * Animates nebula by updating position and radius over time.
   * @param {number} width - Canvas width in logical pixels.
   * @param {number} height - Canvas height in logical pixels.
   * @param {NebulaConfig[]} nebulaConfigs - Array of nebula configuration objects.
   * @param {boolean} isMobile - Indicates if the rendering is for a mobile device, affecting nebula count and size.
   */
  /**
   * @param {number} width
   * @param {number} height
   * @param {NebulaConfig[]} nebulaConfigs
   * @param {boolean} isMobile
   * @param {number} [dtSec]
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
   * Draws nebula gradients on the canvas using the provided nebula configurations.
   * Each nebula is rendered as a radial gradient at its specified position and radius.
   *
   * @param {CanvasRenderingContext2D} ctx - The canvas rendering context.
   * @param {NebulaConfig[]} nebulaConfigs - Array of nebula configuration objects from Nebula.init().
   */
  static draw(ctx, nebulaConfigs) {
    // Optional third argument allows callers to pass a 0..1 progress value for theme blending.
    // Preserve backwards compatibility by reading arguments instead of changing signature.
    const themeProgress =
      typeof arguments[2] === "number" ? Math.min(1, Math.max(0, arguments[2])) : 0;

    // Lazily define (once) the target "dangerous red" palette for transition.
    // We intentionally keep these values local to avoid re-introducing the red theme
    // globally; they only serve as blend targets.
    if (!this._targetRedPalette) {
      this._targetRedPalette = [
        { color0: "rgba(156, 58, 58, 0.11)", color1: "rgba(156, 58, 58, 0)" },
        { color0: "rgba(130, 40, 40, 0.12)", color1: "rgba(130, 40, 40, 0)" },
        { color0: "rgba(185, 90, 90, 0.10)", color1: "rgba(185, 90, 90, 0)" },
        { color0: "rgba(100, 28, 28, 0.13)", color1: "rgba(100, 28, 28, 0)" },
      ];
    }

    // Simple rgba() parser (numbers + float alpha) with caching for performance.
    const cache = (this._parseCache = this._parseCache || new Map());
    /**
     * Lightweight rgba() string parser with memoization.
     * @param {string} str
     * @returns {{r:number,g:number,b:number,a:number}}
     */
    const parse = (str) => {
      let v = cache.get(str);
      if (v) return v;
      const m = /rgba\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9]*\.?[0-9]+)\s*\)/.exec(str);
      if (!m) return { r: 255, g: 255, b: 255, a: 0 };
      v = { r: +m[1], g: +m[2], b: +m[3], a: +m[4] };
      cache.set(str, v);
      return v;
    };
    /**
     * Blend two rgba() strings.
     * @param {string} c0
     * @param {string} c1
     * @param {number} t 0..1
     * @returns {string}
     */
    const blend = (c0, c1, t) => {
      if (t <= 0) return c0;
      if (t >= 1) return c1;
      const a = parse(c0);
      const b = parse(c1);
      const r = Math.round(a.r + (b.r - a.r) * t);
      const g = Math.round(a.g + (b.g - a.g) * t);
      const bl = Math.round(a.b + (b.b - a.b) * t);
      const al = a.a + (b.a - a.a) * t;
      return `rgba(${r}, ${g}, ${bl}, ${al.toFixed(3)})`;
    };
    ctx.save();
    for (const nebula of nebulaConfigs) {
      const blobs = nebula.blobs || [
        {
          ox: 0,
          oy: 0,
          r: nebula.r,
          rot: 0,
          sx: 1,
          sy: 1,
        },
      ];
      // Determine variant index (fallback 0) and resolve target red colors.
      const vi = typeof nebula._variantIndex === "number" ? nebula._variantIndex : 0;
      const target = this._targetRedPalette[vi % this._targetRedPalette.length];
      // Compute blended colors for this nebula instance.
      const blendedColor0 = blend(nebula.color0, target.color0, themeProgress);
      const blendedColor1 = blend(nebula.color1, target.color1, themeProgress);
      for (const b of blobs) {
        ctx.save();
        ctx.translate(nebula.x + (b.ox || 0), nebula.y + (b.oy || 0));
        ctx.rotate(b.rot || 0);
        ctx.scale(b.sx || 1, b.sy || 1);
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, b.r || nebula.r);
        grad.addColorStop(0, blendedColor0);
        grad.addColorStop(1, blendedColor1);
        ctx.fillStyle = grad;
        ctx.globalCompositeOperation = "lighter";
        ctx.beginPath();
        ctx.arc(0, 0, b.r || nebula.r, 0, PI2);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  /**
   * Resize nebula configs from previous canvas size to new canvas size.
   * Scales positions and radii proportionally and adjusts blob base offsets.
   * @param {NebulaConfig[]} nebulaConfigs
   * @param {number} prevW
   * @param {number} prevH
   * @param {number} newW
   * @param {number} newH
   * @returns {NebulaConfig[]}
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
}
