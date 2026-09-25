// @ts-check
import { describe, it, expect } from "vitest";
import { GameLoop } from "../js/core/GameLoop.js";

const STEP = 1000 / 60;

/**
 * Drive the loop's RAF callback directly with synthetic timestamps.
 * @param {GameLoop} loop
 * @param {number[]} deltas Successive frame deltas (ms).
 * @returns {import('../js/core/GameLoop.js').GameLoopFrameMetrics[]}
 */
function run(loop, deltas) {
  /** @type {any[]} */
  const out = [];
  const anyLoop = /** @type {any} */ (loop);
  anyLoop._onMetrics = (/** @type {any} */ m) => out.push(m);
  let now = 1000;
  anyLoop._last = now;
  for (const d of deltas) {
    now += d;
    anyLoop._tick(now);
  }
  return out;
}

describe("GameLoop.snapFrameDelta", () => {
  it("snaps deltas within tolerance to whole steps", () => {
    expect(GameLoop.snapFrameDelta(16.9, STEP, 0.06)).toBeCloseTo(STEP, 10);
    expect(GameLoop.snapFrameDelta(16.3, STEP, 0.06)).toBeCloseTo(STEP, 10);
    expect(GameLoop.snapFrameDelta(33.6, STEP, 0.06)).toBeCloseTo(2 * STEP, 10);
  });

  it("leaves deltas that are not near a whole step untouched", () => {
    expect(GameLoop.snapFrameDelta(8.33, STEP, 0.06)).toBe(8.33); // 120 Hz
    expect(GameLoop.snapFrameDelta(6.94, STEP, 0.06)).toBe(6.94); // 144 Hz
    expect(GameLoop.snapFrameDelta(20, STEP, 0.06)).toBe(20);
  });

  it("is disabled with a zero tolerance or invalid inputs", () => {
    expect(GameLoop.snapFrameDelta(16.9, STEP, 0)).toBe(16.9);
    expect(GameLoop.snapFrameDelta(0, STEP, 0.06)).toBe(0);
    expect(GameLoop.snapFrameDelta(16.9, 0, 0.06)).toBe(16.9);
  });
});

describe("GameLoop pacing", () => {
  it("runs exactly one step per frame with alpha 0 on a jittery 60 Hz display", () => {
    let updates = 0;
    const loop = new GameLoop({ update: () => updates++, draw: () => {} });
    const metrics = run(loop, [16.5, 16.9, 16.6, 16.8, 16.7, 16.4, 16.9, 16.7]);
    expect(updates).toBe(8);
    for (const m of metrics) {
      expect(m.steps).toBe(1);
      expect(m.alpha).toBeCloseTo(0, 6);
    }
  });

  it("alternates 0/1 steps with a half-step alpha on a 120 Hz display", () => {
    let updates = 0;
    const loop = new GameLoop({ update: () => updates++, draw: () => {} });
    const metrics = run(loop, new Array(8).fill(STEP / 2));
    expect(updates).toBe(4);
    const alphas = metrics.map((m) => Number(m.alpha.toFixed(3)));
    expect(alphas).toEqual([0.5, 0, 0.5, 0, 0.5, 0, 0.5, 0]);
  });

  it("catches up after a dropped frame and clamps alpha to [0, 1]", () => {
    let updates = 0;
    const loop = new GameLoop({ update: () => updates++, draw: () => {}, maxSubSteps: 4 });
    const metrics = run(loop, [STEP * 2, STEP * 3.5, STEP * 10]);
    expect(metrics[0].steps).toBe(2);
    expect(metrics[0].alpha).toBeCloseTo(0, 6);
    expect(metrics[1].steps).toBe(3);
    expect(metrics[1].alpha).toBeCloseTo(0.5, 6);
    expect(metrics[2].steps).toBe(4); // clamped by maxSubSteps (catch-up bounded)
    for (const m of metrics) {
      expect(m.alpha).toBeGreaterThanOrEqual(0);
      expect(m.alpha).toBeLessThanOrEqual(1);
    }
    expect(updates).toBe(9);
  });

  it("does not advance the simulation and reports alpha 0 while paused", () => {
    let updates = 0;
    let draws = 0;
    const loop = new GameLoop({
      update: () => updates++,
      draw: () => draws++,
      shouldUpdate: () => false,
    });
    const metrics = run(loop, [STEP, STEP / 2, STEP * 3]);
    expect(updates).toBe(0);
    expect(draws).toBe(3);
    for (const m of metrics) expect(m.alpha).toBe(0);
  });

  it("passes metrics to a two-argument draw callback", () => {
    /** @type {any[]} */
    const seen = [];
    const loop = new GameLoop({ update: () => {}, draw: (dt, m) => seen.push([dt, m]) });
    run(loop, [STEP]);
    expect(seen).toHaveLength(1);
    expect(seen[0][0]).toBeCloseTo(STEP, 10);
    expect(seen[0][1].steps).toBe(1);
  });
});
