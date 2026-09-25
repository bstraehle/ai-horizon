// @ts-check
import { describe, it, expect } from "vitest";
import { RenderManager } from "../js/managers/RenderManager.js";
import { Bullet } from "../js/entities/Bullet.js";
import { Star } from "../js/entities/Star.js";
import { Particle } from "../js/entities/Particle.js";
import { Player } from "../js/entities/Player.js";
import { EngineTrail } from "../js/entities/EngineTrail.js";
import { Asteroid } from "../js/entities/Asteroid.js";
import { CONFIG } from "../js/constants.js";

/** Recording 2D context: captures drawImage destinations and direct-draw rects. */
function makeCtx() {
  /** @type {{ drawImage: any[][], fillRect: any[][], arcs: any[][], translate: any[][] }} */
  const calls = { drawImage: [], fillRect: [], arcs: [], translate: [] };
  const ctx = {
    calls,
    globalAlpha: 1,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    shadowColor: "",
    shadowBlur: 0,
    font: "",
    textAlign: "",
    textBaseline: "",
    drawImage(/** @type {any[]} */ ...args) {
      calls.drawImage.push(args);
    },
    fillRect(/** @type {any[]} */ ...args) {
      calls.fillRect.push(args);
    },
    arc(/** @type {any[]} */ ...args) {
      calls.arcs.push(args);
    },
    ellipse(/** @type {any[]} */ ...args) {
      calls.arcs.push(args);
    },
    translate(/** @type {any[]} */ ...args) {
      calls.translate.push(args);
    },
    scale() {},
    rotate() {},
    clip() {},
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    fill() {},
    stroke() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    fillText() {},
    strokeText() {},
  };
  return ctx;
}

const T = 0.5; // half a second: large enough to make offsets obvious

describe("entity draw extrapolation (render-only, simulation state untouched)", () => {
  it("Bullet projects upward by speed * t", () => {
    const b = new Bullet(10, 100, 4, 15, 480);
    const ctx = makeCtx();
    b.draw(/** @type {any} */ (ctx), T);
    // Fallback path (no canvas): body fillRect at the extrapolated y.
    expect(ctx.calls.fillRect[0][1]).toBeCloseTo(100 - 480 * T, 6);
    expect(b.y).toBe(100);
  });

  it("Star and Asteroid project downward by speed * t", () => {
    const s = new Star(10, 100, 20, 20, 100);
    const ctx = makeCtx();
    s.draw(/** @type {any} */ (ctx), T);
    expect(ctx.calls.arcs.length).toBe(0); // star polygon uses moveTo/lineTo
    expect(s.y).toBe(100);

    const a = new Asteroid(10, 100, 40, 40, 200, { nextFloat: () => 0.5 }, false);
    const actx = makeCtx();
    a.draw(/** @type {any} */ (actx), T);
    // The body is drawn in a frame translated to its (extrapolated) centre: y + speed*t + height/2
    expect(actx.calls.translate[0][0]).toBeCloseTo(10 + 20, 6);
    expect(actx.calls.translate[0][1]).toBeCloseTo(100 + a.speed * T + 20, 6);
    expect(a.y).toBe(100);
  });

  it("Particle projects along its velocity", () => {
    const p = new Particle(10, 20, 30, -40, 1, 1, 2, "#fff");
    const ctx = makeCtx();
    p.draw(/** @type {any} */ (ctx), T);
    expect(ctx.calls.arcs[0][0]).toBeCloseTo(10 + 30 * T, 6);
    expect(ctx.calls.arcs[0][1]).toBeCloseTo(20 - 40 * T, 6);
    expect([p.x, p.y]).toEqual([10, 20]);
  });

  it("EngineTrail projects downward drift", () => {
    const trail = new EngineTrail();
    trail.add({ x: 100, y: 200, width: 20, height: 20 }, { nextFloat: () => 0.5 });
    const ctx = makeCtx();
    trail.draw(/** @type {any} */ (ctx), T);
    expect(ctx.calls.arcs[0][1]).toBeCloseTo(220 + CONFIG.ENGINE_TRAIL.SPEED * T, 6);
    expect(trail.particles[0].y).toBe(220);
  });

  it("Player projects its last-step velocity and clamps to the playable bounds", () => {
    const player = new Player(100, 100, 25, 25, 480);
    const view = { width: 800, height: 600 };
    // One step moving right at full speed via keyboard.
    player.update({ ArrowRight: true }, { x: 0, y: 0 }, view, 1 / 60);
    expect(player.vx).toBeCloseTo(480, 6);
    const ctx = makeCtx();
    player.draw(/** @type {any} */ (ctx), 1 / 120);
    // Fallback ship drawing while banking: the ship is drawn in a frame translated to its
    // (extrapolated) centre; compare against the un-extrapolated draw.
    const ctx0 = makeCtx();
    player.draw(/** @type {any} */ (ctx0), 0);
    const shipX = (/** @type {any} */ c) =>
      c.calls.translate.length ? c.calls.translate[0][0] : c.calls.fillRect[0][0];
    expect(shipX(ctx) - shipX(ctx0)).toBeCloseTo(480 / 120, 6);

    // Push to the right edge; extrapolation must not draw beyond the bounds.
    player.x = view.width - player.width;
    player.vx = 5000;
    const edge = makeCtx();
    player.draw(/** @type {any} */ (edge), 1);
    const edge0 = makeCtx();
    player.draw(/** @type {any} */ (edge0), 0);
    expect(shipX(edge)).toBeCloseTo(shipX(edge0), 6);
  });

  it("with t = 0 every entity draws at its simulated position", () => {
    const b = new Bullet(10, 100, 4, 15, 480);
    const ctx = makeCtx();
    b.draw(/** @type {any} */ (ctx), 0);
    expect(ctx.calls.fillRect[0][1]).toBe(100);
  });
});

