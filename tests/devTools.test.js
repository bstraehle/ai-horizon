// @ts-check
import { describe, it, expect, vi } from "vitest";
import { attachDevTools } from "../js/ui/DevTools.js";

function makeGame() {
  return {
    state: { isRunning: () => false },
    startGame: vi.fn(),
    asteroids: [],
    bullets: [],
    stars: [],
    explosions: [],
    particles: [],
    scorePopups: [],
    engineTrail: { particles: [] },
    player: { x: 0, y: 0, width: 25, height: 25 },
    view: { width: 800, height: 600, dpr: 1 },
    input: { mouse: { x: 0, y: 0 }, fireHeld: false },
  };
}

describe("attachDevTools", () => {
  it("returns null when no diagnostic flag is present", () => {
    expect(attachDevTools(makeGame(), "")).toBeNull();
    expect(attachDevTools(makeGame(), "?seed=42")).toBeNull();
    expect(attachDevTools(makeGame(), "?debug=other&autoplay=0")).toBeNull();
  });

  it("enables only the overlay for debug=perf", () => {
    const handle = attachDevTools(makeGame(), "?debug=perf");
    expect(handle).not.toBeNull();
    expect(handle?.overlay).not.toBeNull();
    expect(handle?.autopilot).toBeNull();
  });

  it("enables only the autopilot for autoplay=1 and auto-starts the game", () => {
    vi.useFakeTimers();
    try {
      const game = makeGame();
      const handle = attachDevTools(game, "?autoplay=1&seed=7");
      expect(handle?.autopilot).not.toBeNull();
      expect(handle?.overlay).toBeNull();
      handle?.autoStart(100);
      expect(game.startGame).not.toHaveBeenCalled();
      vi.advanceTimersByTime(100);
      expect(game.startGame).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("forwards metrics to the overlay and drives input via the autopilot", () => {
    const game = makeGame();
    game.state = { isRunning: () => true };
    const handle = attachDevTools(game, "?debug=perf&autoplay=1");
    handle?.beforeUpdate();
    expect(game.input.fireHeld).toBe(true);
    handle?.onMetrics({ frameDt: 16, updateMs: 1, drawMs: 1, now: 0 });
    expect(handle?.overlay?.summary().frames).toBe(1);
  });
});
