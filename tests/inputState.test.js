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
