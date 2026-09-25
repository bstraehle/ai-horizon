// @ts-check
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { BackgroundLayer } from "../js/entities/BackgroundLayer.js";
import { BackgroundManager } from "../js/managers/BackgroundManager.js";
import { Nebula } from "../js/entities/Nebula.js";

function makeCtx() {
  const ctx = {
    calls: { drawImage: 0, fillRect: 0, setTransform: 0 },
    globalCompositeOperation: "source-over",
    fillStyle: "",
    imageSmoothingEnabled: true,
    getTransform() {
      return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    },
    setTransform() {
      ctx.calls.setTransform++;
    },
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    fillRect() {
      ctx.calls.fillRect++;
    },
    drawImage() {
      ctx.calls.drawImage++;
    },
    clearRect() {},
    translate() {},
    save() {},
    restore() {},
    beginPath() {},
    arc() {},
    fill() {},
  };
  return ctx;
}

class MockOffscreenCanvas {
  /** @param {number} w @param {number} h */
  constructor(w, h) {
    this.width = w;
    this.height = h;
    this.ctx = makeCtx();
  }
  getContext() {
    return this.ctx;
  }
}

function makeConfigs() {
  return [
    {
      x: 100,
      y: 100,
      r: 50,
      color0: "rgba(255,0,0,0.2)",
      color1: "rgba(255,0,0,0)",
      dx: 0,
      dy: 0,
      dr: 0,
      t: 0,
      blobs: [
        {
          baseOx: 0,
          baseOy: 0,
          ox: 0,
          oy: 0,
          r: 50,
          rot: 0.3,
          sx: 1.2,
          sy: 0.8,
          wobbleAmp: 0,
          wobbleRate: 0,
          wobbleOffset: 0,
        },
      ],
    },
  ];
}

describe("BackgroundLayer", () => {
  beforeEach(() => vi.stubGlobal("OffscreenCanvas", MockOffscreenCanvas));
  afterEach(() => vi.unstubAllGlobals());

  it("renders at a reduced resolution and composites with one drawImage per frame", () => {
    const layer = new BackgroundLayer({ scale: 0.5, refreshFrames: 3 });
    const main = makeCtx();
    const configs = makeConfigs();
    expect(layer.draw(/** @type {any} */ (main), 800, 600, configs, true)).toBe(true);
    const canvas = /** @type {any} */ (layer)._canvas;
    expect(canvas.width).toBe(400);
    expect(canvas.height).toBe(300);
    expect(layer.renders).toBe(1);
    expect(main.calls.drawImage).toBe(1);
    // Gradient + vignette + nebula were drawn into the layer, not the main context.
    expect(main.calls.fillRect).toBe(0);
    expect(canvas.ctx.calls.fillRect).toBe(2);
  });

  it("re-renders only on the configured cadence while compositing every frame", () => {
    const layer = new BackgroundLayer({ scale: 0.5, refreshFrames: 3 });
    const main = makeCtx();
    const configs = makeConfigs();
    for (let i = 0; i < 9; i++) layer.draw(/** @type {any} */ (main), 800, 600, configs, true);
    expect(main.calls.drawImage).toBe(9);
    expect(layer.renders).toBe(3);
  });

  it("re-renders immediately when the nebula configs or visibility change", () => {
    const layer = new BackgroundLayer({ scale: 0.5, refreshFrames: 100 });
    const main = makeCtx();
    const configs = makeConfigs();
    layer.draw(/** @type {any} */ (main), 800, 600, configs, true);
    layer.draw(/** @type {any} */ (main), 800, 600, configs, true);
    expect(layer.renders).toBe(1);
    layer.draw(/** @type {any} */ (main), 800, 600, makeConfigs(), true); // new palette / game
    expect(layer.renders).toBe(2);
    layer.draw(/** @type {any} */ (main), 800, 600, configs, false); // menu: nebula hidden
    expect(layer.renders).toBe(3);
    layer.draw(/** @type {any} */ (main), 800, 600, configs, false);
    expect(layer.renders).toBe(3);
  });

  it("resizes the offscreen canvas and re-renders when the viewport changes", () => {
    const layer = new BackgroundLayer({ scale: 0.5, refreshFrames: 100 });
    const main = makeCtx();
    const configs = makeConfigs();
    layer.draw(/** @type {any} */ (main), 800, 600, configs, true);
    layer.draw(/** @type {any} */ (main), 1000, 500, configs, true);
    const canvas = /** @type {any} */ (layer)._canvas;
    expect(canvas.width).toBe(500);
    expect(canvas.height).toBe(250);
    expect(layer.renders).toBe(1); // counter resets with the new surface, then renders once
  });

  it("does not consume any RNG and never mutates the configs", () => {
    const layer = new BackgroundLayer({ scale: 0.5, refreshFrames: 1 });
    const configs = makeConfigs();
    const snapshot = JSON.stringify(configs);
    for (let i = 0; i < 5; i++) layer.draw(/** @type {any} */ (makeCtx()), 800, 600, configs, true);
    // Sprite cache fields are render-only annotations; strip them before comparing.
    const stripped = JSON.stringify(configs, (k, v) => (k.startsWith("_") ? undefined : v));
    expect(stripped).toBe(snapshot);
  });
});

describe("BackgroundLayer without offscreen canvas support", () => {
  it("reports unavailability so callers draw directly", () => {
    const layer = new BackgroundLayer();
    expect(layer.draw(/** @type {any} */ (makeCtx()), 800, 600, makeConfigs(), true)).toBe(false);
  });

  it("BackgroundManager.draw falls back to direct gradient + nebula drawing", () => {
    const ctx = makeCtx();
    const spy = vi.spyOn(Nebula, "draw");
    BackgroundManager.draw(
      /** @type {any} */ ({
        ctx,
        view: { width: 800, height: 600 },
        running: true,
        paused: false,
        gameOver: false,
        animTime: 0,
        background: { nebulaConfigs: makeConfigs(), starField: {} },
      })
    );
    expect(ctx.calls.fillRect).toBe(2); // gradient + vignette
    expect(spy).toHaveBeenCalledWith(ctx, expect.any(Array));
    spy.mockRestore();
  });
});

describe("Nebula.draw transform composition", () => {
  it("uses setTransform per blob and restores the base transform without save/restore", () => {
    const ctx = makeCtx();
    const saves = vi.spyOn(ctx, "save");
    const configs = makeConfigs();
    Nebula.draw(/** @type {any} */ (ctx), configs);
    expect(saves).not.toHaveBeenCalled();
    // One setTransform per blob + one to restore the base.
    expect(ctx.calls.setTransform).toBe(configs[0].blobs.length + 1);
    expect(ctx.globalCompositeOperation).toBe("source-over");
  });

  it("falls back to save/restore on contexts without getTransform", () => {
    const ctx = /** @type {any} */ (makeCtx());
    delete ctx.getTransform;
    ctx.translate = vi.fn();
    ctx.rotate = vi.fn();
    ctx.scale = vi.fn();
    const saves = vi.spyOn(ctx, "save");
    Nebula.draw(ctx, makeConfigs());
    expect(saves).toHaveBeenCalled();
    expect(ctx.translate).toHaveBeenCalled();
  });
});