describe("RenderManager.draw extrapolation and culling", () => {
  function makeGame() {
    const bulletSprite = { width: 4, height: 25 };
    return /** @type {any} */ ({
      ctx: makeCtx(),
      view: { width: 800, height: 600 },
      asteroids: [],
      bullets: [new Bullet(50, 300, 4, 15, 480), new Bullet(50, -400, 4, 15, 480)],
      stars: [],
      explosions: [],
      particles: [],
      player: null,
      engineTrail: null,
      sprites: { bullet: bulletSprite, bulletTrail: CONFIG.BULLET.TRAIL, starBaseSize: 0 },
      scorePopups: [],
      timeSec: 0,
    });
  }

  it("shifts atlas-drawn bullets by the extrapolation offset", () => {
    const game = makeGame();
    RenderManager.draw(game, 0.1);
    const dest = game.ctx.calls.drawImage[0];
    // Atlas bolts use the 5-argument drawImage form: (sprite, x - pad, y - pad, w, h); pad = 0 here.
    expect(dest[2]).toBeCloseTo(300 - 480 * 0.1, 6);
    expect(game.bullets[0].y).toBe(300);
  });

  it("culls against the logical view (CSS pixels), not the DPR-scaled canvas", () => {
    const game = makeGame();
    game.ctx.canvas = { width: 1600, height: 1200 }; // 2x backing store must not widen culling
    RenderManager.draw(game, 0);
    // Only the on-screen bullet is drawn; the one at y=-400 is culled.
    expect(game.ctx.calls.drawImage.length).toBe(1);
  });

  it("ages score popups with the real frame delta", () => {
    const game = makeGame();
    game.scorePopups = [{ text: "+10", x: 10, y: 10, life: 0, maxLife: 1 }];
    game._frameDtSec = 0.25;
    game._lastDtSec = 1 / 60;
    RenderManager.draw(game, 0);
    expect(game.scorePopups[0].life).toBeCloseTo(0.25, 6);
  });
});
