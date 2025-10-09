import { clamp, CONFIG, PI2 } from "../constants.js";
/** @typedef {{ [code:string]: boolean }} KeyMap */
/** @typedef {{ x:number, y:number }} Point */
/** @typedef {{ width:number, height:number }} ViewSize */

/**
 * Player – user-controlled ship (movement + drawing only; side-effects externalized).
 *
 * Responsibilities:
 *  - Reconcile keyboard vs mouse steering (keyboard dominance to avoid jitter).
 *  - Clamp position to dynamic view bounds each frame.
 *  - Provide bounding box for collision queries.
 *  - Draw an emoji-inspired rocket (single path operations) for minimal overdraw.
 *
 * Input Precedence:
 *  - If any movement key pressed (arrows / WASD) => keyboard path, ignore mouse.
 *  - Else, smooth-lerp center toward mouse (CONFIG.PLAYER.MOUSE_LERP factor per second).
 *
 * Performance Notes:
 *  - Update: O(1) arithmetic + clamp; no allocations.
 *  - Draw: single complex path + a few simple shapes; no gradients inside loops.
 *
 * Separation of Concerns:
 *  - Engine flame particles handled by EngineTrail / external systems.
 *  - Shooting / scoring handled elsewhere (Player holds no gameplay timers here).
 */
