import { CONFIG } from "../constants.js";
import { SpriteCache } from "../utils/SpriteCache.js";

/**
 * StarField – procedural background star layers (legacy single array or layered structure).
 *
 * Modes:
 *  - Legacy: returns StarData[] when CONFIG.STARFIELD.LAYERS absent/empty.
 *  - Layered: returns { layers: [{name, stars: StarData[], config:{twinkleRate, twinkleXFactor}}] }.
 *
 * Twinkle: alpha modulation by sin(time * twinkleRate + x * twinkleXFactor).
 * Movement: vertical drift; stars recycled to RESET_Y when passing bottom.
 */
export class StarField {
  /**
   * @typedef {Object} StarData
   * @property {number} x
   * @property {number} y
   * @property {number} size
   * @property {number} speed
   * @property {number} brightness
   * @property {number} twinkleOffset
   * @property {number} [variant] Colour/shape variant index (see VARIANTS); derived lazily when absent
   * @property {{ canvas: OffscreenCanvas | HTMLCanvasElement, offset: number } | null} [_sprite] Render cache: sprite resolved for `_spriteSize`
   * @property {number} [_spriteSize] Render cache: size the cached sprite was resolved for
   */

  /**
   * Initialize star field runtime structure.
   *
   * Behavior:
   *  - Builds either flat array or layered object depending on CONFIG.STARFIELD.LAYERS.
   *  - Each star assigned size/speed/brightness from configurable ranges.
   *  - Mobile flag reduces count using STARFIELD_COUNT_MOBILE if provided.
   *
   * @param {number} width Canvas width.
   * @param {number} height Canvas height.
   * @param {import('../types.js').RNGLike} [rng] Optional RNG (nextFloat()).
   * @param {boolean} [isMobile=false] Mobile flag.
   * @param {number} [qualityScale=1] Optional scale factor (0-1] for low-power modes.
   * @returns {StarData[] | {layers:Array<{name:string,stars:StarData[],config:{twinkleRate:number,twinkleXFactor:number}}>} }
   */
  static init(width, height, rng, isMobile = false, qualityScale = 1) {
    const rand = rng || { nextFloat: Math.random.bind(Math) };
    const baseCount = StarField.baseCount(isMobile, qualityScale);

    /** @type {LayerDef[] | null} */
    const layerDefs = Array.isArray(CONFIG.STARFIELD.LAYERS) ? CONFIG.STARFIELD.LAYERS : null;
    if (!layerDefs || layerDefs.length === 0) {
      return Array.from({ length: baseCount }, () =>
        StarField._makeStar(rand, width, height, null, CONFIG.STARFIELD.TWINKLE_X_FACTOR)
      );
    }

    /** @typedef {{name:string, stars:StarData[], config:{twinkleRate:number, twinkleXFactor:number}}} LayerRuntime */
    /** @type {LayerRuntime[]} */
    const layers = layerDefs.map((ld /** @type {LayerDef} */) => {
      const layerCount = Math.max(1, Math.round(baseCount * (ld.countFactor || 1)));
      const twinkleFactor = ld.twinkleXFactor || CONFIG.STARFIELD.TWINKLE_X_FACTOR;
      const stars = Array.from({ length: layerCount }, () =>
        StarField._makeStar(rand, width, height, ld, twinkleFactor)
      );
      return {
        name: ld.name || "layer",
        stars,
        config: {
          twinkleRate: ld.twinkleRate || CONFIG.STARFIELD.TWINKLE_RATE,
          twinkleXFactor: ld.twinkleXFactor || CONFIG.STARFIELD.TWINKLE_X_FACTOR,
        },
      };
    });
    return { layers };
  }

  /**
   * Total star budget for a platform / quality scale (before per-layer count factors).
   * @param {boolean} [isMobile=false]
   * @param {number} [qualityScale=1] Clamped to [CONFIG.PERFORMANCE.MIN_STARFIELD_SCALE, 1].
   * @returns {number}
   */
  static baseCount(isMobile = false, qualityScale = 1) {
    const perf = CONFIG.PERFORMANCE || {};
    const minScale = typeof perf.MIN_STARFIELD_SCALE === "number" ? perf.MIN_STARFIELD_SCALE : 0.35;
    const clampScale = Math.max(
      minScale,
      Math.min(1, typeof qualityScale === "number" ? qualityScale : 1)
    );
    const baseTarget = isMobile
      ? CONFIG.GAME.STARFIELD_COUNT_MOBILE || CONFIG.GAME.STARFIELD_COUNT
      : CONFIG.GAME.STARFIELD_COUNT;
    return Math.max(1, Math.round(baseTarget * clampScale));
  }

