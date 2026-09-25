// @ts-check
import { describe, it, expect, afterEach } from "vitest";
import { Asteroid } from "../js/entities/Asteroid.js";
import { Player } from "../js/entities/Player.js";
import { Particle } from "../js/entities/Particle.js";
import { StarField } from "../js/entities/StarField.js";
import { RenderManager } from "../js/managers/RenderManager.js";
import { triggerShake, shakeOffset } from "../js/systems/ScreenShake.js";
import { prefersReducedMotion, setReducedMotion } from "../js/utils/motion.js";
import { CONFIG } from "../js/constants.js";

function seqRng(step = 0.37) {
  let i = 0;
  return {
    calls: 0,
    nextFloat() {
      this.calls++;
      i = (i + step) % 1;
      return i;
    },
  };
}

/** Recording context that tracks composite-mode writes and transform calls. */
function makeCtx() {
  const composites = /** @type {string[]} */ ([]);
  const ctx = {
    calls: { drawImage: 0, translate: 0, rotate: 0 },
    composites,
    _gco: "source-over",
    get globalCompositeOperation() {
      return this._gco;
    },
    set globalCompositeOperation(v) {
      this._gco = v;
      composites.push(v);
    },
    globalAlpha: 1,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    shadowColor: "",
    shadowBlur: 0,
    drawImage() {
      ctx.calls.drawImage++;
    },
    translate() {
      ctx.calls.translate++;
    },
    rotate() {
      ctx.calls.rotate++;
    },
    scale() {},
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    clip() {},
    arc() {},
    ellipse() {},
    fill() {},
    stroke() {},
    fillRect() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  return ctx;
}

afterEach(() => setReducedMotion(null));

describe("Asteroid visual state", () => {
  it("rolls silhouette, spin and phase deterministically and identically for construct vs reset", () => {
    const a = new Asteroid(0, 0, 40, 40, 100, seqRng(), false);
    const b = new Asteroid(0, 0, 60, 60, 100, seqRng(0.11), false);
    b.reset(0, 0, 40, 40, 100, seqRng(), false);
    expect(Array.from(b._shape)).toEqual(Array.from(a._shape));
    expect(b._angle).toBe(a._angle);
    expect(b._spin).toBe(a._spin);
    for (const f of a._shape) {
      expect(f).toBeGreaterThanOrEqual(0.72);
      expect(f).toBeLessThanOrEqual(1);
    }
    expect(Math.abs(a._spin)).toBeLessThanOrEqual(0.9);
  });

  it("planets spin slower than rocks and keep a round silhouette", () => {
    const planet = new Asteroid(0, 0, 80, 80, 100, seqRng(), true);
    expect(Math.abs(planet._spin)).toBeLessThanOrEqual(0.22);
    expect(Array.from(planet._shape).every((v) => v === 0)).toBe(true);
  });

  it("advances rotation in update, wrapping into [0, 2π)", () => {
    const a = new Asteroid(0, 0, 40, 40, 100, seqRng(), false);
    a._angle = Math.PI * 2 - 0.01;
    a._spin = 1;
    a.update(0.05);
    expect(a._angle).toBeGreaterThanOrEqual(0);
    expect(a._angle).toBeLessThan(Math.PI * 2);
    expect(a._angle).toBeCloseTo(0.04, 6);
  });

  it("flashes on a planet hit and fades the flash over subsequent updates", () => {
    const planet = new Asteroid(0, 0, 80, 80, 100, seqRng(), true);
    expect(planet._hitFlash).toBe(0);
    planet.onBulletHit(null);
    expect(planet._hitFlash).toBe(1);
    planet.update(0.1);
    expect(planet._hitFlash).toBeGreaterThan(0);
    expect(planet._hitFlash).toBeLessThan(1);
    for (let i = 0; i < 20; i++) planet.update(0.1);
    expect(planet._hitFlash).toBe(0);
  });

  it("only bonus planets advance the glow pulse clock", () => {
    const planet = new Asteroid(0, 0, 80, 80, 100, seqRng(), true);
    planet.update(0.5);
    expect(planet._pulseT).toBe(0);
    planet.isBonus = true;
    planet.update(0.5);
    expect(planet._pulseT).toBeCloseTo(0.5, 6);
  });

  it("draws in a frame translated to its centre and rotated by its angle", () => {
    const a = new Asteroid(10, 20, 40, 40, 100, seqRng(), false);
    const ctx = makeCtx();
    a.draw(/** @type {any} */ (ctx), 0);
    expect(ctx.calls.translate).toBeGreaterThanOrEqual(1);
    expect(ctx.calls.rotate).toBeGreaterThanOrEqual(1);
  });
});

describe("Player banking", () => {
  it("eases the bank toward the lateral velocity fraction and back to level", () => {
    const p = new Player(100, 100, 25, 25, 480);
    const view = { width: 800, height: 600 };
    for (let i = 0; i < 30; i++) p.update({ ArrowRight: true }, { x: 0, y: 0 }, view, 1 / 60);
    expect(p._bank).toBeGreaterThan(0.9);
    for (let i = 0; i < 60; i++) p.update({}, { x: 0, y: 0 }, view, 1 / 60);
    expect(Math.abs(p._bank)).toBeLessThan(0.02);
  });

  it("does not lean when the user prefers reduced motion", () => {
    setReducedMotion(true);
    const p = new Player(100, 100, 25, 25, 480);
    p._bank = 1;
    const ctx = makeCtx();
    p.draw(/** @type {any} */ (ctx), 0);
    expect(ctx.calls.rotate).toBe(0);
    setReducedMotion(false);
    const ctx2 = makeCtx();
    p.draw(/** @type {any} */ (ctx2), 0);
    expect(ctx2.calls.rotate).toBe(1);
  });
});

describe("ScreenShake", () => {
  it("produces a decaying offset that settles back to zero", () => {
    setReducedMotion(false);
    const host = {};
    triggerShake(host, 10, 0.5);
    const out = { x: 0, y: 0 };
    shakeOffset(host, 1 / 60, out);
    const first = Math.hypot(out.x, out.y);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThanOrEqual(10);
    for (let i = 0; i < 40; i++) shakeOffset(host, 1 / 60, out);
    expect(out.x).toBe(0);
    expect(out.y).toBe(0);
    expect(host._shakeMag).toBe(0);
  });

  it("keeps the stronger of overlapping shakes and is disabled under reduced motion", () => {
    setReducedMotion(false);
    const host = {};
    triggerShake(host, 10, 0.5);
    triggerShake(host, 4, 0.2);
    expect(host._shakeMag).toBe(10);
    setReducedMotion(true);
    const quiet = {};
    triggerShake(quiet, 10, 0.5);
    expect(quiet._shakeT).toBeUndefined();
    expect(prefersReducedMotion()).toBe(true);
  });
});

describe("StarField variants and Particle spark palette", () => {
  it("assigns a deterministic variant from position; only large bright stars become hero stars", () => {
    const small = { x: 12.5, y: 40, size: 0.6, speed: 1, brightness: 1, twinkleOffset: 0 };
    expect(StarField.variantFor(small)).toBe(StarField.variantFor({ ...small }));
    expect(StarField.variantFor(small)).not.toBe(StarField.HERO_VARIANT);
    let heroes = 0;
    for (let i = 0; i < 200; i++) {
      const big = {
        x: i * 7.3,
        y: i * 3.1,
        size: CONFIG.STARFIELD.SIZE_MIN + CONFIG.STARFIELD.SIZE_VAR,
        speed: 1,
        brightness: 1,
        twinkleOffset: 0,
      };
      const v = StarField.variantFor(big);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(StarField.VARIANTS.length);
      if (v === StarField.HERO_VARIANT) heroes++;
    }
    expect(heroes).toBeGreaterThan(0);
    expect(heroes).toBeLessThan(200);
  });

  it("maps quantized levels to a small warm palette with rising hue and lightness", () => {
    const ex = CONFIG.EXPLOSION;
    const colors = [];
    for (let g = ex.PARTICLE_GRAY_MIN; g <= ex.PARTICLE_GRAY_MAX; g += ex.PARTICLE_GRAY_STEP) {
      colors.push(Particle.sparkColor(g));
    }
    expect(new Set(colors).size).toBe(colors.length);
    const hues = colors.map((c) => Number(/hsl\((\d+)/.exec(c)?.[1]));
    for (let i = 1; i < hues.length; i++) expect(hues[i]).toBeGreaterThanOrEqual(hues[i - 1]);
    expect(Particle.sparkColor(-1000)).toBe(colors[0]);
    expect(Particle.sparkColor(1000)).toBe(colors[colors.length - 1]);
  });
});

describe("RenderManager additive passes", () => {
  it("switches to 'lighter' for bullets, explosions and particles and restores source-over", () => {
    const ctx = makeCtx();
    const sprites = { bullet: { width: 20, height: 41 }, bulletTrail: 10, bulletPad: 8 };
    RenderManager.drawBullets(
      /** @type {any} */ (ctx),
      [{ x: 10, y: 10, width: 4, height: 15, speed: 1 }],
      sprites,
      800,
      600
    );
    RenderManager.drawExplosions(/** @type {any} */ (ctx), [], 800, 600);
    RenderManager.drawParticles(/** @type {any} */ (ctx), [], 800, 600);
    expect(ctx.composites).toEqual([
      "lighter",
      "source-over",
      "lighter",
      "source-over",
      "lighter",
      "source-over",
    ]);
    expect(ctx.calls.drawImage).toBe(1);
  });

  it("draws collectible stars at the atlas scale without a pulse under reduced motion", () => {
    setReducedMotion(true);
    const calls = /** @type {any[][]} */ ([]);
    const ctx = /** @type {any} */ ({
      ...makeCtx(),
      drawImage(/** @type {any[]} */ ...args) {
        calls.push(args);
      },
    });
    const sprites = { star: {}, starBaseSize: 96, starDrawScale: 96 / 54 };
    RenderManager.drawCollectibleStars(
      ctx,
      [{ x: 100, y: 100, width: 20, height: 20, speed: 50 }],
      sprites,
      0,
      800,
      600,
      1.23
    );
    expect(calls.length).toBe(1);
    expect(calls[0][7]).toBeCloseTo((20 * 96) / 54, 6);
    expect(calls[0][5]).toBeCloseTo(110 - (20 * 96) / 54 / 2, 6);
  });
});
