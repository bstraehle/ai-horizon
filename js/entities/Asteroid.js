import { CONFIG, PI2 } from "../constants.js";

/** @typedef {{dx:number,dy:number,r:number}} Crater */

/**
 * Asteroid / Planet entity.
 *
 * Crater Emboss Feature:
 *  When CONFIG.ASTEROID.CRATER_EMBOSS.ENABLE is true each asteroid procedurally
 *  generates a set of craters whose count and size are determined by
 *  CRATER_EMBOSS.{COUNT_BASE,COUNT_VAR,SIZE_MIN,SIZE_FACTOR}. A light direction
 *  vector (LIGHT_DIR) defines where the highlight rim is placed. Each crater is
 *  drawn as:
 *    1. Base crater disc (palette.CRATER color)
 *    2. Radial inner shadow gradient offset opposite the light to darken the far wall
 *    3. Highlight rim arc on the near (light-facing) side
 *    4. Shadow rim arc on the far side
 *
 *  The effect is inexpensive: gradients and strokes are only drawn for the
 *  small crater subset per asteroid (~3-5 by default). Set ENABLE=false to
 *  revert to a flat shaded asteroid (useful for performance tests or visual
 *  comparisons). The crater list is regenerated on construction/reset so pooled
 *  asteroids get fresh crater layouts.
 *
 * Damage Layering:
 *  For indestructible asteroids, as hits accumulate additional "reserve" craters
 *  are activated (up to EXTRA_MAX). At the same time shadow gradients darken
 *  (SHADOW_DARKEN_SCALE) and highlight rims fade (HIGHLIGHT_FADE_SCALE), giving a
 *  progressively battered look without sprite swaps.
 */

