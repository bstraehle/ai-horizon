// @ts-check
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EngineTrail } from "../js/entities/EngineTrail.js";
import { Explosion } from "../js/entities/Explosion.js";
import { ScorePopup } from "../js/entities/ScorePopup.js";
import { CONFIG } from "../js/constants.js";

function makeCtx() {
  const ctx = {
    calls: { drawImage: 0, fillText: 0, strokeText: 0, save: 0, measureText: 0 },
    globalAlpha: 1,
    font: "",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    shadowColor: "",
    shadowBlur: 0,
    textAlign: "",
    textBaseline: "",
    drawImage() {
      ctx.calls.drawImage++;
    },
    fillText() {
      ctx.calls.fillText++;
    },
    strokeText() {
      ctx.calls.strokeText++;
    },
    measureText(/** @type {string} */ text) {
      ctx.calls.measureText++;
      return { width: text.length * 10 };
    },
    save() {
      ctx.calls.save++;
    },
    restore() {},
    scale() {},
    clearRect() {},
    beginPath() {},
    arc() {},
    ellipse() {},
    fill() {},
    createRadialGradient: () => ({ addColorStop() {} }),
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

const rng = {
  nextFloat: () => 0.5,
  range: (/** @type {number} */ a, /** @type {number} */ b) => (a + b) / 2,
};

describe("EngineTrail pooling and sprite tables", () => {
  it("recycles expired particle records instead of allocating new ones", () => {
    const trail = new EngineTrail();
    const player = { x: 100, y: 100, width: 20, height: 20 };
    trail.add(player, rng);
    const first = trail.particles[0];
    trail.update(CONFIG.ENGINE_TRAIL.LIFE + 0.01);
    expect(trail.particles.length).toBe(0);
    trail.add(player, rng);
    expect(trail.particles[0]).toBe(first);
    expect(first.life).toBe(CONFIG.ENGINE_TRAIL.LIFE);
  });

  it("compacts in order and keeps live particles", () => {
    const trail = new EngineTrail();
    const player = { x: 100, y: 100, width: 20, height: 20 };
    trail.add(player, rng);
    trail.update(CONFIG.ENGINE_TRAIL.LIFE * 0.9);
    trail.add(player, rng);
    trail.add(player, rng);
    const [old, a, b] = trail.particles;
    trail.update(CONFIG.ENGINE_TRAIL.LIFE * 0.2); // expires only the oldest
    expect(trail.particles).toEqual([a, b]);
    expect(old.life).toBeLessThanOrEqual(0);
  });

  it("shares one alpha-indexed sprite table per quantized size", () => {
    const trail = new EngineTrail();
    const player = { x: 100, y: 100, width: 20, height: 20 };
    trail.add(player, rng);
    trail.add(player, rng);
    const [a, b] = trail.particles;
    expect(a._sprites).toBe(b._sprites);
    expect(a._sprites && a._sprites.length).toBe(EngineTrail._ALPHA_STEPS + 1);
  });
});

describe("Explosion sprite tables", () => {
  it("resolves a shared per-size table at construction and reset", () => {
    const e1 = new Explosion(0, 0, 50, 50, 0.25, 0.25);
    const e2 = new Explosion(0, 0, 50, 50, 0.25, 0.25);
    expect(e1._sprites).toBe(e2._sprites);
    e2.reset(0, 0, 40, 40, 0.25, 0.25);
    expect(e2._sprites).not.toBe(e1._sprites);
    expect(e2._sprites.length).toBe(Explosion._SPRITE_STEPS + 1);
  });

  it("draw falls back to gradients when no sprite can be created and keeps working", () => {
    const e = new Explosion(0, 0, 50, 50, 0.25, 0.25);
    const ctx = makeCtx();
    expect(() => e.draw(/** @type {any} */ (ctx))).not.toThrow();
    expect(ctx.calls.drawImage).toBe(0);
  });
});

describe("ScorePopup.drawAll", () => {
  beforeEach(() => {
    MockOffscreenCanvas.created = 0;
    ScorePopup._spriteCache = undefined;
    ScorePopup._measureCtx = undefined;
    vi.stubGlobal("OffscreenCanvas", MockOffscreenCanvas);
  });
  afterEach(() => vi.unstubAllGlobals());

  function popup(text = "+100", life = 0) {
    return {
      text,
      x: 100,
      y: 100,
      life,
      maxLife: 1,
      color: "#fff",
      fontSize: 20,
      fontWeight: "700",
      glow: true,
      glowColor: "#fff",
      glowBlur: 12,
      stroke: "rgba(0,0,0,0.85)",
    };
  }

  it("rasterizes each style once and blits a sprite per frame (no per-frame text drawing)", () => {
    const ctx = makeCtx();
    const popups = [popup("+100"), popup("+100"), popup("+50")];
    ScorePopup.drawAll(/** @type {any} */ (ctx), popups, 0.016, 800, 600, 2);
    ScorePopup.drawAll(/** @type {any} */ (ctx), popups, 0.016, 800, 600, 2);
    // Two distinct texts → two sprite canvases (+1 shared measuring canvas).
    expect(MockOffscreenCanvas.created).toBe(3);
    expect(ctx.calls.fillText).toBe(0);
    expect(ctx.calls.save).toBe(0);
    expect(ctx.calls.drawImage).toBe(6);
    expect(ctx.globalAlpha).toBe(1);
  });

  it("advances life with the frame delta, fades, and removes expired popups in order", () => {
    const ctx = makeCtx();
    const a = popup("+10", 0.95);
    const b = popup("+20", 0.5);
    const c = popup("+30", 0.99);
    const popups = [a, b, c];
    ScorePopup.drawAll(/** @type {any} */ (ctx), popups, 0.1, 800, 600, 1);
    expect(popups).toEqual([b]);
    expect(b.life).toBeCloseTo(0.6, 6);
  });

  it("skips drawing popups that are off-screen but keeps them alive", () => {
    const ctx = makeCtx();
    const off = popup("+10");
    off.x = -500;
    const popups = [off];
    ScorePopup.drawAll(/** @type {any} */ (ctx), popups, 0.016, 800, 600, 1);
    expect(popups.length).toBe(1);
    expect(ctx.calls.drawImage).toBe(0);
  });

  it("draws text directly when offscreen canvases are unavailable", () => {
    vi.unstubAllGlobals();
    const ctx = makeCtx();
    const popups = [popup("+10")];
    ScorePopup.drawAll(/** @type {any} */ (ctx), popups, 0.016, 800, 600, 1);
    expect(ctx.calls.fillText).toBe(1);
    expect(ctx.calls.strokeText).toBe(1);
    expect(ctx.calls.drawImage).toBe(0);
  });
});
