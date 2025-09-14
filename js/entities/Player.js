import { clamp, CONFIG, PI2 } from "../constants.js";
/** @typedef {{ [code:string]: boolean }} KeyMap */
/** @typedef {{ x:number, y:number }} Point */
/** @typedef {{ width:number, height:number }} ViewSize */

/**
 * Player – user controlled ship handling input-driven movement and rendering.
 *
 * Movement:
 * - Keyboard: WASD / Arrow cluster with fixed speed per axis.
 * - Mouse: Smoothly lerps toward cursor (centered) when no movement keys pressed.
 *
 * Rendering draws an emoji‑inspired rocket (body, fins, cockpit, flame) using canvas primitives.
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

  /** Update position from keyboard or mouse.
   * @param {KeyMap} input @param {Point} mousePos @param {ViewSize} view @param {number} [dtSec]
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
   * Draw the player rocket.
   * Layers (in order):
   * 1. Body with vertical gradient + outline
   * 2. Side fins (mirrored) sharing stroke for coherence
   * 3. Cockpit window radial-ish gradient
   * 4. Gun/nozzle rectangle
   * 5. Engine flame with radial gradient + triangle mask
   * @param {CanvasRenderingContext2D} ctx
   */
  draw(ctx) {
    // Draw a rounded rocket that resembles the 🚀 emoji:
    // - white/gray rounded body
    // - red side fins
    // - blue circular cockpit/window
    // - small engine flame and glow at the bottom
    ctx.save();
    const cx = this.x + this.width / 2;
    const topY = this.y;
    const bodyW = Math.max(8, this.width * 0.6);
    const bodyH = Math.max(12, this.height * 0.9);
    const bodyX = cx - bodyW / 2;
    const bodyY = topY + (this.height - bodyH) / 2;

    // Body gradient (white -> light gray) to mimic emoji shading
    const bodyGrad = ctx.createLinearGradient(bodyX, bodyY, bodyX, bodyY + bodyH);
    bodyGrad.addColorStop(0, "#ffffff");
    bodyGrad.addColorStop(0.6, "#f0f0f0");
    bodyGrad.addColorStop(1, "#d9d9d9");

    // Rocket body (rounded symmetrical shape)
    ctx.beginPath();
    ctx.moveTo(cx, bodyY); // nose
    // right side curve
    ctx.quadraticCurveTo(
      bodyX + bodyW * 1.05,
      bodyY + bodyH * 0.2,
      bodyX + bodyW * 0.9,
      bodyY + bodyH * 0.5
    );
    ctx.quadraticCurveTo(bodyX + bodyW * 1.05, bodyY + bodyH * 0.8, cx, bodyY + bodyH);
    // left side curve
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

    // Outline
    ctx.strokeStyle = CONFIG.COLORS.PLAYER.OUTLINE || "#999";
    ctx.lineWidth = CONFIG.PLAYER.DRAW.OUTLINE_WIDTH || 2;
    ctx.stroke();

    // Side fins (red)
    const finW = bodyW * 0.6;
    ctx.fillStyle = "#d94141"; // emoji-like red
    ctx.beginPath();
    // left fin
    ctx.moveTo(bodyX + bodyW * 0.12, bodyY + bodyH * 0.55);
    ctx.lineTo(bodyX - finW * 0.2, bodyY + bodyH * 0.75);
    ctx.lineTo(bodyX + bodyW * 0.18, bodyY + bodyH * 0.78);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // right fin
    ctx.beginPath();
    ctx.moveTo(bodyX + bodyW * 0.88, bodyY + bodyH * 0.55);
    ctx.lineTo(bodyX + bodyW + finW * 0.2, bodyY + bodyH * 0.75);
    ctx.lineTo(bodyX + bodyW * 0.82, bodyY + bodyH * 0.78);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cockpit/window (blue circle)
    const winR = Math.max(3, Math.min(this.width, this.height) * 0.16);
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

    // Small gun / nozzle - keep a subtle rectangle like before but smaller
    ctx.fillStyle = CONFIG.COLORS.PLAYER.GUN || "#b20000";
    ctx.fillRect(
      cx - (CONFIG.PLAYER.DRAW.GUN_WIDTH || 3) / 2,
      bodyY + bodyH * 0.75,
      CONFIG.PLAYER.DRAW.GUN_WIDTH || 3,
      CONFIG.PLAYER.DRAW.GUN_HEIGHT || 8
    );

    // Engine flame (triangle with radial glow)
    const flameY = bodyY + bodyH + 2;
    const flameH = Math.max(8, this.height * 0.25);
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

  /** Returns the axis-aligned bounding box for collisions. */
  getBounds() {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }

  // (engine glow helper removed; visuals provided by EngineTrail)
}
