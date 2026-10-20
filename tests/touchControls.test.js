// @ts-check
import { describe, it, expect, beforeEach } from "vitest";
import { InputState } from "../js/core/InputState.js";
import { TouchControls } from "../js/core/TouchControls.js";

const OPTS = { DRAG_GAIN: 2, TAP_MAX_MS: 250, TAP_SLOP_PX: 10 };
const ship = { x: 100, y: 300, width: 40, height: 40 };
const view = { width: 800, height: 400 };
/** @param {number} identifier @param {number} clientX @param {number} clientY */
const pt = (identifier, clientX, clientY) => ({ identifier, clientX, clientY });

describe("TouchControls", () => {
  /** @type {InputState} */
  let input;
  /** @type {TouchControls} */
  let touch;

  beforeEach(() => {
    input = new InputState();
    input.mouse.x = 700;
    input.mouse.y = 50;
    touch = new TouchControls(() => input, OPTS);
  });

  it("writes into the current InputState after a run reset replaces it", () => {
    const stale = input;
    touch.start([pt(1, 600, 200)], ship, 0);
    input = new InputState();
    touch.reset();
    touch.start([pt(2, 600, 200)], ship, 100);
    touch.move([pt(2, 610, 200)], ship, view);
    expect(touch.start([pt(3, 100, 100)], ship, 110)).toBe(true);
    expect(input.mouse).toEqual({ x: 140, y: 320 });
    expect(input.fireHeld).toBe(true);
    expect(stale.fireHeld).toBe(false);
  });

  it("starts steering at the ship's centre without firing", () => {
    expect(touch.start([pt(1, 600, 200)], ship, 0)).toBe(false);
    expect(input.mouse).toEqual({ x: 120, y: 320 });
    expect(input.fireHeld).toBe(false);
  });

  it("drags the target by finger travel times the gain, clamped to the ship's reach", () => {
    touch.start([pt(1, 600, 200)], ship, 0);
    touch.move([pt(1, 630, 190)], ship, view);
    expect(input.mouse).toEqual({ x: 180, y: 300 });
    touch.move([pt(1, 330, 400)], ship, view);
    expect(input.mouse).toEqual({ x: 20, y: 380 });
    // Reversing at the edge moves back immediately (no hidden overshoot to unwind).
    touch.move([pt(1, 335, 400)], ship, view);
    expect(input.mouse.x).toBe(30);
    expect(input.fireHeld).toBe(false);
  });

  it("ignores moves of other fingers", () => {
    touch.start([pt(1, 600, 200)], ship, 0);
    touch.start([pt(2, 100, 100)], ship, 10);
    touch.move([pt(2, 300, 300)], ship, view);
    expect(input.mouse).toEqual({ x: 120, y: 320 });
  });

  it("holds fire while any second finger is down", () => {
    touch.start([pt(1, 600, 200)], ship, 0);
    expect(touch.start([pt(2, 100, 100), pt(3, 150, 100)], ship, 10)).toBe(true);
    expect(input.fireHeld).toBe(true);
    touch.end([pt(2, 100, 100)], 500);
    expect(input.fireHeld).toBe(true);
    touch.end([pt(3, 150, 100)], 600);
    expect(input.fireHeld).toBe(false);
  });

  it("reports a quick, still steering touch as a tap", () => {
    touch.start([pt(1, 600, 200)], ship, 0);
    touch.move([pt(1, 605, 203)], ship, view);
    expect(touch.end([pt(1, 605, 203)], 200)).toBe(true);
  });

  it("does not report drags, long presses, cancels or fire fingers as taps", () => {
    touch.start([pt(1, 600, 200)], ship, 0);
    touch.move([pt(1, 620, 200)], ship, view);
    touch.move([pt(1, 600, 200)], ship, view);
    expect(touch.end([pt(1, 600, 200)], 100)).toBe(false);

    touch.start([pt(2, 600, 200)], ship, 1000);
    expect(touch.end([pt(2, 600, 200)], 1300)).toBe(false);

    touch.start([pt(3, 600, 200)], ship, 2000);
    expect(touch.end([pt(3, 600, 200)], 2050, true)).toBe(false);

    touch.start([pt(4, 600, 200)], ship, 3000);
    touch.start([pt(5, 100, 100)], ship, 3010);
    expect(touch.end([pt(5, 100, 100)], 3050)).toBe(false);
  });

  it("hands steering to the next new finger once the steering finger lifts", () => {
    touch.start([pt(1, 600, 200)], ship, 0);
    touch.start([pt(2, 100, 100)], ship, 10);
    touch.end([pt(1, 600, 200)], 500);
    expect(input.fireHeld).toBe(true);
    expect(touch.start([pt(3, 400, 200)], ship, 600)).toBe(false);
    touch.move([pt(3, 410, 200)], ship, view);
    expect(input.mouse.x).toBe(140);
  });

  it("drops fingers whose touchend was lost when a new touch starts", () => {
    touch.start([pt(1, 600, 200)], ship, 0);
    touch.start([pt(2, 100, 100)], ship, 10);
    expect(touch.start([pt(7, 300, 200)], ship, 5000, [pt(7, 300, 200)])).toBe(false);
    expect(input.fireHeld).toBe(false);
    expect(touch.steer?.id).toBe(7);
  });

  it("reset forgets fingers and releases fire", () => {
    touch.start([pt(1, 600, 200)], ship, 0);
    touch.start([pt(2, 100, 100)], ship, 10);
    touch.reset();
    expect(input.fireHeld).toBe(false);
    touch.move([pt(1, 700, 200)], ship, view);
    expect(input.mouse).toEqual({ x: 120, y: 320 });
  });
});
