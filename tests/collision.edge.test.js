// @ts-check
import { describe, it, expect } from "vitest";
import { CollisionManager } from "../js/managers/CollisionManager.js";

describe("CollisionManager.intersects edge behavior", () => {
  it("returns false for touching edges (no overlap)", () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 10, y: 0, width: 10, height: 10 };
    expect(CollisionManager.intersects(a, b)).toBe(false);
  });

  it("returns true for partial overlap", () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 9.9, y: 0, width: 10, height: 10 };
    expect(CollisionManager.intersects(a, b)).toBe(true);
  });

  it("supports objects that only expose getBounds()", () => {
    const a = { getBounds: () => ({ x: 0, y: 0, width: 10, height: 10 }) };
    const b = { x: 5, y: 5, width: 10, height: 10 };
    const c = { getBounds: () => ({ x: 50, y: 50, width: 10, height: 10 }) };
    expect(CollisionManager.intersects(a, b)).toBe(true);
    expect(CollisionManager.intersects(b, a)).toBe(true);
    expect(CollisionManager.intersects(a, c)).toBe(false);
  });
});
