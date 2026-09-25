import { CONFIG, PI2 } from "../constants.js";

/** @typedef {{dx:number,dy:number,r:number,grow?:number,_puffed?:boolean}} Crater */
/** @typedef {{ canvas: OffscreenCanvas | HTMLCanvasElement, ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, padX: number, padY: number, width: number, height: number }} SurfaceSprite */

/** Transparent padding (px) around the baked body so outlines / cracks are not clipped. */
const SURFACE_PAD = 4;

/**
 * Asteroid / Planet entity.
 * Visual polish includes:
 *  - Embossed crater shading with highlight + inner shadow
 *  - Progressive crater activation & shading darkening as hits accumulate
 *  - Reveal animation (craters grow in with easing)
 *  - Dust puff particle burst on new crater activation (tuned for visibility)
 *    Puff parameters can be adjusted in CONFIG.ASTEROID.CRATER_EMBOSS (PUFF_*)
 *
 * Rendering / Performance:
 *  - The body, fully-grown craters and damage cracks are baked into a per-instance offscreen
 *    surface that is re-rendered only when `_surfaceDirty` is set (spawn/reset, bullet hit, crater
 *    finishing its reveal). The per-frame cost is a single `drawImage`.
 *  - Craters still revealing (grow < 1) are drawn live on top of the surface, so the animation is
 *    smooth without re-baking every frame.
 *  - The offscreen canvas is retained across object-pool cycles and only reallocated when a larger
 *    asteroid needs it (grow-only), eliminating canvas allocation on spawn after warm-up.
 *  - Drawing never consumes the RNG; render is side-effect free with respect to determinism.
 */