export class Player {
  /**
   * @param {number} x Spawn x (top-left)
   * @param {number} y Spawn y (top-left)
   * @param {number} width Ship width in logical pixels
   * @param {number} height Ship height in logical pixels
   * @param {number} speed Base movement speed (pixels / second)
   */
  constructor(x, y, width, height, speed) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.speed = speed;
  }

  /**
   * Update player position using keyboard dominance or mouse lerp fallback.
   *
   * Keyboard Path:
   *  - Applies directional deltas scaled by dtSec * speed.
   * Mouse Path:
   *  - Lerp factor = clamp(MOUSE_LERP * dtSec, 0..1) (prevents overshoot at large dt).
   *
   * Invariants: position clamped within [0, view - size].
   * @param {KeyMap} input Key state map (true = pressed).
   * @param {Point} mousePos Current mouse coords (canvas space) used only when no key pressed.
   * @param {ViewSize} view Current playable area (width/height).
   * @param {number} [dtSec=CONFIG.TIME.DEFAULT_DT] Delta seconds.
   */
  update(input, mousePos, view, dtSec = CONFIG.TIME.DEFAULT_DT) {
    const keyboardPressed =
      input["ArrowLeft"] ||
      input["KeyA"] ||
      input["ArrowRight"] ||
      input["KeyD"] ||
      input["ArrowUp"] ||
      input["KeyW"] ||
      input["ArrowDown"] ||
      input["KeyS"];
    if (keyboardPressed) {
      const s = this.speed * dtSec;
      if (input["ArrowLeft"] || input["KeyA"]) this.x -= s;
      if (input["ArrowRight"] || input["KeyD"]) this.x += s;
      if (input["ArrowUp"] || input["KeyW"]) this.y -= s;
      if (input["ArrowDown"] || input["KeyS"]) this.y += s;
    } else if (mousePos.x > 0 && mousePos.y > 0) {
      const targetX = mousePos.x - this.width / 2;
      const targetY = mousePos.y - this.height / 2;
      const lerp = Math.min(1, CONFIG.PLAYER.MOUSE_LERP * dtSec);
      this.x += (targetX - this.x) * lerp;
      this.y += (targetY - this.y) * lerp;
    }
    this.x = clamp(this.x, 0, view.width - this.width);
    this.y = clamp(this.y, 0, view.height - this.height);
  }

  /**
   * Draw rocket layers (body, fins, cockpit, gun, flame).
   * Layer Order:
   *  1. Body (grad + outline)
   *  2. Fins (mirrored red shapes)
   *  3. Cockpit window (blue gradient circle)
   *  4. Gun/nozzle rectangle
   *  5. Engine flame triangle w/ radial gradient
   * @param {CanvasRenderingContext2D} ctx 2D context.
   */
  draw(ctx) {
    const sprite = Player._getSprite(this.width, this.height);
    if (sprite) {
      ctx.drawImage(sprite.canvas, this.x - sprite.padX, this.y - sprite.padY);
      return;
    }
    Player._drawShip(ctx, this.width, this.height, this.x, this.y);
  }

  /**
   * Provide axis-aligned bounding box (collision system input).
   * @returns {{x:number,y:number,width:number,height:number}}
   */
  getBounds() {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }

  /** @private */
  /**
   * @param {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} ctx
   * @param {number} width
   * @param {number} height
   * @param {number} originX
   * @param {number} originY
   */
  static _drawShip(ctx, width, height, originX, originY) {
    ctx.save();
    const cx = originX + width / 2;
    const topY = originY;
    const bodyW = Math.max(8, width * 0.6);
    const bodyH = Math.max(12, height * 0.9);
    const bodyX = cx - bodyW / 2;
    const bodyY = topY + (height - bodyH) / 2;

    const bodyGrad = ctx.createLinearGradient(bodyX, bodyY, bodyX, bodyY + bodyH);
    bodyGrad.addColorStop(0, "#ffffff");
    bodyGrad.addColorStop(0.6, "#f0f0f0");
    bodyGrad.addColorStop(1, "#d9d9d9");

    ctx.beginPath();
    ctx.moveTo(cx, bodyY);
    ctx.quadraticCurveTo(
      bodyX + bodyW * 1.05,
      bodyY + bodyH * 0.2,
      bodyX + bodyW * 0.9,
      bodyY + bodyH * 0.5
    );
    ctx.quadraticCurveTo(bodyX + bodyW * 1.05, bodyY + bodyH * 0.8, cx, bodyY + bodyH);
    ctx.quadraticCurveTo(
      bodyX - bodyW * 0.05,
      bodyY + bodyH * 0.8,
      bodyX + bodyW * 0.1,
      bodyY + bodyH * 0.5
    );
    ctx.quadraticCurveTo(bodyX - bodyW * 0.05, bodyY + bodyH * 0.2, cx, bodyY);
    ctx.closePath();
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    ctx.strokeStyle = CONFIG.COLORS.PLAYER.OUTLINE || "#999";
    ctx.lineWidth = CONFIG.PLAYER.DRAW.OUTLINE_WIDTH || 2;
    ctx.stroke();

    const finW = bodyW * 0.6;
    ctx.fillStyle = "#d94141";
    ctx.beginPath();
    ctx.moveTo(bodyX + bodyW * 0.12, bodyY + bodyH * 0.55);
    ctx.lineTo(bodyX - finW * 0.2, bodyY + bodyH * 0.75);
    ctx.lineTo(bodyX + bodyW * 0.18, bodyY + bodyH * 0.78);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bodyX + bodyW * 0.88, bodyY + bodyH * 0.55);
    ctx.lineTo(bodyX + bodyW + finW * 0.2, bodyY + bodyH * 0.75);
    ctx.lineTo(bodyX + bodyW * 0.82, bodyY + bodyH * 0.78);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    const winR = Math.max(3, Math.min(width, height) * 0.16);
    const winY = bodyY + bodyH * 0.32;
    const winGrad = ctx.createLinearGradient(cx - winR, winY - winR, cx + winR, winY + winR);
    winGrad.addColorStop(0, "#8fd8ff");
    winGrad.addColorStop(1, "#3aa0ff");
    ctx.fillStyle = winGrad;
    ctx.beginPath();
    ctx.arc(cx, winY, winR, 0, PI2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = CONFIG.COLORS.PLAYER.GUN || "#b20000";
    ctx.fillRect(
      cx - (CONFIG.PLAYER.DRAW.GUN_WIDTH || 3) / 2,
      bodyY + bodyH * 0.75,
      CONFIG.PLAYER.DRAW.GUN_WIDTH || 3,
      CONFIG.PLAYER.DRAW.GUN_HEIGHT || 8
    );

    const flameY = bodyY + bodyH + 2;
    const flameH = Math.max(8, height * 0.25);
    ctx.save();
    const flameGrad = ctx.createRadialGradient(cx, flameY, 2, cx, flameY + flameH, flameH);
    flameGrad.addColorStop(0, "rgba(255,220,80,0.95)");
    flameGrad.addColorStop(0.5, "rgba(255,120,40,0.85)");
    flameGrad.addColorStop(1, "rgba(255,60,20,0)");
    ctx.fillStyle = flameGrad;
    ctx.beginPath();
    ctx.moveTo(cx - bodyW * 0.25, bodyY + bodyH);
    ctx.lineTo(cx, bodyY + bodyH + flameH);
    ctx.lineTo(cx + bodyW * 0.25, bodyY + bodyH);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  /** @private */
  /**
   * @param {number} width
   * @param {number} height
   * @returns {{ canvas: OffscreenCanvas | HTMLCanvasElement, padX: number, padY: number } | null}
   */
  static _getSprite(width, height) {
    if (typeof width !== "number" || typeof height !== "number" || width <= 0 || height <= 0) {
      return null;
    }
    if (!Player._spriteCache) Player._spriteCache = new Map();
    const key = `${width.toFixed(2)}x${height.toFixed(2)}`;
    const cached = Player._spriteCache.get(key);
    if (cached) return cached;

    const padX = 4;
    const padY = 4;
    const flameH = Math.max(8, height * 0.25);
    const canvasWidth = Math.ceil(width + padX * 2);
    const canvasHeight = Math.ceil(height + flameH + padY * 2 + 2);
    let canvas;
    if (typeof OffscreenCanvas === "function") {
      canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
    } else {
      const elem = typeof document !== "undefined" ? document.createElement("canvas") : null;
      if (!elem) return null;
      elem.width = canvasWidth;
      elem.height = canvasHeight;
      canvas = elem;
    }
    const offCtx = canvas.getContext("2d");
    if (!offCtx) return null;
    offCtx.clearRect(0, 0, canvasWidth, canvasHeight);
    Player._drawShip(offCtx, width, height, padX, padY);
    const sprite = { canvas, padX, padY };
    Player._spriteCache.set(key, sprite);
    return sprite;
  }
}

/** @type {Map<string, { canvas: OffscreenCanvas | HTMLCanvasElement, padX: number, padY: number }> | undefined} */
Player._spriteCache = undefined;