  /**
   * Adjust star counts in place to match a new quality scale (used by adaptive performance tiers).
   * Surplus stars are dropped from the end of each layer and missing stars are appended at random
   * positions; existing stars keep their state, so a tier change never visibly re-rolls the sky.
   *
   * @param {StarData[] | {layers:Array<{stars:StarData[],config:{twinkleRate:number,twinkleXFactor:number}}>}} starField Runtime structure from init() (mutated).
   * @param {number} width Canvas width.
   * @param {number} height Canvas height.
   * @param {import('../types.js').RNGLike} [rng] RNG for appended stars (visual-only randomness).
   * @param {boolean} [isMobile=false] Mobile flag (selects the base star budget).
   * @param {number} [qualityScale=1] Quality scale (0-1].
   * @returns {StarData[] | {layers:Array<{stars:StarData[],config:{twinkleRate:number,twinkleXFactor:number}}>}} The same structure, adjusted.
   */
  static setDensity(starField, width, height, rng, isMobile = false, qualityScale = 1) {
    if (!starField) return starField;
    const rand = rng || { nextFloat: Math.random.bind(Math) };
    const baseCount = StarField.baseCount(isMobile, qualityScale);
    if (Array.isArray(starField)) {
      StarField._fitCount(starField, baseCount, () =>
        StarField._makeStar(rand, width, height, null, CONFIG.STARFIELD.TWINKLE_X_FACTOR)
      );
      return starField;
    }
    const layered = /** @type {any} */ (starField);
    /** @type {LayerDef[]} */
    const layerDefs = Array.isArray(CONFIG.STARFIELD.LAYERS) ? CONFIG.STARFIELD.LAYERS : [];
    if (Array.isArray(layered.layers)) {
      for (let i = 0; i < layered.layers.length; i++) {
        const layer = layered.layers[i];
        const ld = layerDefs[i] || {};
        const desired = Math.max(1, Math.round(baseCount * (ld.countFactor || 1)));
        const twinkleFactor =
          (layer.config && layer.config.twinkleXFactor) || CONFIG.STARFIELD.TWINKLE_X_FACTOR;
        StarField._fitCount(layer.stars, desired, () =>
          StarField._makeStar(rand, width, height, ld, twinkleFactor)
        );
      }
    }
    return starField;
  }

  /**
   * @typedef {{ name?:string, countFactor?:number, sizeMult?:number, speedMult?:number, brightnessMult?:number, twinkleRate?:number, twinkleXFactor?:number }} LayerDef
   */

  /**
   * Create one star; RNG draw order (x, y, size, speed, brightness) is part of the seeded contract.
   * @param {{ nextFloat:()=>number }} rand
   * @param {number} width
   * @param {number} height
   * @param {LayerDef|null} ld Layer definition for multipliers (null = legacy single layer).
   * @param {number} twinkleFactor
   * @returns {StarData}
   * @private
   */
  static _makeStar(rand, width, height, ld, twinkleFactor) {
    const x = rand.nextFloat() * width;
    return {
      x,
      y: rand.nextFloat() * height,
      size:
        (rand.nextFloat() * CONFIG.STARFIELD.SIZE_VAR + CONFIG.STARFIELD.SIZE_MIN) *
        ((ld && ld.sizeMult) || 1),
      speed:
        (rand.nextFloat() * CONFIG.STARFIELD.SPEED_VAR + CONFIG.STARFIELD.SPEED_MIN) *
        ((ld && ld.speedMult) || 1),
      brightness:
        (rand.nextFloat() * CONFIG.STARFIELD.BRIGHTNESS_VAR + CONFIG.STARFIELD.BRIGHTNESS_MIN) *
        ((ld && ld.brightnessMult) || 1),
      twinkleOffset: x * twinkleFactor,
    };
  }

  /**
   * Truncate or extend an array in place to `desired` entries.
   * @param {StarData[]} stars
   * @param {number} desired
   * @param {() => StarData} make
   * @private
   */
  static _fitCount(stars, desired, make) {
    if (stars.length > desired) stars.length = desired;
    while (stars.length < desired) stars.push(make());
  }

