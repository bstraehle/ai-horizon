import { describe, expect, it } from "vitest";
import { PerformanceMonitor } from "../js/core/PerformanceMonitor.js";

describe("PerformanceMonitor", () => {
  it("escalates level after sustained slow frames", () => {
    const events = [];
    const monitor = new PerformanceMonitor({
      levels: [
        { thresholdMs: 10, sampleWindow: 5, cooldownFrames: 0 },
        { thresholdMs: 8, sampleWindow: 5, cooldownFrames: 0 },
      ],
      onLevelChange: (level, meta) => events.push({ level, meta }),
    });

    for (let i = 0; i < 5; i++) {
      monitor.sample(12, { active: true });
    }

    expect(events.length).toBe(1);
    expect(events[0].level).toBe(1);
  });

  it("ignores samples when inactive", () => {
    const monitor = new PerformanceMonitor({
      levels: [{ thresholdMs: 5, sampleWindow: 3, cooldownFrames: 0 }],
    });

    // Long frames while paused should be ignored
    monitor.sample(20, { active: false });
    monitor.sample(20, { active: false });
    monitor.sample(20, { active: false });

    // Resume with good frames – no escalation expected
    monitor.sample(2, { active: true });
    monitor.sample(2, { active: true });
    monitor.sample(2, { active: true });

    expect(monitor.level).toBe(0);
  });

  it("reset() resets level and clears cooldown", () => {
    const events = [];
    const monitor = new PerformanceMonitor({
      levels: [
        { thresholdMs: 10, sampleWindow: 3, cooldownFrames: 0 },
        { thresholdMs: 8, sampleWindow: 3, cooldownFrames: 0 },
      ],
      onLevelChange: (level, meta) => events.push({ level, meta }),
    });

    for (let i = 0; i < 3; i++) {
      monitor.sample(15, { active: true });
    }
    expect(monitor.level).toBe(1);

    monitor.reset();
    expect(monitor.level).toBe(0);
  });

  it("reset(level) sets specific level", () => {
    const monitor = new PerformanceMonitor({
      levels: [
        { thresholdMs: 10, sampleWindow: 3, cooldownFrames: 0 },
        { thresholdMs: 8, sampleWindow: 3, cooldownFrames: 0 },
        { thresholdMs: 6, sampleWindow: 3, cooldownFrames: 0 },
      ],
    });

    monitor.reset(2);
    expect(monitor.level).toBe(2);
  });

  it("ignores non-finite or non-positive frame times", () => {
    const monitor = new PerformanceMonitor({
      levels: [{ thresholdMs: 5, sampleWindow: 3, cooldownFrames: 0 }],
    });

    monitor.sample(NaN, { active: true });
    monitor.sample(-5, { active: true });
    monitor.sample(0, { active: true });
    monitor.sample(Infinity, { active: true });

    expect(monitor.level).toBe(0);
  });

  it("level getter returns current level", () => {
    const monitor = new PerformanceMonitor({
      levels: [{ thresholdMs: 10, sampleWindow: 3, cooldownFrames: 0 }],
    });

    expect(monitor.level).toBe(0);
  });

  it("de-escalates level after sustained recovered frame times", () => {
    const events = [];
    const monitor = new PerformanceMonitor({
      levels: [{ thresholdMs: 10, sampleWindow: 4, cooldownFrames: 0 }],
      recoveryThresholdFactor: 0.9,
      recoveryCooldownFrames: 0,
      onLevelChange: (level, meta) => events.push({ level, meta }),
    });

    for (let i = 0; i < 4; i++) {
      monitor.sample(12, { active: true });
    }
    expect(monitor.level).toBe(1);

    for (let i = 0; i < 4; i++) {
      monitor.sample(7, { active: true });
    }

    expect(monitor.level).toBe(0);
    expect(events.map((e) => e.level)).toEqual([1, 0]);
  });

  it("continues sampling at max level and recovers from it", () => {
    const monitor = new PerformanceMonitor({
      levels: [
        { thresholdMs: 10, sampleWindow: 3, cooldownFrames: 0 },
        { thresholdMs: 8, sampleWindow: 3, cooldownFrames: 0 },
      ],
      recoveryThresholdFactor: 0.95,
      recoveryCooldownFrames: 0,
    });

    for (let i = 0; i < 3; i++) {
      monitor.sample(12, { active: true });
    }
    expect(monitor.level).toBe(1);

    for (let i = 0; i < 3; i++) {
      monitor.sample(9, { active: true });
    }
    expect(monitor.level).toBe(2);

    for (let i = 0; i < 3; i++) {
      monitor.sample(7, { active: true });
    }
    expect(monitor.level).toBe(1);
  });
});
