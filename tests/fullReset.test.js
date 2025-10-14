import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { JSDOM } from "jsdom";
let DarkHorizon;

describe("DarkHorizon.fullReset", () => {
  let dom;
  beforeEach(() => {
    // Create a fresh DOM with required elements
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

    // Patch global window/document for modules that read them directly
    global.window = dom.window;
    global.document = dom.window.document;
    global.requestAnimationFrame = dom.window.requestAnimationFrame;
    global.cancelAnimationFrame = dom.window.cancelAnimationFrame;

    // Import the game module after DOM globals are in place
    // Provide a minimal getContext implementation for canvas used in tests
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
    } catch (_e) {
      // ignore
      void _e;
    }

    return import("../js/game.js").then((m) => {
      DarkHorizon = m.DarkHorizon;
    });
  });

  afterEach(() => {
    dom.window.close();
    delete global.window;
    delete global.document;
    delete global.requestAnimationFrame;
    delete global.cancelAnimationFrame;
  });

  it("clears dynamic state and resets to menu", () => {
    const game = new DarkHorizon();
    // mutate runtime state
    game.score = 1234;
    game.asteroids.push({});
    game.bullets.push({});
    game.particles.push({});
    game.stars.push({});
    game.explosions.push({});
    // ensure we are not in menu
    game.state.start();
    expect(game.state.isRunning()).toBe(true);

    // call full reset
    game.fullReset();

    // assertions
    expect(game.score).toBe(0);
    expect(game.asteroids.length).toBe(0);
    expect(game.bullets.length).toBe(0);
    expect(game.particles.length).toBe(0);
    expect(game.stars.length).toBe(0);
    expect(game.explosions.length).toBe(0);
    expect(game.state.isMenu()).toBe(true);
  });
});
