// @ts-check
import { describe, it, expect } from "vitest";
import { RateLimiter } from "../js/utils/RateLimiter.js";

describe("RateLimiter", () => {
  it("allows immediate call after reset and then blocks until interval", () => {
    let now = 0;
    const rl = new RateLimiter(100, () => now);

    let count = 0;
    expect(rl.try(() => count++)).toBe(true);
    expect(count).toBe(1);

    // Within interval -> blocked
    now = 50;
    expect(rl.try(() => count++)).toBe(false);
    expect(count).toBe(1);

    // After interval -> allowed
    now = 100;
    expect(rl.try(() => count++)).toBe(true);
    expect(count).toBe(2);
  });

  it("reset() allows immediate next call", () => {
    let now = 0;
    const rl = new RateLimiter(100, () => now);
    expect(rl.try()).toBe(true);
    now = 20;
    expect(rl.try()).toBe(false);
    rl.reset();
    expect(rl.try()).toBe(true);
  });

  it("setInterval() changes the gating interval for future calls", () => {
    let now = 0;
    const rl = new RateLimiter(100, () => now);
    expect(rl.try()).toBe(true);

    now = 50;
    rl.setInterval(40);

    now = 140;
    expect(rl.try()).toBe(true);

    now = 160;
    expect(rl.try()).toBe(false);

    now = 180;
    expect(rl.try()).toBe(true);
  });

  it("try() works without callback", () => {
    let now = 0;
    const rl = new RateLimiter(100, () => now);
    expect(rl.try()).toBe(true);
    now = 50;
    expect(rl.try()).toBe(false);
    now = 100;
    expect(rl.try()).toBe(true);
  });
});
