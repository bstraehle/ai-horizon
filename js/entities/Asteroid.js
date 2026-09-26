import { CONFIG, PI2 } from "../constants.js";

/** @typedef {{dx:number,dy:number,r:number,grow?:number,_puffed?:boolean}} Crater */
/** @typedef {{ canvas: OffscreenCanvas | HTMLCanvasElement, ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, padX: number, padY: number, width: number, height: number }} SurfaceSprite */

/** Transparent padding (px) around the baked body so outlines and cracks are not clipped. */
const SURFACE_PAD = 8;
/** Vertex count of the irregular rock silhouette. */
const SHAPE_VERTS = 12;
/** Key light direction (unit vector, from the upper-left). */
const LIGHT_X = -0.62;
const LIGHT_Y = -0.78;
/** Spin rates (rad/s, magnitude) for rocks and planets. */
const ROCK_SPIN = 0.9;
const PLANET_SPIN = 0.22;
/** Hit flash decay (units/s). */
const HIT_FLASH_DECAY = 6;

/**
 * Asteroid / Planet entity ("flat geometric" renderer).
 *
 * Regular asteroids are low-poly rocks: a per-instance straight-edged silhouette (SHAPE_VERTS
 * radius factors), a flat lit face with one hard shadow facet on the side away from the key light,
 * a thin dark outline and a slow spin. Hardened planets are flat discs with a crescent shadow,
 * flat craters and thin cracks that multiply with damage. Bonus planets carry a thin pulsing halo
 * ring. Bullet hits flash the body briefly. No gradients or blurs are used.
 *
 * Visual polish carried over:
 *  - Progressive crater activation & shading darkening as hits accumulate
 *  - Reveal animation (craters grow in with easing)
 *  - Dust puff particle burst on new crater activation (CONFIG.ASTEROID.CRATER_EMBOSS PUFF_*)
 *
 * Rendering / Performance:
 *  - The body, fully-grown craters and damage cracks are baked into a per-instance offscreen
 *    surface that is re-rendered only when `_surfaceDirty` is set (spawn/reset, bullet hit, crater
 *    finishing its reveal). The per-frame cost is one rotated `drawImage` (plus one additive
 *    blit while a hit flash is active, and one shared glow blit for bonus planets).
 *  - Craters still revealing (grow < 1) are drawn live on top of the surface, so the animation is
 *    smooth without re-baking every frame.
 *  - The offscreen canvas is retained across object-pool cycles and only reallocated when a larger
 *    asteroid needs it (grow-only), eliminating canvas allocation on spawn after warm-up.
 *  - Spin, flash and pulse are advanced in `update` (deterministic); drawing never consumes the
 *    RNG and never mutates simulation state.
 */
