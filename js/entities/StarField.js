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
   * @returns {StarData[] | {layers:Array<{name:string,stars:StarData[],config:{twinkleRate:number,twinkleXFactor:number}}>} }
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
      return Array.from({ length: baseCount }, () => ({
        x: rand.nextFloat() * width,
        y: rand.nextFloat() * height,
        size: rand.nextFloat() * CONFIG.STARFIELD.SIZE_VAR + CONFIG.STARFIELD.SIZE_MIN,
        speed: rand.nextFloat() * CONFIG.STARFIELD.SPEED_VAR + CONFIG.STARFIELD.SPEED_MIN,
        brightness:
          rand.nextFloat() * CONFIG.STARFIELD.BRIGHTNESS_VAR + CONFIG.STARFIELD.BRIGHTNESS_MIN,
      }));
    }

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
              })
            ),
          })
        ),
      };
    }
    return starField;
  }
}
