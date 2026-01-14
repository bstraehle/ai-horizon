// @ts-check
import { describe, it, expect } from "vitest";
import { getRect, isOnscreen } from "../js/utils/bounds.js";

describe("bounds utilities", () => {
  describe("getRect", () => {
    it("returns null for null/undefined input", () => {
      expect(getRect(null)).toBe(null);
      expect(getRect(undefined)).toBe(null);
    });

    it("extracts bounds from plain x/y/width/height object", () => {
      const obj = { x: 10, y: 20, width: 30, height: 40 };
      const rect = getRect(obj);
      expect(rect).toEqual({ x: 10, y: 20, width: 30, height: 40 });
    });

    it("extracts bounds from object with getBounds method", () => {
      const obj = {
        getBounds: () => ({ x: 5, y: 15, width: 25, height: 35 }),
      };
      const rect = getRect(obj);
      expect(rect).toEqual({ x: 5, y: 15, width: 25, height: 35 });
    });

    it("defaults width/height to 0 when missing", () => {
      const obj = { x: 10, y: 20 };
      const rect = getRect(obj);
      expect(rect).toEqual({ x: 10, y: 20, width: 0, height: 0 });
    });

    it("defaults height to width when height is missing", () => {
      const obj = { x: 10, y: 20, width: 30 };
      const rect = getRect(obj);
      expect(rect).toEqual({ x: 10, y: 20, width: 30, height: 30 });
    });

    it("returns null for object with non-finite x/y", () => {
      expect(getRect({ x: NaN, y: 10 })).toBe(null);
      expect(getRect({ x: 10, y: Infinity })).toBe(null);
      expect(getRect({ x: "foo", y: 10 })).toBe(null);
    });

    it("handles getBounds that returns invalid data gracefully", () => {
      const obj = {
        getBounds: () => ({ x: NaN, y: 10 }),
        x: 5,
        y: 15,
      };
      const rect = getRect(obj);
      expect(rect).toEqual({ x: 5, y: 15, width: 0, height: 0 });
    });

    it("handles getBounds that throws gracefully", () => {
      const obj = {
        getBounds: () => {
          throw new Error("boom");
        },
        x: 5,
        y: 15,
      };
      const rect = getRect(obj);
      expect(rect).toEqual({ x: 5, y: 15, width: 0, height: 0 });
    });
  });

  describe("isOnscreen", () => {
    it("returns true for null/undefined object (fail-open)", () => {
      expect(isOnscreen(null, 100, 100)).toBe(true);
      expect(isOnscreen(undefined, 100, 100)).toBe(true);
    });

    it("returns true for object fully within viewport", () => {
      const obj = { x: 10, y: 10, width: 20, height: 20 };
      expect(isOnscreen(obj, 100, 100)).toBe(true);
    });

    it("returns false for object completely off left edge", () => {
      const obj = { x: -50, y: 10, width: 20, height: 20 };
      expect(isOnscreen(obj, 100, 100)).toBe(false);
    });

    it("returns false for object completely off right edge", () => {
      const obj = { x: 150, y: 10, width: 20, height: 20 };
      expect(isOnscreen(obj, 100, 100)).toBe(false);
    });

    it("returns false for object completely off top edge", () => {
      const obj = { x: 10, y: -50, width: 20, height: 20 };
      expect(isOnscreen(obj, 100, 100)).toBe(false);
    });

    it("returns false for object completely off bottom edge", () => {
      const obj = { x: 10, y: 150, width: 20, height: 20 };
      expect(isOnscreen(obj, 100, 100)).toBe(false);
    });

    it("returns true for object partially visible", () => {
      const obj = { x: -10, y: 10, width: 20, height: 20 };
      expect(isOnscreen(obj, 100, 100)).toBe(true);
    });

    it("respects margin parameter for off-screen objects", () => {
      const obj = { x: -25, y: 10, width: 20, height: 20 };
      expect(isOnscreen(obj, 100, 100, 0)).toBe(false);
      expect(isOnscreen(obj, 100, 100, 10)).toBe(true);
    });

    it("handles non-finite viewport dimensions gracefully", () => {
      const obj = { x: 10, y: 10, width: 20, height: 20 };
      expect(isOnscreen(obj, NaN, 100)).toBe(true);
      expect(isOnscreen(obj, 100, NaN)).toBe(true);
    });

    it("handles zero viewport dimensions", () => {
      const obj = { x: 10, y: 10, width: 20, height: 20 };
      expect(isOnscreen(obj, 0, 100)).toBe(true);
      expect(isOnscreen(obj, 100, 0)).toBe(true);
    });
  });
});