/** Game obstacle with movement, palette, and damage/shield visuals. */
export class Asteroid {
  /** @param {number} x @param {number} y @param {number} width @param {number} height @param {number} speed @param {import('../types.js').RNGLike} [rng] @param {boolean} [isIndestructible=false] */
  constructor(x, y, width, height, speed, rng, isIndestructible = false, paletteOverride = null) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.speed = speed;
    /** @type {boolean} */
    this.isIndestructible = !!isIndestructible;
    /** Remaining time for shield hit flash (seconds) */
    this._shieldFlash = 0;
    const radius = this.width / 2;
    // RNG selection (store for later deterministic palette & damage lines)
    const rand =
      rng && typeof rng.nextFloat === "function" ? rng : { nextFloat: Math.random.bind(Math) };
    this._rng = rng && typeof rng.nextFloat === "function" ? rng : null;
    // Crater emboss config
    const craterCfg = CONFIG.ASTEROID.CRATER_EMBOSS;
    const baseCount = craterCfg.COUNT_BASE || 3;
    const varCount = craterCfg.COUNT_VAR || 0;
    const count = baseCount + (varCount > 0 ? Math.floor(rand.nextFloat() * (varCount + 1)) : 0);
    const sizeMin = craterCfg.SIZE_MIN || 2;
    const sizeFactor = craterCfg.SIZE_FACTOR || 0.3;
    const maxR = radius * sizeFactor;
    /** @type {Crater[]} */ this._craters = [];
    /** @type {Crater[]} */ this._reserveCraters = [];
    if (CONFIG.ASTEROID.CRATER_EMBOSS.ENABLE) {
      this._craters = Array.from({ length: count }, () => ({
        dx: (rand.nextFloat() - 0.5) * radius * 0.8,
        dy: (rand.nextFloat() - 0.5) * radius * 0.8,
        r: rand.nextFloat() * maxR + sizeMin,
      }));
      // Prepare reserve craters for damage layering
      const extraMax = craterCfg.EXTRA_MAX || 0;
      this._reserveCraters = extraMax
        ? Array.from({ length: extraMax }, () => ({
            dx: (rand.nextFloat() - 0.5) * radius * 0.85,
            dy: (rand.nextFloat() - 0.5) * radius * 0.85,
            r: rand.nextFloat() * maxR + sizeMin,
          }))
        : [];
      // Record initial crater baseline for later activation math
      this._initialCraterCount = this._craters.length;
    } else {
      this._craters = [];
      this._reserveCraters = [];
    }
    // Choose and store a palette once to avoid flicker
    this._palette = CONFIG.COLORS.ASTEROID;
    if (this.isIndestructible) {
      // If a palette override was provided (from SpawnManager), prefer it.
      if (paletteOverride && typeof paletteOverride === "object") {
        this._palette = paletteOverride;
      } else {
        const planets = CONFIG.COLORS.ASTEROID_PLANETS;
        if (Array.isArray(planets) && planets.length > 0) {
          const idx = this._rng
            ? Math.floor(this._rng.nextFloat() * planets.length)
            : Math.floor(Math.random() * planets.length);
          this._palette = planets[idx];
        } else {
          this._palette = CONFIG.COLORS.ASTEROID_DARK || CONFIG.COLORS.ASTEROID;
        }
      }
    }
    // Apply optional palette speed factor
    const paletteSpeedFactor =
      this._palette && typeof this._palette.SPEED_FACTOR === "number"
        ? this._palette.SPEED_FACTOR
        : null;
    this.speed = paletteSpeedFactor ? speed * paletteSpeedFactor : speed;
    // Track bullet hits for indestructible asteroids
    this._hits = 0;
    // Stable damage line descriptors
    /** @type {{angle:number,len:number}[]} */
    this._damageLines = [];
  }

  /** Update position and shield flash timer. */
  update(dtSec = CONFIG.TIME.DEFAULT_DT) {
    this.y += this.speed * dtSec;
    if (this.isIndestructible && this._shieldFlash > 0) {
      this._shieldFlash = Math.max(0, this._shieldFlash - dtSec);
    }
  }

  /** Draw asteroid with craters, shield flash, and damage lines.
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx) {
    ctx.save();
    const centerX = this.x + this.width / 2;
    const centerY = this.y + this.height / 2;
    const radius = this.width / 2;
    // Stored palette chosen at creation/reset
    const palette = this._palette || CONFIG.COLORS.ASTEROID;
    const shieldColor =
      (palette && palette.SHIELD) ||
      (CONFIG.COLORS.ASTEROID_HARD && CONFIG.COLORS.ASTEROID_HARD.SHIELD) ||
      "#7fc3ff";
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
    // Crater emboss: render each crater with inner shadow + rim highlight to suggest depth.
    // Light assumed from top-left (negative dx/dy). We'll draw:
    // 1. Base crater fill (flat color)
    // 2. Inner shadow (radial gradient darker toward far / bottom-right)
    // 3. Highlight arc on near (top-left) rim
    // 4. Subtle shadow arc on far (bottom-right) rim
    if (CONFIG.ASTEROID.CRATER_EMBOSS.ENABLE && this._craters.length) {
      const craterCfg = CONFIG.ASTEROID.CRATER_EMBOSS;
      const light = craterCfg.LIGHT_DIR || { x: -0.7, y: -0.7 };
      // Precompute highlight/shadow arcs based on light direction.
      // We'll approximate: highlight centered at opposite angle of light vector, shadow on light-opposite side.
      const lightAngle = Math.atan2(light.y, light.x); // direction FROM crater to light
      const highlightCenter = lightAngle; // near side
      const shadowCenter = lightAngle + Math.PI; // far side
      const arcSpan = Math.PI * 0.55; //  ~100 deg
      const hlStart = highlightCenter - arcSpan / 2;
      const hlEnd = highlightCenter + arcSpan / 2;
      const shStart = shadowCenter - arcSpan / 2;
      const shEnd = shadowCenter + arcSpan / 2;
      // Damage severity affects crater shading
      const severity =
        this.isIndestructible && this._hits > 0
          ? Math.min(1, this._hits / (CONFIG.ASTEROID.INDESTRUCTIBLE_HITS || 10))
          : 0;
      const darkenScale = craterCfg.SHADOW_DARKEN_SCALE || 0;
      const fadeScale = craterCfg.HIGHLIGHT_FADE_SCALE || 0;
      const midAlpha = (craterCfg.SHADOW_ALPHA_MID || 0.25) * (1 + darkenScale * severity);
      const innerAlpha = (craterCfg.SHADOW_ALPHA_INNER || 0.45) * (1 + darkenScale * severity);
      const hlAlpha = (craterCfg.HIGHLIGHT_ALPHA || 0.35) * (1 - fadeScale * severity);
      for (const c of this._craters) {
        const cx = centerX + c.dx;
        const cy = centerY + c.dy;
        const r = c.r;
        // Base crater disc
        ctx.fillStyle = palette.CRATER;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, PI2);
        ctx.fill();
        // Inner shadow radial gradient (darker on far side). Offset gradient center toward light.
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
        // Rim highlight (near side)
        ctx.beginPath();
        ctx.strokeStyle = `rgba(255,255,255,${hlAlpha})`;
        ctx.lineWidth = Math.max(0.75, r * 0.25);
        ctx.arc(cx, cy, r, hlStart, hlEnd);
        ctx.stroke();
        // Far-side shadow rim
        ctx.beginPath();
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.lineWidth = Math.max(0.6, r * 0.22);
        ctx.arc(cx, cy, r, shStart, shEnd);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = palette.OUTLINE;
    ctx.lineWidth = this.isIndestructible ? 3 : 2;
    ctx.stroke();

    // Shield flash ring when hit
    if (this.isIndestructible && this._shieldFlash > 0) {
      const t = Math.max(0, Math.min(1, this._shieldFlash / CONFIG.ASTEROID.SHIELD_FLASH_TIME));
      ctx.save();
      ctx.strokeStyle = shieldColor;
      ctx.lineWidth = 2 + 2 * t;
      ctx.shadowColor = shieldColor;
      ctx.shadowBlur = 10 + 10 * t;
      ctx.globalAlpha = 0.6 + 0.6 * t;
      const ringR = radius * (1.05 + 0.05 * t);
      ctx.beginPath();
      ctx.arc(centerX, centerY, ringR, 0, PI2);
      ctx.stroke();
      ctx.restore();
    }

    // Damage scratches scale with hit count
    if (this.isIndestructible && this._hits > 0) {
      ctx.save();
      const severity = Math.max(
        0,
        Math.min(1, this._hits / (CONFIG.ASTEROID.INDESTRUCTIBLE_HITS || 10))
      );
      // Scratch line count scales with severity
      const lines = 1 + Math.floor(severity * 4);
      // Choose a damage color based on palette. ICE gets light/white scratches;
      // otherwise prefer SHIELD, then RING, then OUTLINE.
      let damageColor;
      if (palette && palette.NAME === "ICE") {
        damageColor = "rgba(255,255,255,0.85)";
      } else if (palette && palette.SHIELD) {
        damageColor = palette.SHIELD;
      } else if (palette && palette.RING) {
        damageColor = palette.RING;
      } else if (palette && palette.OUTLINE) {
        damageColor = palette.OUTLINE;
      } else {
        damageColor = "rgba(255,255,255,0.6)";
      }
      // Adjust style for icy palettes
      if (palette && palette.NAME === "ICE") {
        ctx.strokeStyle = damageColor;
        ctx.lineWidth = 0.8 + severity * 1.2;
        ctx.globalAlpha = 0.25 + 0.5 * severity;
      } else {
        ctx.strokeStyle = damageColor;
        ctx.lineWidth = 1 + severity * 2;
        ctx.globalAlpha = 0.4 + 0.6 * severity;
      }
      // Use stored damage lines to avoid flicker
      for (let i = 0; i < lines; i++) {
        const desc = this._damageLines && this._damageLines[i];
        const angle = desc ? desc.angle : (i / lines) * Math.PI * 2;
        const lenFactor = desc
          ? desc.len
          : 0.6 + (this._rng ? this._rng.nextFloat() : Math.random()) * 0.5;
        // Clamp so cracks stay inside circle
        const endFactorRaw = lenFactor + severity * 0.3;
        const endFactor = Math.min(endFactorRaw, 0.95);
        const sx = centerX + Math.cos(angle) * radius * 0.3;
        const sy = centerY + Math.sin(angle) * radius * 0.3;
        const ex = centerX + Math.cos(angle + 0.6) * radius * endFactor;
        const ey = centerY + Math.sin(angle + 0.6) * radius * endFactor;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(centerX, centerY, ex, ey);
        ctx.stroke();
      }
      // Final pronounced crack near destruction
      if (severity > 0.7) {
        ctx.lineWidth = 2 + severity * 3;
        ctx.globalAlpha = 0.9;
        // Use palette-aware crack color
        const finalCrackColor =
          typeof damageColor !== "undefined" && damageColor ? damageColor : "rgba(0,0,0,0.7)";
        ctx.strokeStyle = finalCrackColor;
        ctx.beginPath();
        ctx.moveTo(centerX - radius * 0.4, centerY - radius * 0.2);
        ctx.lineTo(centerX + radius * 0.1, centerY + radius * 0.5);
        ctx.lineTo(centerX + radius * 0.4, centerY - radius * 0.1);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  /** Returns the axis-aligned bounding box for collisions.
   * @returns {import('../types.js').Rect}
   */
  getBounds() {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }

  /** Reset to a fresh state for pooling.
   * @param {number} x
   * @param {number} y
   * @param {number} width
   * @param {number} height
   * @param {number} speed
   * @param {import('../types.js').RNGLike} [rng]
   * @param {boolean} [isIndestructible=false]
   */
  reset(x, y, width, height, speed, rng, isIndestructible = false, paletteOverride = null) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.speed = speed;
    this.isIndestructible = !!isIndestructible;
    this._shieldFlash = 0;
    // Reset hit counter when reusing from pool so prior hits don't carry over
    this._hits = 0;
    this._damageLines = [];
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
    this._craters = [];
    this._reserveCraters = [];
    if (CONFIG.ASTEROID.CRATER_EMBOSS.ENABLE) {
      this._craters = Array.from({ length: count }, () => ({
        dx: (rand.nextFloat() - 0.5) * radius * 0.8,
        dy: (rand.nextFloat() - 0.5) * radius * 0.8,
        r: rand.nextFloat() * maxR + sizeMin,
      }));
      const extraMax = craterCfg.EXTRA_MAX || 0;
      this._reserveCraters = extraMax
        ? Array.from({ length: extraMax }, () => ({
            dx: (rand.nextFloat() - 0.5) * radius * 0.85,
            dy: (rand.nextFloat() - 0.5) * radius * 0.85,
            r: rand.nextFloat() * maxR + sizeMin,
          }))
        : [];
      this._initialCraterCount = this._craters.length;
    } else {
      this._craters = [];
      this._reserveCraters = [];
      this._initialCraterCount = undefined;
    }
    // Recompute and store palette for this asteroid instance
    this._palette = CONFIG.COLORS.ASTEROID;
    if (this.isIndestructible) {
      if (paletteOverride && typeof paletteOverride === "object") {
        this._palette = paletteOverride;
      } else {
        const planets = CONFIG.COLORS.ASTEROID_PLANETS;
        if (Array.isArray(planets) && planets.length > 0) {
          const idx = this._rng
            ? Math.floor(this._rng.nextFloat() * planets.length)
            : Math.floor(Math.random() * planets.length);
          this._palette = planets[idx];
        } else {
          this._palette = CONFIG.COLORS.ASTEROID_DARK || CONFIG.COLORS.ASTEROID;
        }
      }
    }
    const paletteSpeedFactor =
      this._palette && typeof this._palette.SPEED_FACTOR === "number"
        ? this._palette.SPEED_FACTOR
        : null;
    this.speed = paletteSpeedFactor ? speed * paletteSpeedFactor : speed;
  }

  /** Trigger a brief shield hit flash (no-op for normal asteroids). */
  onShieldHit() {
    if (!this.isIndestructible) return;
    this._shieldFlash = CONFIG.ASTEROID.SHIELD_FLASH_TIME;
  }

  /**
   * Register a bullet hit against this asteroid. For regular asteroids this should not be called.
   * For indestructible asteroids, increment the internal hit counter and return true when the
   * asteroid should be destroyed (after CONFIG.ASTEROID.INDESTRUCTIBLE_HITS hits).
   * @returns {boolean} true if asteroid should now be destroyed
   */
  onBulletHit() {
    if (!this.isIndestructible) return true; // regular asteroids are destroyed immediately
    this._hits = (this._hits || 0) + 1;
    this.onShieldHit();
    // Add a stable damage line for this hit so visuals don't flicker
    try {
      const rand =
        this._rng && typeof this._rng.nextFloat === "function"
          ? this._rng
          : { nextFloat: Math.random.bind(Math) };
      // Push a single damage line per hit: angle + length factor (clamped so cracks stay inside)
      const rawLen = 0.6 + rand.nextFloat() * 0.5;
      const clampedLen = Math.min(rawLen, 0.9);
      this._damageLines.push({
        angle: rand.nextFloat() * Math.PI * 2,
        len: clampedLen,
      });
    } catch {
      /* noop */
    }
    // Damage-based crater activation
    try {
      const craterCfg = CONFIG.ASTEROID.CRATER_EMBOSS;
      if (craterCfg && craterCfg.ENABLE && this._reserveCraters && this._reserveCraters.length) {
        const maxHits = CONFIG.ASTEROID.INDESTRUCTIBLE_HITS || 10;
        const severity = Math.min(1, this._hits / maxHits);
        const extraMax = craterCfg.EXTRA_MAX || 0;
        const desiredExtra = Math.min(extraMax, Math.floor(severity * extraMax + 0.00001));
        if (this._initialCraterCount === undefined) this._initialCraterCount = this._craters.length;
        const currentExtra = this._craters.length - this._initialCraterCount;
        if (currentExtra < desiredExtra) {
          const toAdd = desiredExtra - currentExtra;
          for (let i = 0; i < toAdd && this._reserveCraters.length; i++) {
            const next = this._reserveCraters.shift();
            if (next) this._craters.push(next);
          }
        }
      }
    } catch {
      /* ignore crater activation errors */
    }
    return this._hits >= (CONFIG.ASTEROID.INDESTRUCTIBLE_HITS || 10);
  }
}
