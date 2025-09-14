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
   * @param {number} x
   * @param {number} y
   * @param {number} width
   * @param {number} height
   * @param {number} speed
   * @param {import('../types.js').RNGLike} [rng]
   * @param {boolean} [isIndestructible=false]
   * @param {any} [paletteOverride]
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
    if (craterCfg.ENABLE) {
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
    }
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
        } else this._palette = CONFIG.COLORS.ASTEROID_DARK || CONFIG.COLORS.ASTEROID;
      }
    }
    const speedFactor =
      this._palette && typeof this._palette.SPEED_FACTOR === "number"
        ? this._palette.SPEED_FACTOR
        : null;
    this.speed = speedFactor ? speed * speedFactor : speed;
    this._hits = 0;
    /** @type {{angle:number,len:number}[]} */ this._damageLines = [];
  }

  update(dtSec = CONFIG.TIME.DEFAULT_DT) {
    this.y += this.speed * dtSec;
    if (this.isIndestructible && this._shieldFlash > 0)
      this._shieldFlash = Math.max(0, this._shieldFlash - dtSec);
    const cfg = CONFIG.ASTEROID.CRATER_EMBOSS;
    if (cfg && cfg.ENABLE && cfg.REVEAL_TIME > 0 && this._craters.length) {
      const rt = cfg.REVEAL_TIME;
      for (let i = 0; i < this._craters.length; i++) {
        const cr = this._craters[i];
        if (cr.grow !== undefined && cr.grow < 1) cr.grow = Math.min(1, cr.grow + dtSec / rt);
      }
    }
  }

  /**
   * Render the asteroid.
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx) {
    ctx.save();
    const centerX = this.x + this.width / 2;
    const centerY = this.y + this.height / 2;
    const radius = this.width / 2;
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
    if (CONFIG.ASTEROID.CRATER_EMBOSS.ENABLE && this._craters.length) {
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
        const desc = this._damageLines && this._damageLines[i];
        const angle = desc ? desc.angle : (i / lines) * Math.PI * 2;
        const lenFactor = desc
          ? desc.len
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

  getBounds() {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }

  /**
   * Reset for object pooling.
   * @param {number} x
   * @param {number} y
   * @param {number} width
   * @param {number} height
   * @param {number} speed
   * @param {import('../types.js').RNGLike} [rng]
   * @param {boolean} [isIndestructible=false]
   * @param {any} [paletteOverride]
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
    this._damageLines = [];
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
    this._craters = [];
    this._reserveCraters = [];
    if (cfg.ENABLE) {
      this._craters = Array.from({ length: count }, () => ({
        dx: (rand.nextFloat() - 0.5) * radius * 0.8,
        dy: (rand.nextFloat() - 0.5) * radius * 0.8,
        r: rand.nextFloat() * maxR + sizeMin,
        grow: 1,
      }));
      const extraMax = cfg.EXTRA_MAX || 0;
      this._reserveCraters = extraMax
        ? Array.from({ length: extraMax }, () => ({
            dx: (rand.nextFloat() - 0.5) * radius * 0.85,
            dy: (rand.nextFloat() - 0.5) * radius * 0.85,
            r: rand.nextFloat() * maxR + sizeMin,
            grow: 1,
          }))
        : [];
      this._initialCraterCount = this._craters.length;
    } else {
      this._initialCraterCount = undefined;
    }
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
        } else this._palette = CONFIG.COLORS.ASTEROID_DARK || CONFIG.COLORS.ASTEROID;
      }
    }
    const speedFactor =
      this._palette && typeof this._palette.SPEED_FACTOR === "number"
        ? this._palette.SPEED_FACTOR
        : null;
    this.speed = speedFactor ? speed * speedFactor : speed;
  }

  onShieldHit() {
    if (!this.isIndestructible) return;
    this._shieldFlash = CONFIG.ASTEROID.SHIELD_FLASH_TIME;
  }

  /** @param {any} [game] */
  onBulletHit(game) {
    if (!this.isIndestructible) return true;
    this._hits = (this._hits || 0) + 1;
    this.onShieldHit();
    try {
      const rand =
        this._rng && typeof this._rng.nextFloat === "function"
          ? this._rng
          : { nextFloat: Math.random.bind(Math) };
      const rawLen = 0.6 + rand.nextFloat() * 0.5;
      const clampedLen = Math.min(rawLen, 0.9);
      this._damageLines.push({ angle: rand.nextFloat() * Math.PI * 2, len: clampedLen });
    } catch {
      /* noop */
    }
    const newCraters = [];
    try {
      const cfg = CONFIG.ASTEROID.CRATER_EMBOSS;
      if (cfg && cfg.ENABLE && this._reserveCraters && this._reserveCraters.length) {
        const maxHits = CONFIG.ASTEROID.INDESTRUCTIBLE_HITS || 10;
        const severity = Math.min(1, this._hits / maxHits);
        const extraMax = cfg.EXTRA_MAX || 0;
        const desiredExtra = Math.min(extraMax, Math.floor(severity * extraMax + 0.00001));
        if (this._initialCraterCount === undefined) this._initialCraterCount = this._craters.length;
        const currentExtra = this._craters.length - this._initialCraterCount;
        if (currentExtra < desiredExtra) {
          const toAdd = desiredExtra - currentExtra;
          for (let i = 0; i < toAdd && this._reserveCraters.length; i++) {
            const next = this._reserveCraters.shift();
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
    if (newCraters.length && game && CONFIG.ASTEROID.CRATER_EMBOSS.PUFF_ENABLE) {
      for (const c of newCraters) this._spawnCraterDust(c, game);
    }
    return this._hits >= (CONFIG.ASTEROID.INDESTRUCTIBLE_HITS || 10);
  }

  /** @param {Crater} crater @param {{particlePool:any,particles:any[],rng?:any}} game */
  _spawnCraterDust(crater, game) {
    if (!game || !game.particlePool || !game.particles) return;
    if (crater._puffed) return;
    crater._puffed = true;
    const cfg = CONFIG.ASTEROID.CRATER_EMBOSS;
    const count = cfg.PUFF_COUNT || 4;
    const rng =
      game.rng && typeof game.rng.nextFloat === "function"
        ? game.rng
        : { nextFloat: Math.random.bind(Math) };
    const cx = this.x + this.width / 2 + crater.dx;
    const cy = this.y + this.height / 2 + crater.dy;
    for (let i = 0; i < count; i++) {
      const ang = rng.nextFloat() * Math.PI * 2;
      const baseSp = cfg.PUFF_SPEED || 120;
      const sp = baseSp + (rng.nextFloat() - 0.5) * (cfg.PUFF_SPEED_VAR || 0);
      // Upward visibility bias: compress downward hemisphere probability
      let vx = Math.cos(ang) * sp;
      let vy = Math.sin(ang) * sp;
      // Flatten less (0.8 instead of 0.6) and bias upward (if vy > 0 reduce slightly, if vy < 0 boost)
      vy *= 0.8;
      if (vy > 0) vy *= 0.6;
      else vy *= 1.2;
      // Slight outward scale so particles separate sooner
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
