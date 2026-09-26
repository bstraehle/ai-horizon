// @ts-check
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Asteroid } from "../js/entities/Asteroid.js";
import { CONFIG } from "../js/constants.js";

/** Minimal 2D context recorder: counts gradient/body renders and drawImage blits. */
function makeCtx() {
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    calls: { bodyGradients: 0, drawImage: 0, arcs: 0, clearRect: 0 },
    createRadialGradient() {
      ctx.calls.bodyGradients++;
      return { addColorStop() {} };
    },
    clearRect() {
      ctx.calls.clearRect++;
    },
    save() {},
    restore() {},
    beginPath() {},
    arc() {
      ctx.calls.arcs++;
    },
    fill() {},
    stroke() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    closePath() {},
    clip() {},
    translate() {},
    rotate() {},
    scale() {},
    fillRect() {},
    createLinearGradient() {
      return { addColorStop() {} };
    },
    drawImage() {
      ctx.calls.drawImage++;
    },
  };
  return ctx;
}

class MockOffscreenCanvas {
  /** @param {number} w @param {number} h */
  constructor(w, h) {
    this.width = w;
    this.height = h;
    this.ctx = makeCtx();
    MockOffscreenCanvas.created++;
  }
  getContext() {
    return this.ctx;
  }
}
MockOffscreenCanvas.created = 0;

function makeRng() {
  let i = 0;
  return {
    calls: 0,
    nextFloat() {
      this.calls++;
      i = (i + 0.37) % 1;
      return i;
    },
  };
}

describe("Asteroid baked surface", () => {
  beforeEach(() => {
    MockOffscreenCanvas.created = 0;
    vi.stubGlobal("OffscreenCanvas", MockOffscreenCanvas);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("bakes once on first draw and blits the cached surface on subsequent draws", () => {
    const a = new Asteroid(10, 10, 40, 40, 100, makeRng(), false);
    const main = makeCtx();
    a.draw(/** @type {any} */ (main));
    a.draw(/** @type {any} */ (main));
    a.draw(/** @type {any} */ (main));
    expect(MockOffscreenCanvas.created).toBe(1);
    const off = /** @type {any} */ (a._surfaceSprite).ctx;
    expect(off.calls.clearRect).toBe(1);
    expect(main.calls.drawImage).toBe(3);
    expect(main.calls.bodyGradients).toBe(0);
  });

  it("re-bakes after a bullet hit (cracks are part of the surface, not drawn per frame)", () => {
    const a = new Asteroid(10, 10, 60, 60, 100, makeRng(), true);
    const main = makeCtx();
    a.draw(/** @type {any} */ (main));
    const off = /** @type {any} */ (a._surfaceSprite).ctx;
    expect(off.calls.clearRect).toBe(1);
    a.onBulletHit(null);
    a.draw(/** @type {any} */ (main));
    a.draw(/** @type {any} */ (main));
    expect(off.calls.clearRect).toBe(2);
    expect(MockOffscreenCanvas.created).toBe(1);
    // Damage lines are stroked on the offscreen surface only.
    expect(main.calls.arcs).toBe(0);
  });

  it("animates crater reveal live without re-baking, then bakes once when settled", () => {
    const a = new Asteroid(10, 10, 60, 60, 100, makeRng(), true);
    const main = makeCtx();
    a.draw(/** @type {any} */ (main));
    const off = /** @type {any} */ (a._surfaceSprite).ctx;
    // Reach 25% severity so the first reserve crater is activated with grow = 0.
    const maxHits = CONFIG.ASTEROID.HARDENED_HITS || 10;
    const hitsForFirstExtra = Math.ceil(maxHits / (CONFIG.ASTEROID.CRATER_EMBOSS.EXTRA_MAX || 4));
    for (let i = 0; i < hitsForFirstExtra; i++) a.onBulletHit(null);
    expect(a._growing).toBe(1);
    a.draw(/** @type {any} */ (main));
    const bakesAfterHit = off.calls.clearRect;
    const arcsBefore = main.calls.arcs;
    // Several frames of reveal: overlay arcs drawn on the main ctx, surface untouched.
    const step = CONFIG.ASTEROID.CRATER_EMBOSS.REVEAL_TIME / 4;
    a.update(step);
    a.draw(/** @type {any} */ (main));
    a.update(step);
    a.draw(/** @type {any} */ (main));
    expect(main.calls.arcs).toBeGreaterThan(arcsBefore);
    expect(off.calls.clearRect).toBe(bakesAfterHit);
    // Finish the reveal: exactly one more bake, no more overlay work.
    a.update(CONFIG.ASTEROID.CRATER_EMBOSS.REVEAL_TIME);
    expect(a._growing).toBe(0);
    const arcsSettled = main.calls.arcs;
    a.draw(/** @type {any} */ (main));
    a.draw(/** @type {any} */ (main));
    expect(off.calls.clearRect).toBe(bakesAfterHit + 1);
    expect(main.calls.arcs).toBe(arcsSettled);
  });

  it("retains its offscreen canvas across pool resets and only grows when needed", () => {
    const rng = makeRng();
    const a = new Asteroid(0, 0, 60, 60, 100, rng, false);
    const main = makeCtx();
    a.draw(/** @type {any} */ (main));
    const firstCanvas = /** @type {any} */ (a._surfaceSprite).canvas;
    a.reset(0, 0, 30, 30, 100, rng, false);
    expect(a._surfaceDirty).toBe(true);
    a.draw(/** @type {any} */ (main));
    expect(/** @type {any} */ (a._surfaceSprite).canvas).toBe(firstCanvas);
    expect(/** @type {any} */ (a._surfaceSprite).width).toBe(30 + Asteroid.SURFACE_PAD * 2);
    a.reset(0, 0, 100, 100, 100, rng, true);
    a.draw(/** @type {any} */ (main));
    expect(/** @type {any} */ (a._surfaceSprite).canvas).not.toBe(firstCanvas);
    expect(/** @type {any} */ (a._surfaceSprite).canvas.width).toBe(100 + Asteroid.SURFACE_PAD * 2);
    expect(MockOffscreenCanvas.created).toBe(2);
  });

  it("never consumes the RNG while drawing", () => {
    const rng = makeRng();
    const a = new Asteroid(10, 10, 60, 60, 100, rng, true);
    for (let i = 0; i < 9; i++) a.onBulletHit(null);
    const before = rng.calls;
    const main = makeCtx();
    for (let i = 0; i < 5; i++) {
      a.update(0.016);
      a.draw(/** @type {any} */ (main));
    }
    expect(rng.calls).toBe(before);
  });
});

describe("Asteroid fallback drawing (no offscreen canvas)", () => {
  it("draws directly when no canvas can be created", () => {
    const a = new Asteroid(10, 10, 40, 40, 100, makeRng(), true);
    a.onBulletHit(null);
    const main = makeCtx();
    a.draw(/** @type {any} */ (main));
    expect(a._surfaceSprite).toBeNull();
    expect(main.calls.drawImage).toBe(0);
    // Flat style: the body is drawn with arcs (planet disc, craters), no gradients.
    expect(main.calls.arcs).toBeGreaterThan(0);
    expect(main.calls.bodyGradients).toBe(0);
  });
});
