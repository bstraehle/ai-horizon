// @ts-check
import { describe, it, expect } from "vitest";
import { InputState } from "../js/core/InputState.js";

describe("InputState", () => {
  it("initializes with empty keys and zero mouse position", () => {
    const input = new InputState();
    expect(input.keys).toEqual({});
    expect(input.mouse).toEqual({ x: 0, y: 0 });
    expect(input.fireHeld).toBe(false);
  });

  it("setKey sets key state to true", () => {
    const input = new InputState();
    input.setKey("KeyA", true);
    expect(input.keys["KeyA"]).toBe(true);
  });

  it("setKey sets key state to false", () => {
    const input = new InputState();
    input.setKey("KeyA", true);
    input.setKey("KeyA", false);
    expect(input.keys["KeyA"]).toBe(false);
  });

  it("setKey coerces truthy/falsy values to boolean", () => {
    const input = new InputState();
    input.setKey("KeyA", 1);
    expect(input.keys["KeyA"]).toBe(true);
    input.setKey("KeyB", 0);
    expect(input.keys["KeyB"]).toBe(false);
    input.setKey("KeyC", "truthy");
    expect(input.keys["KeyC"]).toBe(true);
    input.setKey("KeyD", "");
    expect(input.keys["KeyD"]).toBe(false);
  });

  it("clearMouse resets mouse position to origin", () => {
    const input = new InputState();
    input.mouse.x = 100;
    input.mouse.y = 200;
    input.clearMouse();
    expect(input.mouse).toEqual({ x: 0, y: 0 });
  });

  it("aimAt converts client coords to canvas coords", () => {
    const input = new InputState();
    const frame = {
      rect: { left: 10, top: 20 },
      ship: { width: 40, height: 40 },
      view: { width: 800, height: 400 },
    };
    input.aimAt(310, 220, frame);
    expect(input.mouse).toEqual({ x: 300, y: 200 });
  });

  it("aimAt clamps edge and off-canvas pointers to the ship's reach (never 0)", () => {
    const input = new InputState();
    const frame = {
      rect: { left: 0, top: 0 },
      ship: { width: 40, height: 40 },
      view: { width: 800, height: 400 },
    };
    input.aimAt(0, 0, frame);
    expect(input.mouse).toEqual({ x: 20, y: 20 });
    input.aimAt(-50, 900, frame);
    expect(input.mouse).toEqual({ x: 20, y: 380 });
    input.aimAt(799, 399, frame);
    expect(input.mouse).toEqual({ x: 780, y: 380 });
  });

  it("aimAt with an edge margin reaches each edge while the pointer is still inside", () => {
    const input = new InputState();
    const frame = {
      rect: { left: 0, top: 0 },
      ship: { width: 40, height: 40 },
      view: { width: 800, height: 400 },
    };
    input.aimAt(60, 340, frame, 60);
    expect(input.mouse).toEqual({ x: 20, y: 380 });
    input.aimAt(740, 60, frame, 60);
    expect(input.mouse).toEqual({ x: 780, y: 20 });
    input.aimAt(400, 200, frame, 60);
    expect(input.mouse).toEqual({ x: 400, y: 200 });
    input.aimAt(-100, 1000, frame, 60);
    expect(input.mouse).toEqual({ x: 20, y: 380 });
  });

  it("nudge moves the target by relative motion and slides along a clamped edge", () => {
    const input = new InputState();
    const frame = {
      ship: { x: 380, y: 300, width: 40, height: 40 },
      view: { width: 800, height: 400 },
    };
    input.nudge(10, -20, frame);
    expect(input.mouse).toEqual({ x: 410, y: 300 });
    input.nudge(0, 500, frame);
    expect(input.mouse).toEqual({ x: 410, y: 380 });
    input.nudge(-100, 50, frame);
    expect(input.mouse).toEqual({ x: 310, y: 380 });
    input.nudge(-1000, 0, frame);
    expect(input.mouse).toEqual({ x: 20, y: 380 });
  });

  it("fireHeld can be set directly", () => {
    const input = new InputState();
    input.fireHeld = true;
    expect(input.fireHeld).toBe(true);
    input.fireHeld = false;
    expect(input.fireHeld).toBe(false);
  });

  it("mouse position can be set directly", () => {
    const input = new InputState();
    input.mouse.x = 150;
    input.mouse.y = 250;
    expect(input.mouse.x).toBe(150);
    expect(input.mouse.y).toBe(250);
  });

  it("multiple keys can be tracked independently", () => {
    const input = new InputState();
    input.setKey("KeyA", true);
    input.setKey("KeyW", true);
    input.setKey("Space", true);
    expect(input.keys["KeyA"]).toBe(true);
    expect(input.keys["KeyW"]).toBe(true);
    expect(input.keys["Space"]).toBe(true);
    input.setKey("KeyA", false);
    expect(input.keys["KeyA"]).toBe(false);
    expect(input.keys["KeyW"]).toBe(true);
  });
});
