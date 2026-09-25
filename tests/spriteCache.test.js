// @ts-check
import { describe, it, expect } from "vitest";
import { SpriteCache } from "../js/utils/SpriteCache.js";

describe("SpriteCache", () => {
  it("behaves like a Map for get/set/has/size and returns the stored value from set", () => {
    const cache = new SpriteCache(4);
    const v = { canvas: {} };
    expect(cache.set("a", v)).toBe(v);
    expect(cache.get("a")).toBe(v);
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
    expect(cache.size).toBe(1);
  });

  it("evicts the oldest entry once capacity is reached", () => {
    const cache = new SpriteCache(3);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    cache.set("d", 4);
    expect(cache.size).toBe(3);
    expect(cache.has("a")).toBe(false);
    expect(cache.get("d")).toBe(4);
    expect(cache.evictions).toBe(1);
  });

  it("replacing an existing key does not evict", () => {
    const cache = new SpriteCache(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("a", 10);
    expect(cache.size).toBe(2);
    expect(cache.get("a")).toBe(10);
    expect(cache.has("b")).toBe(true);
    expect(cache.evictions).toBe(0);
  });

  it("clear empties entries and clamps maxSize to at least one", () => {
    const cache = new SpriteCache(0);
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.size).toBe(1);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
