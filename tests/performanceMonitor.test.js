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
});
