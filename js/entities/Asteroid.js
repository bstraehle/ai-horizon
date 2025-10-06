import { CONFIG, PI2 } from "../constants.js";

/** @typedef {{dx:number,dy:number,r:number,grow?:number,_puffed?:boolean}} Crater */

/**
 * Asteroid / Planet entity.
 * Visual polish includes:
 *  - Embossed crater shading with highlight + inner shadow
 *  - Progressive crater activation & shading darkening as hits accumulate
 *  - Reveal animation (craters grow in with easing)
 *  - Dust puff particle burst on new crater activation (tuned for visibility)
 *    Puff parameters can be adjusted in CONFIG.ASTEROID.CRATER_EMBOSS (PUFF_*)
 */
export class Asteroid {
  /**
   * Construct a new asteroid / planet entity (or reset template when pooled).
   *
   * Purpose:
   *  - Represent a falling obstacle with optional indestructible (planet) styling.
   *  - Optionally generate textured crater emboss geometry (visual only) with reveal animation.
   *  - Parameterize color palette & speed via palette overrides or randomized planet palettes.
   *
   * Crater Generation:
   *  - Count = base + variable (see CONFIG.ASTEROID.CRATER_EMBOSS COUNT_* keys).
   *  - Reserve list preallocated when EXTRA_MAX > 0 to allow progressive damage reveal on planets.
   *  - Each crater stores relative offset (dx,dy), radius r, and transient grow factor for reveal.
   *
   * Indestructible Planets:
   *  - Use alternate palette list (ASTEROID_PLANETS) or provided override for thematic variety.
   *  - Track hits to drive crack line rendering & crater activation.
   *
   * Performance Notes:
   *  - Heavy math only during construction/reset (random generation). Per-frame update is O(craters).
   *  - Drawing loops over craters; configuration allows disabling emboss entirely for perf.
   *
   * @param {number} x World x (top-left)
   * @param {number} y World y (top-left)
   * @param {number} width Diameter proxy (used to derive radius)
   * @param {number} height Diameter proxy (kept for symmetry with other entities; should match width)
   * @param {number} speed Downward speed (pixels/sec before palette speed factor)
   * @param {import('../types.js').RNGLike} [rng] Optional deterministic RNG (nextFloat())
   * @param {boolean} [isIndestructible=false] If true behaves like a multi‑hit planet
   * @param {any} [paletteOverride] Optional palette object to force style (used for curated planets)
   */
  constructor(x, y, width, height, speed, rng, isIndestructible = false, paletteOverride = null) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.speed = speed;
    this.isIndestructible = !!isIndestructible;
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
    if (this.isIndestructible) {
      if (paletteOverride && typeof paletteOverride === "object") this._palette = paletteOverride;
      else {
        const planets = CONFIG.COLORS.ASTEROID_PLANETS;
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
    // Damage crack storage (fixed-size) to avoid per-hit object allocations.
    /** @private */ this._damageLineAngles = new Float32Array(8);
    /** @private */ this._damageLineLens = new Float32Array(8);
    /** @private */ this._damageLineCount = 0;
  }

  /**
   * Advance vertical position and animate crater reveal grows.
   *
   * Side Effects:
   *  - Mutates y, crater grow factors.
   *
   * Complexity: O(C) where C = current crater count.
   * @param {number} [dtSec=CONFIG.TIME.DEFAULT_DT] Delta time seconds.
   */
  update(dtSec = CONFIG.TIME.DEFAULT_DT) {
    this.y += this.speed * dtSec;
    const cfg = CONFIG.ASTEROID.CRATER_EMBOSS;
    if (cfg && cfg.REVEAL_TIME > 0 && this._craters.length) {
      const rt = cfg.REVEAL_TIME;
      for (let i = 0; i < this._craters.length; i++) {
        const cr = this._craters[i];
        if (cr.grow !== undefined && cr.grow < 1) cr.grow = Math.min(1, cr.grow + dtSec / rt);
      }
    }
  }

  /**
   * Render asteroid / planet with gradient fill, crater emboss lighting, damage cracks and shield variance.
   *
   * Rendering Pipeline:
   *  1. Body radial gradient (palette GRAD_*).
   *  2. Optional crater base fill + inner shadow + highlight arcs (per crater).
   *  3. Outline stroke (thicker if indestructible).
   *  4. Damage crack splines proportional to hit severity (planets only).
   *
   * Perf Considerations:
   *  - Uses multiple gradients; try disabling CRATER_EMBOSS for low-end devices.
   *  - Crack generation limited by pushes in onBulletHit (bounded ~5 lines + final crack).
   *
   * @param {CanvasRenderingContext2D} ctx Target 2D context (state restored before return).
   */
  draw(ctx) {
    ctx.save();
    const centerX = this.x + this.width / 2;
    const centerY = this.y + this.height / 2;
    const radius = this.width / 2;
    const palette = this._palette || CONFIG.COLORS.ASTEROID;
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
    if (this._craters.length) {
      const cfg = CONFIG.ASTEROID.CRATER_EMBOSS;
      const light = cfg.LIGHT_DIR || { x: -0.7, y: -0.7 };
      const lightAngle = Math.atan2(light.y, light.x);
      const highlightCenter = lightAngle;
      const shadowCenter = lightAngle + Math.PI;
      const arcSpan = Math.PI * 0.55;
      const hlStart = highlightCenter - arcSpan / 2;
      const hlEnd = highlightCenter + arcSpan / 2;
      const shStart = shadowCenter - arcSpan / 2;
      const shEnd = shadowCenter + arcSpan / 2;
      const severity =
        this.isIndestructible && this._hits > 0
          ? Math.min(1, this._hits / (CONFIG.ASTEROID.INDESTRUCTIBLE_HITS || 10))
          : 0;
      const darkenScale = cfg.SHADOW_DARKEN_SCALE || 0;
      const fadeScale = cfg.HIGHLIGHT_FADE_SCALE || 0;
      const midAlpha = (cfg.SHADOW_ALPHA_MID || 0.25) * (1 + darkenScale * severity);
      const innerAlpha = (cfg.SHADOW_ALPHA_INNER || 0.45) * (1 + darkenScale * severity);
      const hlAlpha = (cfg.HIGHLIGHT_ALPHA || 0.35) * (1 - fadeScale * severity);
      for (const c of this._craters) {
        const cx = centerX + c.dx;
        const cy = centerY + c.dy;
        let grow = c.grow === undefined ? 1 : c.grow;
        if (grow < 1 && cfg.REVEAL_EASE === "outQuad") grow = 1 - (1 - grow) * (1 - grow);
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
    ctx.strokeStyle = palette.OUTLINE;
    ctx.lineWidth = this.isIndestructible ? 3 : 2;
    ctx.stroke();
    if (this.isIndestructible && this._hits > 0) {
      ctx.save();
      const severity = Math.min(1, this._hits / (CONFIG.ASTEROID.INDESTRUCTIBLE_HITS || 10));
      const lines = 1 + Math.floor(severity * 4);
      let damageColor;
      if (palette && palette.NAME === "ICE") damageColor = "rgba(255,255,255,0.85)";
      else if (palette && palette.SHIELD) damageColor = palette.SHIELD;
      else if (palette && palette.RING) damageColor = palette.RING;
      else if (palette && palette.OUTLINE) damageColor = palette.OUTLINE;
      else damageColor = "rgba(255,255,255,0.6)";
      if (palette && palette.NAME === "ICE") {
        ctx.strokeStyle = damageColor;
        ctx.lineWidth = 0.8 + severity * 1.2;
        ctx.globalAlpha = 0.25 + 0.5 * severity;
      } else {
        ctx.strokeStyle = damageColor;
        ctx.lineWidth = 1 + severity * 2;
        ctx.globalAlpha = 0.4 + 0.6 * severity;
      }
      for (let i = 0; i < lines; i++) {
        const angle =
          i < this._damageLineCount ? this._damageLineAngles[i] : (i / lines) * Math.PI * 2;
        const lenFactor =
          i < this._damageLineCount
            ? this._damageLineLens[i]
            : 0.6 + (this._rng ? this._rng.nextFloat() : Math.random()) * 0.5;
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
        const finalCrackColor = damageColor || "rgba(0,0,0,0.7)";
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
   * @param {boolean} [isIndestructible=false] Planet mode flag
   * @param {any} [paletteOverride] Optional palette override
   */
  reset(x, y, width, height, speed, rng, isIndestructible = false, paletteOverride = null) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.speed = speed;
    this.isIndestructible = !!isIndestructible;
    this._shieldFlash = 0;
    this._hits = 0;
    this._damageLineCount = 0; // reuse typed arrays allocated in ctor
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
    if (this.isIndestructible) {
      if (paletteOverride && typeof paletteOverride === "object") this._palette = paletteOverride;
      else {
        const planets = CONFIG.COLORS.ASTEROID_PLANETS;
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
   *  - Indestructible planet: increments hit counter, adds damage line (capped), may activate extra craters.
   *  - Spawns crater dust particles for newly activated craters if puff feature enabled.
   *
   * @param {any} [game] Minimal game facade providing particlePool / particles array (optional). If absent, dust ignored.
   * @returns {boolean} true when entity should be destroyed (regular) or when planet reached max hits.
   */
  onBulletHit(game) {
    if (!this.isIndestructible) return true;
    this._hits = (this._hits || 0) + 1;
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
        const maxHits = CONFIG.ASTEROID.INDESTRUCTIBLE_HITS || 10;
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
              if (CONFIG.ASTEROID.CRATER_EMBOSS.REVEAL_TIME > 0) next.grow = 0;
              this._craters.push(next);
              newCraters.push(next);
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
    return this._hits >= (CONFIG.ASTEROID.INDESTRUCTIBLE_HITS || 10);
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
