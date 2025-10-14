import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { JSDOM } from "jsdom";
let DarkHorizon;

describe("Score popups are cleared between games", () => {
  let dom;
  beforeEach(async () => {
    dom = new JSDOM(
      `<!doctype html><html><body>
      <div class="game-container">
        <canvas id="gameCanvas"></canvas>
        <section id="gameInfo"></section>
        <div id="leaderboardScreen" class="hidden"></div>
        <div id="pauseScreen" class="hidden"></div>
        <button id="startBtn"></button>
        <button id="restartBtn"></button>
        <span id="currentScore"></span>
        <span id="highScore"></span>
        <span id="finalScore"></span>
      </div>
    </body></html>`,
      { runScripts: "dangerously", resources: "usable" }
    );

    global.window = dom.window;
    global.document = dom.window.document;
    global.requestAnimationFrame = dom.window.requestAnimationFrame;
    global.cancelAnimationFrame = dom.window.cancelAnimationFrame;

    try {
      dom.window.HTMLCanvasElement.prototype.getContext = function () {
        const noop = () => {};
        const gradient = () => ({ addColorStop: noop });
        return {
          setTransform: noop,
          save: noop,
          restore: noop,
          createLinearGradient: gradient,
          createRadialGradient: gradient,
          fillRect: noop,
          fill: noop,
          stroke: noop,
          beginPath: noop,
          rect: noop,
          arc: noop,
          moveTo: noop,
          lineTo: noop,
          closePath: noop,
          fillText: noop,
          measureText: () => ({ width: 0 }),
          drawImage: noop,
          createPattern: () => ({}),
          translate: noop,
          rotate: noop,
          scale: noop,
          clip: noop,
          clearRect: noop,
          set lineWidth(v) {},
          get lineWidth() {
            return 0;
          },
          set fillStyle(v) {},
          set strokeStyle(v) {},
        };
      };
    } catch {
      /* ignore canvas polyfill errors in test env */
    }

    const mod = await import("../js/game.js");
    DarkHorizon = mod.DarkHorizon;
  });

  afterEach(() => {
    dom.window.close();
    delete global.window;
    delete global.document;
    delete global.requestAnimationFrame;
    delete global.cancelAnimationFrame;
  });

  it("clears scorePopups on resetGameState()", () => {
    const game = new DarkHorizon();
    // simulate an existing popup (+50 etc)
    game.scorePopups.push({ x: 0, y: 0, life: 0, maxLife: 1, text: "+50", color: "#fff" });
    expect(game.scorePopups.length).toBe(1);
    game.resetGameState();
    expect(game.scorePopups.length).toBe(0);
  });

  it("clears scorePopups on fullReset()", () => {
    const game = new DarkHorizon();
    game.scorePopups.push({ x: 0, y: 0, life: 0, maxLife: 1, text: "+50", color: "#fff" });
    expect(game.scorePopups.length).toBe(1);
    game.fullReset();
    expect(game.scorePopups.length).toBe(0);
  });
});
