import { CONFIG } from "../constants.js";

/**
 * Provides static methods for initializing and rendering the animated star field background.
 */
export class StarField {
  /**
   * @typedef {Object} StarData
   * @property {number} x
   * @property {number} y
   * @property {number} size
   * @property {number} speed
   * @property {number} brightness
   */

  /**
   * Initializes the star field array.
   * @param {number} width - Canvas width in logical pixels.
   * @param {number} height - Canvas height in logical pixels.
   * @returns {StarData[]} Array of star objects.
   */
  /**
   * @param {number} width
   * @param {number} height
   * @param {import('../types.js').RNGLike} [rng]
   */
  static init(width, height, rng, isMobile = false) {
    const rand = rng || { nextFloat: Math.random.bind(Math) };
    const baseCount = isMobile
      ? CONFIG.GAME.STARFIELD_COUNT_MOBILE || CONFIG.GAME.STARFIELD_COUNT
      : CONFIG.GAME.STARFIELD_COUNT;

    /**
     * @typedef {{ name?:string, countFactor?:number, sizeMult?:number, speedMult?:number, brightnessMult?:number, twinkleRate?:number, twinkleXFactor?:number }} LayerDef
     */
    /** @type {LayerDef[] | null} */
    const layerDefs = Array.isArray(CONFIG.STARFIELD.LAYERS) ? CONFIG.STARFIELD.LAYERS : null;
    if (!layerDefs || layerDefs.length === 0) {
      // Legacy single-layer behavior: return flat array
      return Array.from({ length: baseCount }, () => ({
        x: rand.nextFloat() * width,
        y: rand.nextFloat() * height,
        size: rand.nextFloat() * CONFIG.STARFIELD.SIZE_VAR + CONFIG.STARFIELD.SIZE_MIN,
        speed: rand.nextFloat() * CONFIG.STARFIELD.SPEED_VAR + CONFIG.STARFIELD.SPEED_MIN,
        brightness:
          rand.nextFloat() * CONFIG.STARFIELD.BRIGHTNESS_VAR + CONFIG.STARFIELD.BRIGHTNESS_MIN,
      }));
    }

    // Layered behavior: return an object with ordered layers
    /** @typedef {{name:string, stars:StarData[], config:{twinkleRate:number, twinkleXFactor:number}}} LayerRuntime */
    /** @type {LayerRuntime[]} */
    const layers = layerDefs.map((ld /** @type {LayerDef} */) => {
      const layerCount = Math.max(1, Math.round(baseCount * (ld.countFactor || 1)));
      const stars = Array.from({ length: layerCount }, () => ({
        x: rand.nextFloat() * width,
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
      }));
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
   * Draws the star field on the canvas.
   * @param {CanvasRenderingContext2D} ctx - The canvas rendering context.
   * @param {number} width - Canvas width in logical pixels.
   * @param {number} height - Canvas height in logical pixels.
   * @param {StarData[]} starField - Array of star objects.
   * @param {number} timeSec - Elapsed time in seconds for twinkle.
   * @param {boolean} [paused=false] - If true, star positions won't advance.
   * @param {number} [dtSec=CONFIG.TIME.DEFAULT_DT] - Delta time in seconds for movement, ignored if paused.
   * @param {{ nextFloat:()=>number }=} rng - Optional RNG-like with nextFloat()
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
    ctx.fillStyle = CONFIG.COLORS.STAR.GRAD_IN;

    /**
     * @param {StarData[]} stars
     * @param {number} twinkleRate
     * @param {number} twinkleXFactor
     */
    const drawStars = (stars, twinkleRate, twinkleXFactor) => {
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        if (!paused) {
          star.y += star.speed * dtSec;
          if (star.y > height) {
            star.y = CONFIG.STARFIELD.RESET_Y;
            star.x = (rng ? rng.nextFloat() : Math.random()) * width;
          }
        }
        const twinkle = Math.sin(timeSec * twinkleRate + star.x * twinkleXFactor) * 0.3 + 0.7;
        ctx.save();
        ctx.globalAlpha = star.brightness * twinkle;
        ctx.shadowColor = CONFIG.COLORS.STAR.GRAD_IN;
        ctx.shadowBlur = star.size * CONFIG.STARFIELD.SHADOW_BLUR_MULT;
        ctx.fillRect(star.x, star.y, star.size, star.size);
        ctx.restore();
      }
    };

    if (Array.isArray(starField)) {
      // Legacy flat array
      drawStars(starField, CONFIG.STARFIELD.TWINKLE_RATE, CONFIG.STARFIELD.TWINKLE_X_FACTOR);
    } else if (starField && /** @type {any} */ (starField).layers) {
      // Draw in order: assume earlier layers are farther (already ordered in config)
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
   * Resize an existing starField array proportionally from previous dimensions to new ones.
   * Returns a new array reference with scaled x/y positions. Sizes and speeds are scaled by the
   * average scale factor to preserve appearance.
   * @param {StarData[]} starField
   * @param {number} prevW
   * @param {number} prevH
   * @param {number} newW
   * @param {number} newH
   */
  static resize(starField, prevW, prevH, newW, newH) {
    if (!starField || prevW <= 0 || prevH <= 0) return starField;
    const sx = newW / prevW;
    const sy = newH / prevH;
    const sAvg = (sx + sy) / 2;
    // Legacy flat array
    if (Array.isArray(starField)) {
      return starField.map((s) => ({
        x: s.x * sx,
        y: s.y * sy,
        size: Math.max(1, s.size * sAvg),
        speed: s.speed * sAvg,
        brightness: s.brightness,
      }));
    }
    if (starField && /** @type {any} */ (starField).layers) {
      return {
        layers: /** @type {any} */ (starField).layers.map((layer /** @type {any} */) => ({
          name: layer.name,
          config: layer.config,
          stars: layer.stars.map((s /** @type {any} */) => ({
            x: s.x * sx,
            y: s.y * sy,
            size: Math.max(1, s.size * sAvg),
            speed: s.speed * sAvg,
            brightness: s.brightness,
          })),
        })),
      };
    }
    return starField;
  }
}
