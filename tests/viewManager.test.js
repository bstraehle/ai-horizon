// @ts-check
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { ViewManager } from "../js/managers/ViewManager.js";
import { GameStateMachine } from "../js/core/GameStateMachine.js";
import { CONFIG } from "../js/constants.js";

// Minimal canvas/ctx mocks
function makeCtx() {
  return {
    setTransform: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
  };
}

function makeGame() {
  /** @type {HTMLCanvasElement & { style:any }} */
  const canvas = /** @type {any} */ ({
    style: {},
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    }),
  });
  const ctx = /** @type {any} */ (makeCtx());
  return {
    canvas,
    ctx,
    view: { width: 0, height: 0, dpr: 1 },
    player: { x: 0, y: 0, width: CONFIG.SIZES.PLAYER, height: CONFIG.SIZES.PLAYER },
    state: new GameStateMachine(),
  };
}

function ensureWindow() {
  if (!globalThis.window) {
    // Minimal stub for node test env
    // @ts-ignore
    globalThis.window = {};
  }
  if (typeof window.innerWidth !== "number")
    Object.defineProperty(window, "innerWidth", {
      value: 1024,
      configurable: true,
      writable: true,
    });
  if (typeof window.innerHeight !== "number")
    Object.defineProperty(window, "innerHeight", {
      value: 768,
      configurable: true,
      writable: true,
    });
  if (typeof window.devicePixelRatio !== "number")
    Object.defineProperty(window, "devicePixelRatio", {
      value: 1,
      configurable: true,
      writable: true,
    });
  return { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio };
}

describe("ViewManager.resize", () => {
  const origInner = ensureWindow();

  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { value: 400, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 300, configurable: true });
    Object.defineProperty(window, "devicePixelRatio", { value: 2, configurable: true });
  });

  it("centers player on first layout", () => {
    const game = makeGame();
    ViewManager.resize(game);
    expect(game.view.width).toBe(400);
    expect(game.view.height).toBe(300);
    expect(game.player.x).toBeCloseTo(game.view.width / 2 - game.player.width / 2, 5);
    expect(game.player.y).toBeCloseTo(
      game.view.height - game.player.height - CONFIG.PLAYER.SPAWN_Y_OFFSET,
      5
    );
  });

  it("honours a dpr cap override above the configured ceilings", () => {
    Object.defineProperty(window, "devicePixelRatio", { value: 4, configurable: true });
    const capped = /** @type {any} */ (makeGame());
    ViewManager.resize(capped);
    expect(capped.view.dpr).toBeCloseTo(CONFIG.VIEW.DPR_MAX, 5);
    const raised = /** @type {any} */ (makeGame());
    raised._dprCapOverride = 4;
    raised._isMobile = true; // mobile ceiling is bypassed too
    ViewManager.resize(raised);
    expect(raised.view.dpr).toBeCloseTo(4, 5);
  });

  it("clears carried-over motion when placing the player at spawn", () => {
    const game = makeGame();
    const player = /** @type {any} */ (game.player);
    player.vx = 500;
    player._bank = 0.9;
    player.resetMotion = vi.fn(() => {
      player.vx = 0;
      player._bank = 0;
    });
    ViewManager.resize(game);
    expect(player.resetMotion).toHaveBeenCalledTimes(1);
    // While running, a resize keeps motion (no teleport).
    game.state.start();
    player.vx = 300;
    ViewManager.resize(game);
    expect(player.resetMotion).toHaveBeenCalledTimes(1);
    expect(player.vx).toBe(300);
  });

  it("preserves relative position on subsequent resizes", () => {
    const game = makeGame();
    ViewManager.resize(game);
    // pretend running and move player near right, above bottom
    game.state.start();
    game.player.x = game.view.width - game.player.width - 10;
    game.player.y = game.view.height - game.player.height - 50;

    // resize window
    Object.defineProperty(window, "innerWidth", { value: 800, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 600, configurable: true });

    ViewManager.resize(game);

    expect(game.view.width).toBe(800);
    expect(game.view.height).toBe(600);
    // x should still be near right edge, y should preserve bottom offset proportionally
    expect(game.player.x).toBeGreaterThan(600);
    expect(game.player.y).toBeGreaterThan(400);
  });

  // restore globals
  afterAll(() => {
    if (globalThis.window) {
      Object.defineProperty(window, "innerWidth", { value: origInner.w, configurable: true });
      Object.defineProperty(window, "innerHeight", { value: origInner.h, configurable: true });
      Object.defineProperty(window, "devicePixelRatio", {
        value: origInner.dpr,
        configurable: true,
      });
    }
  });
});