  /**
   * Render star field (advances motion unless paused, applies twinkle modulation).
   *
   * @param {CanvasRenderingContext2D} ctx 2D context.
   * @param {number} width Canvas width.
   * @param {number} height Canvas height.
   * @param {StarData[] | {layers:Array<{stars:StarData[],config:{twinkleRate:number,twinkleXFactor:number}}>} } starField Runtime structure from init().
   * @param {number} timeSec Elapsed time seconds.
   * @param {boolean} [paused=false] If true, vertical advancement disabled.
   * @param {number} [dtSec=CONFIG.TIME.DEFAULT_DT] Delta seconds.
   * @param {{ nextFloat:()=>number }=} rng Optional RNG for respawn x jitter.
   */
  static draw(
    ctx,
    width,
    height,
    starField,
    timeSec,
    paused = false,
    dtSec = CONFIG.TIME.DEFAULT_DT,
    rng = undefined
  ) {
    if (!starField) return;
    ctx.save();
    const blurMult = CONFIG.STARFIELD.SHADOW_BLUR_MULT;

    /**
     * @param {StarData[]} stars
     * @param {number} twinkleRate
     * @param {number} twinkleXFactor
     */
    const drawStars = (stars, twinkleRate, twinkleXFactor) => {
      let prevAlpha = -1;
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        if (!paused) {
          star.y += star.speed * dtSec;
          if (star.y > height) {
            star.y = CONFIG.STARFIELD.RESET_Y;
            star.x = (rng ? rng.nextFloat() : Math.random()) * width;
            star.twinkleOffset = star.x * twinkleXFactor;
          }
        }
        if (typeof star.twinkleOffset !== "number") {
          star.twinkleOffset = star.x * twinkleXFactor;
        }
        const twinkle = Math.sin(timeSec * twinkleRate + star.twinkleOffset) * 0.3 + 0.7;
        const alpha = Math.max(0, Math.min(1, star.brightness * twinkle));
        if (alpha <= 0.01) continue;
        if (Math.abs(alpha - prevAlpha) > 0.001) {
          ctx.globalAlpha = alpha;
          prevAlpha = alpha;
        }
        if (star.variant === undefined) star.variant = StarField.variantFor(star);
        // Sprite resolved once per star (re-resolved only if its size changes, e.g. after resize).
        let sprite = star._sprite;
        if (sprite === undefined || star._spriteSize !== star.size) {
          sprite = StarField._getSprite(star.size, blurMult, star.variant);
          star._sprite = sprite;
          star._spriteSize = star.size;
        }
        if (sprite) {
          ctx.drawImage(sprite.canvas, star.x - sprite.offset, star.y - sprite.offset);
        } else {
          ctx.save();
          const color = StarField.VARIANTS[star.variant] || StarField.VARIANTS[0];
          ctx.fillStyle = color.color;
          ctx.shadowColor = color.color;
          ctx.shadowBlur = star.size * blurMult;
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    };

    if (Array.isArray(starField)) {
      drawStars(starField, CONFIG.STARFIELD.TWINKLE_RATE, CONFIG.STARFIELD.TWINKLE_X_FACTOR);
    } else if (starField && /** @type {any} */ (starField).layers) {
      for (let i = 0; i < /** @type {any} */ (starField).layers.length; i++) {
        const layer = /** @type {any} */ (starField).layers[i];
        drawStars(
          layer.stars,
          (layer.config && layer.config.twinkleRate) || CONFIG.STARFIELD.TWINKLE_RATE,
          (layer.config && layer.config.twinkleXFactor) || CONFIG.STARFIELD.TWINKLE_X_FACTOR
        );
      }
    }
    ctx.restore();
  }

  /**
   * Resize star field (legacy or layered) to new canvas dimensions.
   *
   * Scaling Strategy:
   *  - x,y scaled individually; size & speed scaled by average factor for consistent look.
   *  - Brightness unchanged.
   *
   * @param {StarData[] | {layers:Array<{stars:StarData[]}>}} starField Existing structure.
   * @param {number} prevW Previous width.
   * @param {number} prevH Previous height.
   * @param {number} newW New width.
   * @param {number} newH New height.
   * @returns {any} New scaled structure matching original shape.
   */
  static resize(starField, prevW, prevH, newW, newH) {
    if (!starField || prevW <= 0 || prevH <= 0) return starField;
    const sx = newW / prevW;
    const sy = newH / prevH;
    const sAvg = (sx + sy) / 2;
    if (Array.isArray(starField)) {
      return starField.map((s) => ({
        x: s.x * sx,
        y: s.y * sy,
        size: Math.max(1, s.size * sAvg),
        speed: s.speed * sAvg,
        brightness: s.brightness,
        twinkleOffset: s.x * sx * CONFIG.STARFIELD.TWINKLE_X_FACTOR,
      }));
    }
    if (starField && /** @type {any} */ (starField).layers) {
      return {
        layers: /** @type {any} */ (starField).layers.map(
          /** @param {{name:string,config:any,stars:any[]}} layer */ (layer) => ({
            name: layer.name,
            config: layer.config,
            stars: layer.stars.map(
              /** @param {{x:number,y:number,size:number,speed:number,brightness:number}} s */ (
                s
              ) => ({
                x: s.x * sx,
                y: s.y * sy,
                size: Math.max(1, s.size * sAvg),
                speed: s.speed * sAvg,
                brightness: s.brightness,
                twinkleOffset:
                  s.x *
                  sx *
                  ((layer.config && layer.config.twinkleXFactor) ||
                    CONFIG.STARFIELD.TWINKLE_X_FACTOR),
              })
            ),
          })
        ),
      };
    }
    return starField;
  }

  /**
   * Deterministic colour/shape variant for a star, hashed from its spawn position so no extra RNG
   * draws are needed (keeps the seeded init sequence unchanged). Rare, large, bright stars become
   * "hero" stars with a four-point sparkle.
   * @param {StarData} star
   * @returns {number} Index into VARIANTS.
   */
  static variantFor(star) {
    const h = Math.abs(Math.sin(star.x * 12.9898 + star.y * 78.233) * 43758.5453) % 1;
    if (star.size >= CONFIG.STARFIELD.SIZE_MIN + CONFIG.STARFIELD.SIZE_VAR * 0.9 && h > 0.6) {
      return StarField.HERO_VARIANT;
    }
    if (h < 0.55) return 0;
    if (h < 0.8) return 1;
    return 2;
  }

  /**
   * Retrieve or cache a pre-blurred star sprite for a given size bucket and variant.
   * The sprite embeds the glow (shadow blur) so per-frame drawing is a fast drawImage.
   * @param {number} size
   * @param {number} blurMult
   * @param {number} [variant=0] Index into VARIANTS.
   * @returns {{ canvas: OffscreenCanvas | HTMLCanvasElement, offset: number } | null}
   * @private
   */
  static _getSprite(size, blurMult, variant = 0) {
    if (!Number.isFinite(size) || size <= 0) return null;
    if (!StarField._spriteCache) StarField._spriteCache = new SpriteCache(96);
    const qSize = StarField._quantizeSize(size);
    const def = StarField.VARIANTS[variant] || StarField.VARIANTS[0];
    const key = `${qSize.toFixed(2)}|${variant}`;
    const cached = StarField._spriteCache.get(key);
    if (cached) return cached;

    const blur = qSize * blurMult;
    const sparkle = def.sparkle ? qSize * 2.2 : 0;
    const pad = Math.ceil(blur + sparkle + 2);
    const width = Math.ceil(qSize + pad * 2);
    const height = width;
    let canvas;
    if (typeof OffscreenCanvas === "function") canvas = new OffscreenCanvas(width, height);
    else {
      const elem = typeof document !== "undefined" ? document.createElement("canvas") : null;
      if (!elem) return null;
      elem.width = width;
      elem.height = height;
      canvas = elem;
    }
    const off = canvas.getContext("2d");
    if (!off) return null;
    const c = width / 2;
    const r = qSize / 2;
    off.clearRect(0, 0, width, height);
    off.save();
    off.fillStyle = def.color;
    off.shadowColor = def.color;
    off.shadowOffsetX = 0;
    off.shadowOffsetY = 0;
    off.shadowBlur = blur;
    off.beginPath();
    off.arc(c, c, r, 0, Math.PI * 2);
    off.fill();
    if (def.sparkle) {
      off.shadowBlur = blur * 0.5;
      off.strokeStyle = def.color;
      off.lineWidth = Math.max(0.6, r * 0.5);
      off.globalAlpha = 0.85;
      off.beginPath();
      off.moveTo(c - sparkle, c);
      off.lineTo(c + sparkle, c);
      off.moveTo(c, c - sparkle);
      off.lineTo(c, c + sparkle);
      off.stroke();
    }
    off.restore();
    const sprite = { canvas, offset: c };
    StarField._spriteCache.set(key, sprite);
    return sprite;
  }

  /**
   * Quantize star size to limit sprite variants.
   * @param {number} size
   * @returns {number}
   * @private
   */
  static _quantizeSize(size) {
    const step = StarField._SIZE_STEP;
    return Math.max(0.25, Math.round(size / step) * step);
  }
}

/** @type {SpriteCache<{ canvas: OffscreenCanvas | HTMLCanvasElement, offset: number }> | undefined} */
StarField._spriteCache = undefined;
StarField._SIZE_STEP = 0.25;
/** Star colour/shape variants; index 3 is the sparkling "hero" star. */
StarField.VARIANTS = [
  { color: CONFIG.COLORS.STARFIELD.WHITE, sparkle: false },
  { color: CONFIG.COLORS.STARFIELD.BLUE, sparkle: false },
  { color: CONFIG.COLORS.STARFIELD.WARM, sparkle: false },
  { color: CONFIG.COLORS.STARFIELD.HERO, sparkle: true },
];
StarField.HERO_VARIANT = 3;
