// @ts-check
import { describe, it, expect, afterEach, vi } from "vitest";
import { ControlsHint } from "../js/ui/ControlsHint.js";
import { RenderManager } from "../js/managers/RenderManager.js";
import { setReducedMotion } from "../js/utils/motion.js";
import { CONFIG } from "../js/constants.js";

const FRAME = 1 / 60;
/** Frames the hint needs to fade fully in or out. */
const FADE_FRAMES = Math.ceil(CONFIG.HINT.FADE_S / FRAME) + 1;

function makeStorage(initial = /** @type {Record<string, any>} */ ({})) {
  const data = { ...initial };
  return /** @type {any} */ ({
    data,
    /** @param {string} k @param {any} fb */
    getJSON: (k, fb) => (k in data ? data[k] : (fb ?? null)),
    /** @param {string} k @param {any} v */
    setJSON: (k, v) => {
      data[k] = v;
      return true;
    },
  });
}

/** Recording 2D context: counts painted text and tracks the last alpha / fill colours used. */
function makeCtx() {
  const ctx = {
    texts: /** @type {string[]} */ ([]),
    fills: /** @type {string[]} */ ([]),
    fillStyle: "",
    strokeStyle: "",
    globalAlpha: 1,
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    font: "",
    textAlign: "",
    textBaseline: "",
    save() {},
    restore() {},
    translate() {},
    scale() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arcTo() {},
    arc() {},
    stroke() {},
    fill() {
      ctx.fills.push(String(ctx.fillStyle));
    },
    fillText(/** @type {string} */ text) {
      ctx.texts.push(text);
    },
  };
  return ctx;
}

/** Draw `frames` frames and return the context of the last one. */
function draw(/** @type {ControlsHint} */ hint, frames = 1, active = true, accent = "red") {
  let ctx = makeCtx();
  for (let i = 0; i < frames; i++) {
    ctx = makeCtx();
    hint.draw(/** @type {any} */ (ctx), 400, 700, FRAME, active, /** @type {any} */ (accent));
  }
  return ctx;
}

afterEach(() => setReducedMotion(null));

describe("ControlsHint", () => {
  it("shows the two-finger pictogram on touch until the fire control is used", () => {
    setReducedMotion(false);
    const storage = makeStorage();
    const hint = new ControlsHint({ storage });
    expect(hint.learned).toBe(false);
    expect(draw(hint).texts).toEqual([]);

    hint.begin({ touch: true });
    const shown = draw(hint, FADE_FRAMES);
    expect(hint.visible).toBe(true);
    // Finger 1 steers, finger 2 fires.
    expect(shown.texts).toEqual(["1", "2"]);

    hint.markLearned();
    expect(hint.learned).toBe(true);
    expect(storage.data[CONFIG.HINT.STORAGE_KEY]).toBe(true);
    // It fades out rather than vanishing, then stops painting.
    expect(draw(hint).texts).toEqual(["1", "2"]);
    expect(draw(hint, FADE_FRAMES).texts).toEqual([]);
    expect(hint.visible).toBe(false);
  });

  it("shows the keyboard and mouse pictogram on desktop, in the run's accent colour", () => {
    setReducedMotion(true);
    const hint = new ControlsHint({ storage: makeStorage() });
    hint.begin({ touch: false });
    const red = draw(hint, FADE_FRAMES);
    expect(red.texts).toEqual([]);
    expect(red.fills).toContain(CONFIG.COLORS.ACCENT.RED);
    expect(draw(hint, 1, true, "blue").fills).toContain(CONFIG.COLORS.ACCENT.BLUE);
    // A touch on a device taken for a desktop switches to the two-finger pictogram.
    hint.useTouch();
    expect(draw(hint).texts).toEqual(["1", "2"]);
  });

  it("never returns once learned, on this device", () => {
    const storage = makeStorage();
    const first = new ControlsHint({ storage });
    first.begin({ touch: true });
    first.markLearned();

    const later = new ControlsHint({ storage });
    expect(later.learned).toBe(true);
    later.begin({ touch: true });
    expect(draw(later, FADE_FRAMES).texts).toEqual([]);
    expect(later.visible).toBe(false);
  });

  it("comes back on the next mission while the control is still unused", () => {
    const hint = new ControlsHint({ storage: makeStorage() });
    hint.begin({ touch: true });
    draw(hint, FADE_FRAMES);
    // Mission over: it fades out with the playfield.
    expect(draw(hint, FADE_FRAMES, false).texts).toEqual([]);
    hint.begin({ touch: true });
    expect(draw(hint, FADE_FRAMES).texts).toEqual(["1", "2"]);
  });

  it("stays off for autopilot missions and records nothing from them", () => {
    const storage = makeStorage();
    const hint = new ControlsHint({ storage });
    hint.begin({ touch: true, enabled: false });
    expect(draw(hint, FADE_FRAMES).texts).toEqual([]);
    hint.markLearned();
    expect(hint.learned).toBe(false);
    expect(storage.data).toEqual({});
  });

  it("works without storage and with an unknown view size", () => {
    const hint = new ControlsHint({
      storage: /** @type {any} */ ({ getJSON: () => null, setJSON: () => false }),
    });
    hint.begin({ touch: true });
    const ctx = makeCtx();
    expect(() =>
      hint.draw(/** @type {any} */ (ctx), Infinity, Infinity, FRAME, true)
    ).not.toThrow();
    expect(ctx.texts).toEqual([]);
    hint.markLearned();
    expect(hint.learned).toBe(true);
  });
});

describe("RenderManager and the controls hint", () => {
  it("draws the hint last, telling it whether the mission is running", () => {
    const ctx = {
      globalAlpha: 1,
      globalCompositeOperation: "source-over",
      save() {},
      restore() {},
      translate() {},
      drawImage() {},
    };
    const hint = { draw: vi.fn() };
    const game = /** @type {any} */ ({
      ctx,
      view: { width: 400, height: 700, dpr: 1 },
      asteroids: [],
      bullets: [],
      stars: [],
      explosions: [],
      particles: [],
      sprites: null,
      timeSec: 0,
      _frameDtSec: 0.02,
      controlsHint: hint,
      state: { isRunning: () => true },
    });
    RenderManager.draw(game);
    expect(hint.draw.mock.calls[0].slice(1, 5)).toEqual([400, 700, 0.02, true]);
    game.state = { isRunning: () => false };
    RenderManager.draw(game);
    expect(hint.draw.mock.calls[1][4]).toBe(false);
  });
});