export class Asteroid {
  /**
   * Construct a new asteroid / planet entity (or reset template when pooled).
   *
   * Purpose:
   *  - Represent a falling obstacle with optional hardened (planet) styling.
   *  - Optionally generate textured crater emboss geometry (visual only) with reveal animation.
   *  - Parameterize color palette & speed via palette overrides or randomized planet palettes.
   *
   * Crater Generation:
   *  - Count = base + variable (see CONFIG.ASTEROID.CRATER_EMBOSS COUNT_* keys).
   *  - Reserve list preallocated when EXTRA_MAX > 0 to allow progressive damage reveal on planets.
   *  - Each crater stores relative offset (dx,dy), radius r, and transient grow factor for reveal.
   *
   * Hardened Asteroids:
   *  - Use alternate palette list (ASTEROID_HARDENED) or provided override for thematic variety.
   *  - Track hits to drive crack line rendering & crater activation.
   *
   * Performance Notes:
   *  - Heavy math only during construction/reset (random generation). Per-frame update is O(craters).
   *  - Drawing is a cached surface blit; see class header for the invalidation rules.
   *
   * @param {number} x World x (top-left)
   * @param {number} y World y (top-left)
   * @param {number} width Diameter proxy (used to derive radius)
   * @param {number} height Diameter proxy (kept for symmetry with other entities; should match width)
   * @param {number} speed Downward speed (pixels/sec before palette speed factor)
   * @param {import('../types.js').RNGLike} [rng] Optional deterministic RNG (nextFloat())
   * @param {boolean} [isHardened=false] If true behaves like a multi‑hit planet
   * @param {any} [paletteOverride] Optional palette object to force style (used for curated planets)
   */
  constructor(x, y, width, height, speed, rng, isHardened = false, paletteOverride = null) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.speed = speed;
    this.isHardened = !!isHardened;
    /** @type {boolean} */
    this.isBonus = false;
    this._shieldFlash = 0;
    const radius = this.width / 2;
    const rand =
      rng && typeof rng.nextFloat === "function" ? rng : { nextFloat: Math.random.bind(Math) };
    this._rng = rng && typeof rng.nextFloat === "function" ? rng : null;
    const craterCfg = CONFIG.ASTEROID.CRATER_EMBOSS;
    const baseCount = craterCfg.COUNT_BASE || 3;
    const varCount = craterCfg.COUNT_VAR || 0;
    const count = baseCount + (varCount > 0 ? Math.floor(rand.nextFloat() * (varCount + 1)) : 0);
    const sizeMin = craterCfg.SIZE_MIN || 2;
    const sizeFactor = craterCfg.SIZE_FACTOR || 0.3;
    const maxR = radius * sizeFactor;
    /** @type {Crater[]} */ this._craters = [];
    /** @type {Crater[]} */ this._reserveCraters = [];
    this._craters = Array.from({ length: count }, () => ({
      dx: (rand.nextFloat() - 0.5) * radius * 0.8,
      dy: (rand.nextFloat() - 0.5) * radius * 0.8,
      r: rand.nextFloat() * maxR + sizeMin,
      grow: 1,
    }));
    const extraMax = craterCfg.EXTRA_MAX || 0;
    this._reserveCraters = extraMax
      ? Array.from({ length: extraMax }, () => ({
          dx: (rand.nextFloat() - 0.5) * radius * 0.85,
          dy: (rand.nextFloat() - 0.5) * radius * 0.85,
          r: rand.nextFloat() * maxR + sizeMin,
          grow: 1,
        }))
      : [];
    this._initialCraterCount = this._craters.length;
    this._palette = CONFIG.COLORS.ASTEROID;
    if (this.isHardened) {
      if (paletteOverride && typeof paletteOverride === "object") this._palette = paletteOverride;
      else {
        const planets = CONFIG.COLORS.ASTEROID_HARDENED;
        if (Array.isArray(planets) && planets.length > 0) {
          const idx = this._rng
            ? Math.floor(this._rng.nextFloat() * planets.length)
            : Math.floor(Math.random() * planets.length);
          this._palette = planets[idx];
        } else this._palette = CONFIG.COLORS.ASTEROID;
      }
    }
    const speedFactor =
      this._palette && typeof this._palette.SPEED_FACTOR === "number"
        ? this._palette.SPEED_FACTOR
        : null;
    this.speed = speedFactor ? speed * speedFactor : speed;
    this._hits = 0;
    this._effectiveMaxHits = CONFIG.ASTEROID.HARDENED_HITS || 10;
    /** @private */ this._damageLineAngles = new Float32Array(8);
    /** @private */ this._damageLineLens = new Float32Array(8);
    /** @private */ this._damageLineCount = 0;
    /** @private Number of craters currently animating their reveal (grow < 1). */
    this._growing = 0;
    /** @private @type {SurfaceSprite | null} Baked body surface; retained across pool resets. */
    this._surfaceSprite = null;
    /** @private True when the baked surface no longer matches entity state. */
    this._surfaceDirty = true;
  }

  /**
   * Advance vertical position and animate crater reveal grows.
   *
   * Side Effects:
   *  - Mutates y, crater grow factors; marks the baked surface dirty once a crater finishes growing.
   *
   * Complexity: O(C) where C = current crater count (crater loop skipped when nothing is revealing).
   * @param {number} [dtSec=CONFIG.TIME.DEFAULT_DT] Delta time seconds.
   */
  update(dtSec = CONFIG.TIME.DEFAULT_DT) {
    this.y += this.speed * dtSec;
    if (this._growing <= 0) return;
    const cfg = CONFIG.ASTEROID.CRATER_EMBOSS;
    const rt = cfg && cfg.REVEAL_TIME > 0 ? cfg.REVEAL_TIME : 0;
    let growing = 0;
    for (let i = 0; i < this._craters.length; i++) {
      const cr = this._craters[i];
      if (cr.grow === undefined || cr.grow >= 1) continue;
      cr.grow = rt > 0 ? Math.min(1, cr.grow + dtSec / rt) : 1;
      if (cr.grow < 1) growing++;
      else this._surfaceDirty = true;
    }
    this._growing = growing;
  }

  /**
   * Render asteroid / planet: blit the baked surface (body, settled craters, damage cracks), then
   * draw any craters still revealing on top. Falls back to direct drawing when no offscreen canvas
   * can be created (non-browser environments).
   *
   * @param {CanvasRenderingContext2D} ctx Target 2D context (state restored before return).
   * @param {number} [extrapolateSec=0] Seconds past the last simulated state; vertical motion is
   *  projected forward by `speed * extrapolateSec` for smooth output between fixed steps.
   */
  draw(ctx, extrapolateSec = 0) {
    const y = extrapolateSec > 0 ? this.y + this.speed * extrapolateSec : this.y;
    const centerX = this.x + this.width / 2;
    const centerY = y + this.height / 2;
    const radius = this.width / 2;
    const palette = this._palette || CONFIG.COLORS.ASTEROID;
    const sprite = this._getSurfaceSprite(palette);
    if (sprite) {
      ctx.drawImage(
        sprite.canvas,
        0,
        0,
        sprite.width,
        sprite.height,
        this.x - sprite.padX,
        y - sprite.padY,
        sprite.width,
        sprite.height
      );
      if (this._growing > 0) {
        ctx.save();
        this._drawCraters(ctx, centerX, centerY, palette, true);
        ctx.restore();
      }
      return;
    }
    ctx.save();
    this._drawBody(ctx, centerX, centerY, radius, palette);
    this._drawCraters(ctx, centerX, centerY, palette, false);
    this._drawOutline(ctx, palette);
    if (this.isHardened && this._hits > 0) this._drawDamage(ctx, centerX, centerY, radius, palette);
    ctx.restore();
  }

  /**
   * Fill the body radial gradient.
   * @param {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} ctx
   * @param {number} centerX
   * @param {number} centerY
   * @param {number} radius
   * @param {any} palette
   * @private
   */
  _drawBody(ctx, centerX, centerY, radius, palette) {
    const asteroidGradient = ctx.createRadialGradient(
      centerX - radius * 0.3,
      centerY - radius * 0.3,
      0,
      centerX,
      centerY,
      radius
    );
    asteroidGradient.addColorStop(0, palette.GRAD_IN);
    asteroidGradient.addColorStop(0.6, palette.GRAD_MID);
    asteroidGradient.addColorStop(1, palette.GRAD_OUT);
    ctx.fillStyle = asteroidGradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, PI2);
    ctx.fill();
  }

  /**
   * Stroke the current path with the palette outline (thicker for hardened planets).
   * @param {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} ctx
   * @param {any} palette
   * @private
   */
  _drawOutline(ctx, palette) {
    ctx.strokeStyle = palette.OUTLINE;
    ctx.lineWidth = this.isHardened ? 3 : 2;
    ctx.stroke();
  }

  /**
   * Draw embossed craters. `onlyGrowing` selects the live reveal overlay (craters with grow < 1);
   * otherwise only settled craters are drawn (baked surface / fallback path).
   * @param {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} ctx
   * @param {number} centerX
   * @param {number} centerY
   * @param {any} palette
   * @param {boolean} onlyGrowing
   * @private
   */
  _drawCraters(ctx, centerX, centerY, palette, onlyGrowing) {
    if (!this._craters.length) return;
    const cfg = CONFIG.ASTEROID.CRATER_EMBOSS;
    const light = cfg.LIGHT_DIR || { x: -0.7, y: -0.7 };
    const lightAngle = Math.atan2(light.y, light.x);
    const arcSpan = Math.PI * 0.55;
    const hlStart = lightAngle - arcSpan / 2;
    const hlEnd = lightAngle + arcSpan / 2;
    const shStart = lightAngle + Math.PI - arcSpan / 2;
    const shEnd = lightAngle + Math.PI + arcSpan / 2;
    const severity = this._severity();
    const darkenScale = cfg.SHADOW_DARKEN_SCALE || 0;
    const fadeScale = cfg.HIGHLIGHT_FADE_SCALE || 0;
    const midAlpha = (cfg.SHADOW_ALPHA_MID || 0.25) * (1 + darkenScale * severity);
    const innerAlpha = (cfg.SHADOW_ALPHA_INNER || 0.45) * (1 + darkenScale * severity);
    const hlAlpha = (cfg.HIGHLIGHT_ALPHA || 0.35) * (1 - fadeScale * severity);
    for (let i = 0; i < this._craters.length; i++) {
      const c = this._craters[i];
      let grow = c.grow === undefined ? 1 : c.grow;
      if (grow < 1 !== onlyGrowing) continue;
      if (grow < 1 && cfg.REVEAL_EASE === "outQuad") grow = 1 - (1 - grow) * (1 - grow);
      const cx = centerX + c.dx;
      const cy = centerY + c.dy;
      const r = c.r * grow;
      ctx.fillStyle = palette.CRATER;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, PI2);
      ctx.fill();
      try {
        const grad = ctx.createRadialGradient(
          cx + light.x * -r * 0.35,
          cy + light.y * -r * 0.35,
          r * 0.15,
          cx,
          cy,
          r
        );
        grad.addColorStop(0, "rgba(0,0,0,0.0)");
        grad.addColorStop(0.55, `rgba(0,0,0,${midAlpha})`);
        grad.addColorStop(1, `rgba(0,0,0,${innerAlpha})`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, PI2);
        ctx.fill();
      } catch {
        /* ignore */
      }
      ctx.beginPath();
      ctx.strokeStyle = `rgba(255,255,255,${hlAlpha})`;
      ctx.lineWidth = Math.max(0.75, r * 0.25);
      ctx.arc(cx, cy, r, hlStart, hlEnd);
      ctx.stroke();
      ctx.beginPath();
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = Math.max(0.6, r * 0.22);
      ctx.arc(cx, cy, r, shStart, shEnd);
      ctx.stroke();
    }
  }

  /**
   * Draw damage cracks for hardened planets (count / width / alpha scale with hit severity).
   * Uses only geometry captured in `onBulletHit`; never consumes the RNG.
   * @param {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} ctx
   * @param {number} centerX
   * @param {number} centerY
   * @param {number} radius
   * @param {any} palette
   * @private
   */
  _drawDamage(ctx, centerX, centerY, radius, palette) {
    const severity = this._severity();
    const lines = 1 + Math.floor(severity * 4);
    let damageColor;
    if (palette && palette.NAME === "ICE") damageColor = "rgba(255,255,255,0.85)";
    else if (palette && palette.SHIELD) damageColor = palette.SHIELD;
    else if (palette && palette.RING) damageColor = palette.RING;
    else if (palette && palette.OUTLINE) damageColor = palette.OUTLINE;
    else damageColor = "rgba(255,255,255,0.6)";
    ctx.save();
    ctx.strokeStyle = damageColor;
    if (palette && palette.NAME === "ICE") {
      ctx.lineWidth = 0.8 + severity * 1.2;
      ctx.globalAlpha = 0.25 + 0.5 * severity;
    } else {
      ctx.lineWidth = 1 + severity * 2;
      ctx.globalAlpha = 0.4 + 0.6 * severity;
    }
    for (let i = 0; i < lines; i++) {
      const angle =
        i < this._damageLineCount ? this._damageLineAngles[i] : (i / lines) * Math.PI * 2;
      const lenFactor = i < this._damageLineCount ? this._damageLineLens[i] : 0.85;
      const endFactor = Math.min(lenFactor + severity * 0.3, 0.95);
      const sx = centerX + Math.cos(angle) * radius * 0.3;
      const sy = centerY + Math.sin(angle) * radius * 0.3;
      const ex = centerX + Math.cos(angle + 0.6) * radius * endFactor;
      const ey = centerY + Math.sin(angle + 0.6) * radius * endFactor;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(centerX, centerY, ex, ey);
      ctx.stroke();
    }
    if (severity > 0.7) {
      ctx.lineWidth = 2 + severity * 3;
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = damageColor;
      ctx.beginPath();
      ctx.moveTo(centerX - radius * 0.4, centerY - radius * 0.2);
      ctx.lineTo(centerX + radius * 0.1, centerY + radius * 0.5);
      ctx.lineTo(centerX + radius * 0.4, centerY - radius * 0.1);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Damage severity in [0,1] (hardened planets only; 0 for regular asteroids).
   * @returns {number}
   * @private
   */
  _severity() {
    if (!this.isHardened || this._hits <= 0) return 0;
    const maxHits = Math.max(1, this._effectiveMaxHits || CONFIG.ASTEROID.HARDENED_HITS || 10);
    return Math.min(1, this._hits / maxHits);
  }

  /**
   * Return the baked surface, re-rendering it into the retained offscreen canvas when dirty.
   * @param {any} palette
   * @returns {SurfaceSprite | null} null when no offscreen canvas can be created.
   * @private
   */
  _getSurfaceSprite(palette) {
    if (!this._surfaceDirty && this._surfaceSprite) return this._surfaceSprite;
    const width = Math.ceil(this.width + SURFACE_PAD * 2);
    const height = Math.ceil(this.height + SURFACE_PAD * 2);
    const sprite = this._ensureSurface(width, height);
    if (!sprite) return null;
    const off = sprite.ctx;
    const centerX = SURFACE_PAD + this.width / 2;
    const centerY = SURFACE_PAD + this.height / 2;
    const radius = this.width / 2;
    off.clearRect(0, 0, width, height);
    off.save();
    this._drawBody(off, centerX, centerY, radius, palette);
    this._drawCraters(off, centerX, centerY, palette, false);
    this._drawOutline(off, palette);
    if (this.isHardened && this._hits > 0) this._drawDamage(off, centerX, centerY, radius, palette);
    off.restore();
    sprite.width = width;
    sprite.height = height;
    this._surfaceDirty = false;
    return sprite;
  }

  /**
   * Ensure the retained offscreen canvas is at least width x height, reallocating (grow-only) when
   * needed. Returns null when the environment cannot create a 2D canvas.
   * @param {number} width
   * @param {number} height
   * @returns {SurfaceSprite | null}
   * @private
   */
  _ensureSurface(width, height) {
    const current = this._surfaceSprite;
    if (current && current.canvas.width >= width && current.canvas.height >= height) return current;
    const canvasWidth = Math.max(width, current ? current.canvas.width : 0);
    const canvasHeight = Math.max(height, current ? current.canvas.height : 0);
    /** @type {OffscreenCanvas | HTMLCanvasElement} */
    let canvas;
    if (typeof OffscreenCanvas === "function") {
      canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
    } else {
      const elem = typeof document !== "undefined" ? document.createElement("canvas") : null;
      if (!elem) return null;
      elem.width = canvasWidth;
      elem.height = canvasHeight;
      canvas = elem;
    }
    const ctx = /** @type {OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null} */ (
      canvas.getContext("2d")
    );
    if (!ctx) return null;
    this._surfaceSprite = { canvas, ctx, padX: SURFACE_PAD, padY: SURFACE_PAD, width, height };
    return this._surfaceSprite;
  }

  /**
   * Get current axis-aligned bounding box for collision grid.
   * @returns {{x:number,y:number,width:number,height:number}}
   */
  getBounds() {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }

  /**
   * Reinitialize instance for reuse from object pool.
   * Mirrors constructor logic (must stay in sync with crater generation & palette selection).
   *
   * Differences vs constructor:
   *  - Does not clear properties already re-assigned (simply overwrites all entity state).
   *  - Sets _initialCraterCount to undefined when emboss disabled to allow later enable logic.
   *
   * @param {number} x New x
   * @param {number} y New y
   * @param {number} width Diameter proxy
   * @param {number} height Diameter proxy
   * @param {number} speed Base downward speed
   * @param {import('../types.js').RNGLike} [rng] Optional deterministic RNG
   * @param {boolean} [isHardened=false] Planet mode flag
   * @param {any} [paletteOverride] Optional palette override
   */
  reset(x, y, width, height, speed, rng, isHardened = false, paletteOverride = null) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.speed = speed;
    this.isHardened = !!isHardened;
    this.isBonus = false;
    this._shieldFlash = 0;
    this._hits = 0;
    this._effectiveMaxHits = CONFIG.ASTEROID.HARDENED_HITS || 10;
    this._damageLineCount = 0;
    this._growing = 0;
    this._surfaceDirty = true;
    const radius = this.width / 2;
    const rand =
      rng && typeof rng.nextFloat === "function" ? rng : { nextFloat: Math.random.bind(Math) };
    this._rng = rng && typeof rng.nextFloat === "function" ? rng : null;
    const cfg = CONFIG.ASTEROID.CRATER_EMBOSS;
    const baseCount = cfg.COUNT_BASE || 3;
    const varCount = cfg.COUNT_VAR || 0;
    const count = baseCount + (varCount > 0 ? Math.floor(rand.nextFloat() * (varCount + 1)) : 0);
    const sizeMin = cfg.SIZE_MIN || 2;
    const sizeFactor = cfg.SIZE_FACTOR || 0.3;
    const maxR = radius * sizeFactor;
    // Reuse crater arrays to avoid alloc churn: truncate then repopulate up to required counts.
    if (!this._craters) this._craters = [];
    else this._craters.length = 0;
    for (let i = 0; i < count; i++) {
      this._craters.push({
        dx: (rand.nextFloat() - 0.5) * radius * 0.8,
        dy: (rand.nextFloat() - 0.5) * radius * 0.8,
        r: rand.nextFloat() * maxR + sizeMin,
        grow: 1,
      });
    }
    const extraMax = cfg.EXTRA_MAX || 0;
    if (!this._reserveCraters) this._reserveCraters = [];
    else this._reserveCraters.length = 0;
    if (extraMax > 0) {
      for (let i = 0; i < extraMax; i++) {
        this._reserveCraters.push({
          dx: (rand.nextFloat() - 0.5) * radius * 0.85,
          dy: (rand.nextFloat() - 0.5) * radius * 0.85,
          r: rand.nextFloat() * maxR + sizeMin,
          grow: 1,
        });
      }
    }
    this._initialCraterCount = this._craters.length;
    this._palette = CONFIG.COLORS.ASTEROID;
    if (this.isHardened) {
      if (paletteOverride && typeof paletteOverride === "object") this._palette = paletteOverride;
      else {
        const planets = CONFIG.COLORS.ASTEROID_HARDENED;
        if (Array.isArray(planets) && planets.length) {
          const idx = this._rng
            ? Math.floor(this._rng.nextFloat() * planets.length)
            : Math.floor(Math.random() * planets.length);
          this._palette = planets[idx];
        } else this._palette = CONFIG.COLORS.ASTEROID;
      }
    }
    const speedFactor =
      this._palette && typeof this._palette.SPEED_FACTOR === "number"
        ? this._palette.SPEED_FACTOR
        : null;
    this.speed = speedFactor ? speed * speedFactor : speed;
  }

  /**
   * Register a bullet impact.
   *
   * Behavior:
   *  - Destructible asteroid: returns true immediately (caller should remove it) and no visual cracks.
   *  - Hardened planet: increments hit counter, adds damage line (capped), may activate extra craters.
   *  - Spawns crater dust particles for newly activated craters if puff feature enabled.
   *
   * @param {any} [game] Minimal game facade providing particlePool / particles array (optional). If absent, dust ignored.
   * @returns {boolean} true when entity should be destroyed (regular) or when planet reached max hits.
   */
  onBulletHit(game) {
    if (!this.isHardened) return true;
    this._hits = (this._hits || 0) + 1;
    this._surfaceDirty = true;
    try {
      const baseMax = CONFIG.ASTEROID.HARDENED_HITS || 10;
      let eff = baseMax;
      const threshold = (CONFIG.GAME && CONFIG.GAME.BULLET_UPGRADE_SCORE | 0) || 0;
      const factor =
        CONFIG.GAME && typeof CONFIG.GAME.BULLET_UPGRADE_HARDENED_HITS_FACTOR === "number"
          ? CONFIG.GAME.BULLET_UPGRADE_HARDENED_HITS_FACTOR
          : 0.5;
      const score = game && typeof game.score === "number" ? game.score : 0;
      if (threshold > 0 && score >= threshold) {
        const reduced = Math.ceil(baseMax * Math.max(0.05, Math.min(1, factor)));
        eff = Math.max(1, reduced);
      }
      this._effectiveMaxHits = eff;
    } catch {
      /* ignore upgrade calc errors */
    }
    try {
      if (this._damageLineCount < this._damageLineAngles.length) {
        const rand =
          this._rng && typeof this._rng.nextFloat === "function"
            ? this._rng
            : { nextFloat: Math.random.bind(Math) };
        const rawLen = 0.6 + rand.nextFloat() * 0.5;
        const clampedLen = Math.min(rawLen, 0.9);
        const idx = this._damageLineCount++;
        this._damageLineAngles[idx] = rand.nextFloat() * Math.PI * 2;
        this._damageLineLens[idx] = clampedLen;
      }
    } catch {
      /* noop */
    }
    const newCraters = [];
    try {
      const cfg = CONFIG.ASTEROID.CRATER_EMBOSS;
      if (cfg && this._reserveCraters && this._reserveCraters.length) {
        const maxHits = CONFIG.ASTEROID.HARDENED_HITS || 10;
        const severity = Math.min(1, this._hits / maxHits);
        const extraMax = cfg.EXTRA_MAX || 0;
        const desiredExtra = Math.min(extraMax, Math.floor(severity * extraMax + 0.00001));
        if (this._initialCraterCount === undefined) this._initialCraterCount = this._craters.length;
        const currentExtra = this._craters.length - this._initialCraterCount;
        if (currentExtra < desiredExtra) {
          const toAdd = desiredExtra - currentExtra;
          for (let i = 0; i < toAdd && this._reserveCraters.length; i++) {
            // Use pop() (LIFO) to avoid O(n) cost of shift(); crater ordering visual impact is negligible.
            const next = this._reserveCraters.pop();
            if (next) {
              if (CONFIG.ASTEROID.CRATER_EMBOSS.REVEAL_TIME > 0) {
                next.grow = 0;
                this._growing++;
              }
              this._craters.push(next);
              newCraters.push(next);
              this._surfaceDirty = true;
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
    if (newCraters.length && game) {
      for (const c of newCraters) this._spawnCraterDust(c, game);
    }
    return this._hits >= (this._effectiveMaxHits || CONFIG.ASTEROID.HARDENED_HITS || 10);
  }

  /**
   * Spawn crater dust particle fan once per crater.
   *
   * Side Effects: pushes new particles (if pool acquire succeeds) into game.particles.
   * @param {Crater} crater Activated crater descriptor.
   * @param {{particlePool:any,particles:any[],rng?:any,_particleBudget?:number,_performanceParticleMultiplier?:number}} game Game particle context.
   */
  _spawnCraterDust(crater, game) {
    if (!game || !game.particlePool || !game.particles) return;
    if (crater._puffed) return;
    crater._puffed = true;
    const cfg = CONFIG.ASTEROID.CRATER_EMBOSS;
    const baseCount = cfg.PUFF_COUNT || 4;
    const particleMult =
      typeof game._performanceParticleMultiplier === "number"
        ? Math.max(0.1, Math.min(1, game._performanceParticleMultiplier))
        : 1;
    const total = Math.max(1, Math.round(baseCount * particleMult));
    const rng =
      game.rng && typeof game.rng.nextFloat === "function"
        ? game.rng
        : { nextFloat: Math.random.bind(Math) };
    const cx = this.x + this.width / 2 + crater.dx;
    const cy = this.y + this.height / 2 + crater.dy;
    const budget = Number.isFinite(game._particleBudget)
      ? Number(game._particleBudget)
      : Number.POSITIVE_INFINITY;
    for (let i = 0; i < total; i++) {
      if (game.particles.length >= budget) break;
      const ang = rng.nextFloat() * Math.PI * 2;
      const baseSp = cfg.PUFF_SPEED || 120;
      const sp = baseSp + (rng.nextFloat() - 0.5) * (cfg.PUFF_SPEED_VAR || 0);
      let vx = Math.cos(ang) * sp;
      let vy = Math.sin(ang) * sp;
      vy *= 0.8;
      if (vy > 0) vy *= 0.6;
      else vy *= 1.2;
      vx *= 1.05;
      vy *= 1.05;
      const life = (cfg.PUFF_LIFE || 0.4) + (rng.nextFloat() - 0.5) * (cfg.PUFF_LIFE_VAR || 0);
      const size = (cfg.PUFF_SIZE_MIN || 1) + rng.nextFloat() * (cfg.PUFF_SIZE_VAR || 1);
      const color = cfg.PUFF_COLOR || "rgba(200,200,200,0.8)";
      const p = game.particlePool.acquire(cx, cy, vx, vy, life, life, size, color);
      if (p) game.particles.push(p);
    }
  }
}
