import { CONFIG } from "../constants.js";

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
    const perf = CONFIG.PERFORMANCE || {};
    const minScale = typeof perf.MIN_STARFIELD_SCALE === "number" ? perf.MIN_STARFIELD_SCALE : 0.35;
    const clampScale = Math.max(
      minScale,
      Math.min(1, typeof qualityScale === "number" ? qualityScale : 1)
    );
    const baseTarget = isMobile
      ? CONFIG.GAME.STARFIELD_COUNT_MOBILE || CONFIG.GAME.STARFIELD_COUNT
      : CONFIG.GAME.STARFIELD_COUNT;
    const baseCount = Math.max(1, Math.round(baseTarget * clampScale));

    /**
     * @typedef {{ name?:string, countFactor?:number, sizeMult?:number, speedMult?:number, brightnessMult?:number, twinkleRate?:number, twinkleXFactor?:number }} LayerDef
     */
    /** @type {LayerDef[] | null} */
    const layerDefs = Array.isArray(CONFIG.STARFIELD.LAYERS) ? CONFIG.STARFIELD.LAYERS : null;
    const defaultTwinkleFactor = CONFIG.STARFIELD.TWINKLE_X_FACTOR;
    if (!layerDefs || layerDefs.length === 0) {
      return Array.from({ length: baseCount }, () => {
        const x = rand.nextFloat() * width;
        return {
          x,
          y: rand.nextFloat() * height,
          size: rand.nextFloat() * CONFIG.STARFIELD.SIZE_VAR + CONFIG.STARFIELD.SIZE_MIN,
          speed: rand.nextFloat() * CONFIG.STARFIELD.SPEED_VAR + CONFIG.STARFIELD.SPEED_MIN,
          brightness:
            rand.nextFloat() * CONFIG.STARFIELD.BRIGHTNESS_VAR + CONFIG.STARFIELD.BRIGHTNESS_MIN,
          twinkleOffset: x * defaultTwinkleFactor,
        };
      });
    }

    /** @typedef {{name:string, stars:StarData[], config:{twinkleRate:number, twinkleXFactor:number}}} LayerRuntime */
    /** @type {LayerRuntime[]} */
    const layers = layerDefs.map((ld /** @type {LayerDef} */) => {
      const layerCount = Math.max(1, Math.round(baseCount * (ld.countFactor || 1)));
      const twinkleFactor = ld.twinkleXFactor || CONFIG.STARFIELD.TWINKLE_X_FACTOR;
      const stars = Array.from({ length: layerCount }, () => {
        const x = rand.nextFloat() * width;
        return {
          x,
          y: rand.nextFloat() * height,
          size:
            (rand.nextFloat() * CONFIG.STARFIELD.SIZE_VAR + CONFIG.STARFIELD.SIZE_MIN) *
            (ld.sizeMult || 1),
          speed:
            (rand.nextFloat() * CONFIG.STARFIELD.SPEED_VAR + CONFIG.STARFIELD.SPEED_MIN) *
            (ld.speedMult || 1),
          brightness:
            (rand.nextFloat() * CONFIG.STARFIELD.BRIGHTNESS_VAR + CONFIG.STARFIELD.BRIGHTNESS_MIN) *
            (ld.brightnessMult || 1),
          twinkleOffset: x * twinkleFactor,
        };
      });
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
        const sprite = StarField._getSprite(star.size, blurMult);
        if (sprite) {
          ctx.drawImage(sprite.canvas, star.x - sprite.offset, star.y - sprite.offset);
        } else {
          ctx.save();
          ctx.fillStyle = CONFIG.COLORS.STAR.GRAD_IN;
          ctx.shadowColor = CONFIG.COLORS.STAR.GRAD_IN;
          ctx.shadowBlur = star.size * blurMult;
          ctx.fillRect(star.x, star.y, star.size, star.size);
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
   * Retrieve or cache a pre-blurred star sprite for a given size bucket.
   * The sprite embeds the glow (shadow blur) so per-frame drawing is a fast drawImage.
   * @param {number} size
   * @param {number} blurMult
   * @returns {{ canvas: OffscreenCanvas | HTMLCanvasElement, offset: number } | null}
   * @private
   */
  static _getSprite(size, blurMult) {
    if (!Number.isFinite(size) || size <= 0) return null;
    if (!StarField._spriteCache) StarField._spriteCache = new Map();
    const qSize = StarField._quantizeSize(size);
    const key = qSize.toFixed(2);
    const cached = StarField._spriteCache.get(key);
    if (cached) return cached;

    const blur = qSize * blurMult;
    const pad = Math.ceil(blur + 2);
    const width = Math.ceil(qSize + pad * 2);
    const height = Math.ceil(qSize + pad * 2);
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
    off.clearRect(0, 0, width, height);
    off.save();
    off.fillStyle = CONFIG.COLORS.STAR.GRAD_IN;
    off.shadowColor = CONFIG.COLORS.STAR.GRAD_IN;
    off.shadowOffsetX = 0;
    off.shadowOffsetY = 0;
    off.shadowBlur = blur;
    off.fillRect(pad, pad, qSize, qSize);
    off.restore();
    const sprite = { canvas, offset: pad };
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

/** @type {Map<string, { canvas: OffscreenCanvas | HTMLCanvasElement, offset: number }> | undefined} */
StarField._spriteCache = undefined;
StarField._SIZE_STEP = 0.25;
