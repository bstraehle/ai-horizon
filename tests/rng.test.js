// @ts-check
import { describe, it, expect } from "vitest";
import { RNG } from "../js/utils/RNG.js";

describe("RNG", () => {
  it("produces deterministic sequence for same seed", () => {
    const a = new RNG(1234);
    const b = new RNG(1234);
    const seqA = Array.from({ length: 10 }, () => a.nextFloat());
    const seqB = Array.from({ length: 10 }, () => b.nextFloat());
    expect(seqA).toEqual(seqB);
  });

  it("range(min,max) returns within bounds", () => {
    const r = new RNG(42);
    for (let i = 0; i < 100; i++) {
      const x = r.range(-5, 5);
      expect(x).toBeGreaterThanOrEqual(-5);
      expect(x).toBeLessThanOrEqual(5);
    }
  });

  it("nextInt(max) is in [0, max)", () => {
    const r = new RNG(7);
    for (let i = 0; i < 100; i++) {
      const n = r.nextInt(10);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(10);
    }
  });

  it("pick() returns element from array", () => {
    const r = new RNG(42);
    const arr = ["a", "b", "c", "d", "e"];
    for (let i = 0; i < 50; i++) {
      const picked = r.pick(arr);
      expect(arr).toContain(picked);
    }
  });

  it("pick() is deterministic with same seed", () => {
    const arr = [1, 2, 3, 4, 5];
    const r1 = new RNG(123);
    const r2 = new RNG(123);
    const picks1 = Array.from({ length: 10 }, () => r1.pick(arr));
    const picks2 = Array.from({ length: 10 }, () => r2.pick(arr));
    expect(picks1).toEqual(picks2);
  });

  it("fromString() creates RNG from string seed", () => {
    const r1 = RNG.fromString("test-seed");
    const r2 = RNG.fromString("test-seed");
    const seq1 = Array.from({ length: 10 }, () => r1.nextFloat());
    const seq2 = Array.from({ length: 10 }, () => r2.nextFloat());
    expect(seq1).toEqual(seq2);
  });

  it("fromString() produces different sequences for different strings", () => {
    const r1 = RNG.fromString("seed-a");
    const r2 = RNG.fromString("seed-b");
    const seq1 = Array.from({ length: 5 }, () => r1.nextFloat());
    const seq2 = Array.from({ length: 5 }, () => r2.nextFloat());
    expect(seq1).not.toEqual(seq2);
  });

  it("nextFloat() returns values in [0, 1)", () => {
    const r = new RNG(999);
    for (let i = 0; i < 100; i++) {
      const f = r.nextFloat();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });
});