export class Asteroid {
  /** Transparent padding (px) around the baked body. */
  static SURFACE_PAD = SURFACE_PAD;

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
    /** @private Silhouette radius factors (rocks only). */
    this._shape = new Float32Array(SHAPE_VERTS);
    /** @private Render rotation (rad) and spin rate (rad/s). */
    this._angle = 0;
    this._spin = 0;
    /** @private Hit flash intensity [0,1] and bonus glow pulse phase / clock. */
    this._hitFlash = 0;
    this._pulse = 0;
    this._pulseT = 0;
    this._initVisualState(rand);
  }

  /**
   * Roll the visual-only randomness (silhouette, initial rotation, spin, pulse phase). Called last
   * in constructor/reset so the gameplay-relevant RNG draws keep their order.
   * @param {{ nextFloat:()=>number }} rand
   * @private
   */
  _initVisualState(rand) {
    if (!this.isHardened) {
      const s = this._shape;
      // Straight-edged low-poly silhouette: per-vertex radius in [0.74, 1] (no smoothing).
      for (let i = 0; i < SHAPE_VERTS; i++) s[i] = 0.74 + rand.nextFloat() * 0.26;
    }
    this._angle = rand.nextFloat() * PI2;
    this._spin = (rand.nextFloat() - 0.5) * 2 * (this.isHardened ? PLANET_SPIN : ROCK_SPIN);
    this._pulse = rand.nextFloat() * PI2;
    this._pulseT = 0;
    this._hitFlash = 0;
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
    let angle = this._angle + this._spin * dtSec;
    if (angle > PI2) angle -= PI2;
    else if (angle < 0) angle += PI2;
    this._angle = angle;
    if (this._hitFlash > 0) this._hitFlash = Math.max(0, this._hitFlash - dtSec * HIT_FLASH_DECAY);
    if (this.isBonus) this._pulseT += dtSec;
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
   * Render asteroid / planet: blit the baked surface (body, settled craters, damage cracks) rotated
   * by the current spin, add the hit flash and any craters still revealing, then the bonus pulse.
   * Falls back to direct drawing when no offscreen canvas can be created (non-browser environments).
   *
   * @param {CanvasRenderingContext2D} ctx Target 2D context (state restored before return).
   * @param {number} [extrapolateSec=0] Seconds past the last simulated state; vertical motion and
   *  spin are projected forward for smooth output between fixed steps.
   */
  draw(ctx, extrapolateSec = 0) {
    const t = extrapolateSec > 0 ? extrapolateSec : 0;
    const y = this.y + this.speed * t;
    const centerX = this.x + this.width / 2;
    const centerY = y + this.height / 2;
    const radius = this.width / 2;
    const palette = this._palette || CONFIG.COLORS.ASTEROID;
    const angle = this._angle + this._spin * t;
    const sprite = this._getSurfaceSprite(palette);
    ctx.save();
    ctx.translate(centerX, centerY);
    if (angle !== 0) ctx.rotate(angle);
    if (sprite) {
      const hw = sprite.width / 2;
      const hh = sprite.height / 2;
      ctx.drawImage(
        sprite.canvas,
        0,
        0,
        sprite.width,
        sprite.height,
        -hw,
        -hh,
        sprite.width,
        sprite.height
      );
      if (this._hitFlash > 0) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = this._hitFlash * 0.75;
        ctx.drawImage(
          sprite.canvas,
          0,
          0,
          sprite.width,
          sprite.height,
          -hw,
          -hh,
          sprite.width,
          sprite.height
        );
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
      if (this._growing > 0) this._drawCraters(ctx, 0, 0, palette, true);
    } else {
      this._paintSurface(ctx, 0, 0, radius, palette);
    }
    ctx.restore();
    if (this.isBonus) this._drawPulse(ctx, centerX, centerY, radius, palette);
  }

  /**
   * Paint the complete body (rock or planet, settled craters, damage) centred on (cx, cy).
   * Shared by the bake and the no-canvas fallback.
   * @param {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} ctx
   * @param {number} cx
   * @param {number} cy
   * @param {number} radius
   * @param {any} palette
   * @private
   */
  _paintSurface(ctx, cx, cy, radius, palette) {
    if (this.isHardened) this._paintPlanet(ctx, cx, cy, radius, palette);
    else this._paintRock(ctx, cx, cy, radius, palette);
  }

  /**
   * Trace the irregular rock silhouette as a closed polygon (straight edges: low-poly look).
   * @param {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} ctx
   * @param {number} cx
   * @param {number} cy
   * @param {number} radius
   * @private
   */
  _traceRock(ctx, cx, cy, radius) {
    const s = this._shape;
    const step = PI2 / SHAPE_VERTS;
    ctx.beginPath();
    for (let i = 0; i < SHAPE_VERTS; i++) {
      const a = i * step;
      const x = cx + Math.cos(a) * radius * s[i];
      const y = cy + Math.sin(a) * radius * s[i];
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  /**
   * Fill the half of the current clip that faces away from the key light with the facet colour:
   * a single hard-edged shadow plane gives the flat two-tone look.
   * @param {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} ctx
   * @param {number} cx
   * @param {number} cy
   * @param {number} radius
   * @param {string} color
   * @param {number} offset Distance of the shadow edge from the centre, as a fraction of radius
   *  (positive moves the edge toward the shadow side, exposing more lit face).
   * @private
   */
  _fillShadowPlane(ctx, cx, cy, radius, color, offset) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.atan2(-LIGHT_Y, -LIGHT_X));
    ctx.fillStyle = color;
    ctx.fillRect(radius * offset, -radius * 2, radius * 4, radius * 4);
    ctx.restore();
  }

  /**
   * Flat rock: light face, hard shadow facet on the far side, thin dark outline.
   * @param {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} ctx
   * @param {number} cx
   * @param {number} cy
   * @param {number} radius
   * @param {any} palette
   * @private
   */
  _paintRock(ctx, cx, cy, radius, palette) {
    ctx.save();
    this._traceRock(ctx, cx, cy, radius);
    ctx.fillStyle = palette.FACE || palette.GRAD_IN;
    ctx.fill();
    ctx.clip();
    this._fillShadowPlane(ctx, cx, cy, radius, palette.FACET || palette.GRAD_OUT, 0.12);
    ctx.restore();
    this._traceRock(ctx, cx, cy, radius);
    ctx.strokeStyle = palette.OUTLINE;
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(1.25, radius * 0.06);
    ctx.stroke();
  }

  /**
   * Flat planet: disc with a crescent shadow, flat craters, thin outline and damage cracks.
   * @param {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} ctx
   * @param {number} cx
   * @param {number} cy
   * @param {number} radius
   * @param {any} palette
   * @private
   */
  _paintPlanet(ctx, cx, cy, radius, palette) {
    const face = palette.FACE || palette.GRAD_IN;
    const facet = palette.FACET || palette.GRAD_OUT;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, PI2);
    ctx.clip();
    ctx.fillStyle = facet;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    // Lit disc offset toward the light leaves a crescent of shadow on the far side.
    ctx.fillStyle = face;
    ctx.beginPath();
    ctx.arc(cx + LIGHT_X * radius * 0.16, cy + LIGHT_Y * radius * 0.16, radius * 0.9, 0, PI2);
    ctx.fill();
    ctx.globalAlpha = 0.8;
    this._drawCraters(ctx, cx, cy, palette, false);
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.strokeStyle = palette.OUTLINE;
    ctx.lineWidth = Math.max(1.5, radius * 0.045);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, PI2);
    ctx.stroke();
    if (this._hits > 0) this._drawDamage(ctx, cx, cy, radius, palette);
  }

  /**
   * Draw flat craters (single darker discs). `onlyGrowing` selects the live reveal overlay
   * (craters with grow < 1); otherwise only settled craters are drawn (baked surface / fallback).
   * @param {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} ctx
   * @param {number} centerX
   * @param {number} centerY
   * @param {any} palette
   * @param {boolean} onlyGrowing
   * @param {number} [scale=1] Crater radius multiplier.
   * @private
   */
  _drawCraters(ctx, centerX, centerY, palette, onlyGrowing, scale = 1) {
    if (!this._craters.length) return;
    const cfg = CONFIG.ASTEROID.CRATER_EMBOSS;
    ctx.fillStyle = palette.CRATER;
    for (let i = 0; i < this._craters.length; i++) {
      const c = this._craters[i];
      let grow = c.grow === undefined ? 1 : c.grow;
      if (grow < 1 !== onlyGrowing) continue;
      if (grow < 1 && cfg.REVEAL_EASE === "outQuad") grow = 1 - (1 - grow) * (1 - grow);
      ctx.beginPath();
      ctx.arc(centerX + c.dx, centerY + c.dy, c.r * grow * scale, 0, PI2);
      ctx.fill();
    }
  }

  /**
   * Draw thin damage cracks for hardened planets (count / width / alpha scale with hit severity).
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
    const damageColor =
      (palette && (palette.SHIELD || palette.RING || palette.OUTLINE)) || "rgba(255,255,255,0.8)";
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = damageColor;
    ctx.lineWidth = 0.9 + severity * 1.6;
    ctx.globalAlpha = 0.5 + 0.5 * severity;
    for (let i = 0; i < lines; i++) {
      const angle =
        i < this._damageLineCount ? this._damageLineAngles[i] : (i / lines) * Math.PI * 2;
      const lenFactor = i < this._damageLineCount ? this._damageLineLens[i] : 0.85;
      const endFactor = Math.min(lenFactor + severity * 0.3, 0.95);
      const sx = centerX + Math.cos(angle) * radius * 0.3;
      const sy = centerY + Math.sin(angle) * radius * 0.3;
      const mx = centerX + Math.cos(angle + 0.3) * radius * 0.55;
      const my = centerY + Math.sin(angle + 0.3) * radius * 0.55;
      const ex = centerX + Math.cos(angle + 0.6) * radius * endFactor;
      const ey = centerY + Math.sin(angle + 0.6) * radius * endFactor;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(mx, my);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
    if (severity > 0.7) {
      ctx.lineWidth = 1.5 + severity * 2;
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.moveTo(centerX - radius * 0.4, centerY - radius * 0.2);
      ctx.lineTo(centerX + radius * 0.1, centerY + radius * 0.5);
      ctx.lineTo(centerX + radius * 0.4, centerY - radius * 0.1);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Thin pulsing halo ring for bonus planets (one stroked arc per frame).
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} cx
   * @param {number} cy
   * @param {number} radius
   * @param {any} palette
   * @private
   */
  _drawPulse(ctx, cx, cy, radius, palette) {
    const k = 0.5 + 0.5 * Math.sin(this._pulseT * 4.5 + this._pulse);
    ctx.save();
    ctx.strokeStyle = palette.RING || palette.FACE;
    ctx.globalAlpha = 0.25 + 0.55 * k;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * (1.14 + 0.06 * k), 0, PI2);
    ctx.stroke();
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
    // Clear the whole retained canvas, not just the used region: drawImage samples texels just
    // outside the source rect, so stale pixels from a previous larger bake would bleed in as a
    // dark edge along the bottom/right of the sprite.
    off.clearRect(0, 0, sprite.canvas.width, sprite.canvas.height);
    off.save();
    this._paintSurface(off, centerX, centerY, radius, palette);
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
    this._initVisualState(rand);
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
    this._hitFlash = 1;
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
