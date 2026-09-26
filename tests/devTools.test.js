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

  it("applies a dpr cap override and resizes, without attaching hooks", () => {
    const game = /** @type {any} */ (makeGame());
    game.resizeCanvas = vi.fn();
    game.drawBackground = vi.fn();
    expect(attachDevTools(game, "?dpr=4")).toBeNull();
    expect(game._dprCapOverride).toBe(4);
    expect(game.resizeCanvas).toHaveBeenCalledTimes(1);
    // The menu background is repainted after the resize cleared the canvas.
    expect(game.drawBackground).toHaveBeenCalledWith({ suppressNebula: true });
    const bad = /** @type {any} */ (makeGame());
    attachDevTools(bad, "?dpr=99");
    expect(bad._dprCapOverride).toBeUndefined();
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

  it("honours autodelay for the default auto-start hold", () => {
    vi.useFakeTimers();
    try {
      const game = makeGame();
      attachDevTools(game, "?autoplay=1&autodelay=3000")?.autoStart();
      vi.advanceTimersByTime(2999);
      expect(game.startGame).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(game.startGame).toHaveBeenCalledTimes(1);
      const plain = makeGame();
      attachDevTools(plain, "?autoplay=1&autodelay=nope")?.autoStart();
      vi.advanceTimersByTime(800);
      expect(plain.startGame).toHaveBeenCalledTimes(1);
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
