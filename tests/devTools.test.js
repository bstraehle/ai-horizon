// @ts-check
import { describe, it, expect, vi } from "vitest";
import { JSDOM } from "jsdom";
import { attachDevTools, attachFocusTrace, attachSoundLog } from "../js/ui/DevTools.js";

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

  it("debug=focus traces focus, keys and the leaderboard transition without blocking events", async () => {
    const dom = new JSDOM(
      `<!doctype html><body>
        <div id="leaderboardScreen" class="hidden" hidden><button id="restartBtn">Launch</button></div>
        <button id="okBtn">Ok</button>
      </body>`,
      { url: "http://localhost/" }
    );
    const doc = dom.window.document;
    const logs = /** @type {string[]} */ ([]);
    const spy = vi.spyOn(console, "log").mockImplementation((msg) => logs.push(String(msg)));
    vi.useFakeTimers();
    try {
      const detach = attachFocusTrace(doc);
      const ok = /** @type {HTMLButtonElement} */ (doc.getElementById("okBtn"));
      ok.focus();
      const key = new dom.window.KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      });
      ok.dispatchEvent(key);
      ok.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "a", bubbles: true }));
      const lb = /** @type {HTMLElement} */ (doc.getElementById("leaderboardScreen"));
      lb.classList.remove("hidden");
      lb.hidden = false;
      await Promise.resolve();
      vi.advanceTimersByTime(3000);
      expect(key.defaultPrevented).toBe(false);
      expect(logs.some((l) => l.includes("focusin target=#okBtn"))).toBe(true);
      expect(logs.some((l) => l.includes("keydown target=#okBtn key=Enter"))).toBe(true);
      expect(logs.some((l) => l.includes("key=a"))).toBe(false);
      expect(logs.filter((l) => l.includes("leaderboard shown"))).toHaveLength(1);
      expect(logs.some((l) => l.includes("leaderboard +3000ms"))).toBe(true);
      expect(logs.every((l) => l.startsWith("[focus]") && l.includes("lock="))).toBe(true);
      detach();
      const before = logs.length;
      ok.blur();
      expect(logs.length).toBe(before);
    } finally {
      vi.useRealTimers();
      spy.mockRestore();
    }
  });

  it("soundlog records sound-effect calls (not narration) and still plays them", () => {
    const calls = /** @type {any[]} */ ([]);
    const audio = {
      playAsteroidHit: (/** @type {any} */ o) => calls.push(["hit", o]),
      playStarCollect: (/** @type {any} */ o) => calls.push(["star", o]),
      playSpeech: () => calls.push(["speech"]),
    };
    const log = /** @type {any[]} */ ([]);
    expect(attachSoundLog({ audio }, log)).toBe(log);
    audio.playAsteroidHit({ heavy: true, pan: 0.5 });
    audio.playStarCollect({ bonus: false, pan: -1 });
    audio.playSpeech();
    expect(calls.map((c) => c[0])).toEqual(["hit", "star", "speech"]);
    expect(log.map((e) => [e.method, e.args])).toEqual([
      ["playAsteroidHit", [{ heavy: true, pan: 0.5 }]],
      ["playStarCollect", [{ bonus: false, pan: -1 }]],
    ]);
    expect(log.every((e) => typeof e.t === "number")).toBe(true);
    expect(attachSoundLog({}, [])).toBeNull();
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
