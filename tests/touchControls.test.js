// @ts-check
import { describe, it, expect, beforeEach } from "vitest";
import { InputState } from "../js/core/InputState.js";
import { TouchControls } from "../js/core/TouchControls.js";

const OPTS = { TAP_MAX_MS: 250, TAP_SLOP_PX: 10 };
/** Canvas offset 10/20 px from the viewport; 40 px ship; 800x400 playfield. */
const frame = {
  rect: { left: 10, top: 20 },
  ship: { width: 40, height: 40 },
  view: { width: 800, height: 400 },
};
/** @param {number} identifier @param {number} clientX @param {number} clientY */
const pt = (identifier, clientX, clientY) => ({ identifier, clientX, clientY });

describe("TouchControls", () => {
  /** @type {InputState} */
  let input;
  /** @type {TouchControls} */
  let touch;

  beforeEach(() => {
    input = new InputState();
    touch = new TouchControls(() => input, OPTS);
  });

  it("writes into the current InputState after a run reset replaces it", () => {
    const stale = input;
    touch.start([pt(1, 600, 200)], frame, 0);
    input = new InputState();
    touch.reset();
    touch.start([pt(2, 300, 200)], frame, 100);
    expect(touch.start([pt(3, 100, 100)], frame, 110)).toBe(true);
    expect(input.mouse).toEqual({ x: 290, y: 180 });
    expect(input.fireHeld).toBe(true);
    expect(stale.fireHeld).toBe(false);
  });

  it("aims the ship at the steering finger (canvas coords) without firing", () => {
    expect(touch.start([pt(1, 610, 220)], frame, 0)).toBe(false);
    expect(input.mouse).toEqual({ x: 600, y: 200 });
    touch.move([pt(1, 310, 120)], frame);
    expect(input.mouse).toEqual({ x: 300, y: 100 });
    expect(input.fireHeld).toBe(false);
  });

  it("clamps the target to the ship's reach when the finger leaves the canvas", () => {
    touch.start([pt(1, 400, 200)], frame, 0);
    touch.move([pt(1, -50, 900)], frame);
    expect(input.mouse).toEqual({ x: 20, y: 380 });
  });

  it("ignores moves of other fingers", () => {
    touch.start([pt(1, 610, 220)], frame, 0);
    touch.start([pt(2, 100, 100)], frame, 10);
    touch.move([pt(2, 300, 300)], frame);
    expect(input.mouse).toEqual({ x: 600, y: 200 });
  });

  it("holds fire while any second finger is down", () => {
    touch.start([pt(1, 600, 200)], frame, 0);
    expect(touch.start([pt(2, 100, 100), pt(3, 150, 100)], frame, 10)).toBe(true);
    expect(input.fireHeld).toBe(true);
    touch.end([pt(2, 100, 100)], 500);
    expect(input.fireHeld).toBe(true);
    touch.end([pt(3, 150, 100)], 600);
    expect(input.fireHeld).toBe(false);
  });

  it("reports a quick, still steering touch as a tap", () => {
    touch.start([pt(1, 600, 200)], frame, 0);
    touch.move([pt(1, 605, 203)], frame);
    expect(touch.end([pt(1, 605, 203)], 200)).toBe(true);
  });

  it("does not report drags, long presses, cancels or fire fingers as taps", () => {
    touch.start([pt(1, 600, 200)], frame, 0);
    touch.move([pt(1, 620, 200)], frame);
    touch.move([pt(1, 600, 200)], frame);
    expect(touch.end([pt(1, 600, 200)], 100)).toBe(false);

    touch.start([pt(2, 600, 200)], frame, 1000);
    expect(touch.end([pt(2, 600, 200)], 1300)).toBe(false);

    touch.start([pt(3, 600, 200)], frame, 2000);
    expect(touch.end([pt(3, 600, 200)], 2050, true)).toBe(false);

    touch.start([pt(4, 600, 200)], frame, 3000);
    touch.start([pt(5, 100, 100)], frame, 3010);
    expect(touch.end([pt(5, 100, 100)], 3050)).toBe(false);
  });

  it("hands steering to the next new finger once the steering finger lifts", () => {
    touch.start([pt(1, 600, 200)], frame, 0);
    touch.start([pt(2, 100, 100)], frame, 10);
    touch.end([pt(1, 600, 200)], 500);
    expect(input.fireHeld).toBe(true);
    expect(touch.start([pt(3, 410, 220)], frame, 600)).toBe(false);
    expect(input.mouse).toEqual({ x: 400, y: 200 });
  });

  it("drops fingers whose touchend was lost when a new touch starts", () => {
    touch.start([pt(1, 600, 200)], frame, 0);
    touch.start([pt(2, 100, 100)], frame, 10);
    expect(touch.start([pt(7, 300, 200)], frame, 5000, [pt(7, 300, 200)])).toBe(false);
    expect(input.fireHeld).toBe(false);
    expect(touch.steer?.id).toBe(7);
  });

  it("reset forgets fingers and releases fire", () => {
    touch.start([pt(1, 610, 220)], frame, 0);
    touch.start([pt(2, 100, 100)], frame, 10);
    touch.reset();
    expect(input.fireHeld).toBe(false);
    touch.move([pt(1, 700, 200)], frame);
    expect(input.mouse).toEqual({ x: 600, y: 200 });
  });
});
