import { describe, it, expect, beforeEach, vi } from "vitest";
import { BackgroundManager } from "../js/managers/BackgroundManager.js";
import { Nebula } from "../js/entities/Nebula.js";

// Minimal mock canvas context
function createCtx() {
  return {
    canvas: { width: 800, height: 600 },
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fillRect: vi.fn(),
    fillStyle: "",
    globalCompositeOperation: "source-over",
  };
}

describe("Nebula visibility across states", () => {
  let nebulaConfigs;
  beforeEach(() => {
    nebulaConfigs = [
      {
        x: 100,
        y: 100,
        r: 50,
        color0: "rgba(255,255,255,0.1)",
        color1: "rgba(255,255,255,0)",
        blobs: [
          {
            ox: 0,
            oy: 0,
            r: 50,
            rot: 0,
            sx: 1,
            sy: 1,
            baseOx: 0,
            baseOy: 0,
            wobbleAmp: 0,
            wobbleRate: 0,
            wobbleOffset: 0,
          },
        ],
      },
    ];
  });

  function runDraw({ running, paused, gameOver }) {
    const ctx = createCtx();
    const drawSpy = vi.spyOn(Nebula, "draw");
    BackgroundManager.draw({
      ctx,
      view: { width: 800, height: 600 },
      running,
      paused,
      gameOver,
      animTime: 0,
      background: { nebulaConfigs, starField: {} },
    });
    return drawSpy;
  }

  it("draws nebula while running", () => {
    const spy = runDraw({ running: true, paused: false, gameOver: false });
    expect(spy).toHaveBeenCalled();
  });

  it("draws nebula while paused", () => {
    const spy = runDraw({ running: false, paused: true, gameOver: false });
    expect(spy).toHaveBeenCalled();
  });

  it("draws nebula on game over", () => {
    const spy = runDraw({ running: false, paused: false, gameOver: true });
    expect(spy).toHaveBeenCalled();
  });

  it("does not draw nebula on menu (all false)", () => {
    const spy = runDraw({ running: false, paused: false, gameOver: false });
    expect(spy).not.toHaveBeenCalled();
  });
});
