// @ts-check
import { describe, it, expect } from "vitest";
import { PerfOverlay } from "../js/ui/PerfOverlay.js";

function makeGame() {
  return {
    asteroids: [{}, { _surfaceSprite: {} }],
    bullets: [{}],
    stars: [],
    explosions: [],
    particles: new Array(5).fill({}),
    scorePopups: [],
    engineTrail: { particles: [{}, {}] },
    bulletPool: { freeCount: 3 },
    asteroidPool: { freeCount: 4 },
    starPool: { freeCount: 5 },
    particlePool: { freeCount: 6 },
    explosionPool: { freeCount: 7 },
    view: { dpr: 1.5 },
    canvas: { width: 300, height: 200 },
    _performanceLevel: 2,
  };
}

/** @param {PerfOverlay} overlay @param {number} count @param {Partial<import('../js/ui/PerfOverlay.js').PerfOverlayMetrics>} sample */
function feed(overlay, count, sample, startNow = 0, spacing = 16) {
  for (let i = 0; i < count; i++) {
    overlay.record({
      frameDt: 16,
      updateMs: 1,
      drawMs: 2,
      ...sample,
      now: startNow + i * spacing,
    });
  }
}

describe("PerfOverlay", () => {
  it("accumulates session statistics (avg, p95, max) and hitch / over-budget counters", () => {
    const el = { textContent: "" };
    const overlay = new PerfOverlay(makeGame(), { element: el, stepMs: 16, refreshMs: 1e9 });
    feed(overlay, 19, { frameDt: 16, updateMs: 1, drawMs: 2 });
    // One hitch (frame > 24 ms) that is also over budget (update + draw > 16 ms)
    overlay.record({ frameDt: 40, updateMs: 10, drawMs: 9, now: 19 * 16 });

    const s = overlay.summary();
    expect(s.frames).toBe(20);
    expect(s.hitches).toBe(1);
    expect(s.overBudget).toBe(1);
    expect(s.frameMs.max).toBe(40);
    expect(s.frameMs.p95).toBe(40);
    expect(s.frameMs.avg).toBeCloseTo((19 * 16 + 40) / 20, 1);
    expect(s.updateMs.max).toBe(10);
    expect(s.drawMs.max).toBe(9);
    expect(s.fps).toBeCloseTo(1000 / 16, 0);
  });

  it("ignores non-finite or non-positive frame deltas", () => {
    const overlay = new PerfOverlay(makeGame(), { element: { textContent: "" } });
    overlay.record({ frameDt: NaN, updateMs: 1, drawMs: 1, now: 0 });
    overlay.record({ frameDt: 0, updateMs: 1, drawMs: 1, now: 16 });
    overlay.record({ frameDt: -5, updateMs: 1, drawMs: 1, now: 32 });
    expect(overlay.summary().frames).toBe(0);
  });

  it("refreshes the readout at most once per refresh interval", () => {
    const el = { textContent: "" };
    const overlay = new PerfOverlay(makeGame(), { element: el, refreshMs: 250 });
    feed(overlay, 10, {}, 0, 16); // now = 0..144 → only the first record (now 0 - lastRefresh 0 >= 250? no)
    expect(el.textContent).toBe("");
    overlay.record({ frameDt: 16, updateMs: 1, drawMs: 2, now: 260 });
    expect(el.textContent).not.toBe("");
    const afterFirst = el.textContent;
    overlay.record({ frameDt: 16, updateMs: 1, drawMs: 2, now: 300 });
    expect(el.textContent).toBe(afterFirst);
  });

  it("readout reports entity, pool, sprite cache, level and canvas details", () => {
    const el = { textContent: "" };
    const overlay = new PerfOverlay(makeGame(), { element: el, refreshMs: 1 });
    feed(overlay, 3, {}, 0, 16);
    overlay.refresh();
    expect(el.textContent).toContain("ast 2 bul 1 star 0 exp 0 part 5 trail 2 pop 0");
    expect(el.textContent).toContain("pool free: bul 3 ast 4 star 5 part 6 exp 7");
    expect(el.textContent).toContain("ast 1"); // one live asteroid surface sprite
    expect(el.textContent).toContain("lvl 2 dpr 1.50 canvas 300x200");
  });

  it("rolling window only reflects the most recent frames", () => {
    const el = { textContent: "" };
    const overlay = new PerfOverlay(makeGame(), {
      element: el,
      windowSize: 8,
      refreshMs: 1e9,
      stepMs: 16,
    });
    feed(overlay, 8, { frameDt: 50 }, 0, 50);
    feed(overlay, 8, { frameDt: 10 }, 1000, 10);
    overlay.refresh();
    expect(el.textContent).toContain("fps 100.0");
    // Session summary still remembers the slow frames.
    expect(overlay.summary().hitches).toBe(8);
  });
});
