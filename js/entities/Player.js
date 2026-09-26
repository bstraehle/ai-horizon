import { clamp, CONFIG } from "../constants.js";
import { prefersReducedMotion } from "../utils/motion.js";
/** @typedef {{ [code:string]: boolean }} KeyMap */
/** @typedef {{ x:number, y:number }} Point */
/** @typedef {{ width:number, height:number }} ViewSize */

/** Maximum visual bank (rad) at full lateral speed and how quickly the bank follows velocity. */
const MAX_BANK = 0.42;
const BANK_RESPONSE = 9;

/**
 * Player – user-controlled ship (movement + drawing only; side-effects externalized).
 *
 * Responsibilities:
 *  - Reconcile keyboard vs mouse steering (keyboard dominance to avoid jitter).
 *  - Clamp position to dynamic view bounds each frame.
 *  - Provide bounding box for collision queries.
 *  - Draw a flat arrowhead fighter (white hull with one hard shadow facet, dark canopy, accent
 *    engine flame) from a cached sprite per run accent; the sprite is drawn slightly larger than
 *    the hitbox (forgiving collisions).
 *
 * Input Precedence:
 *  - If any movement key pressed (arrows / WASD) => keyboard path, ignore mouse.
 *  - Else, smooth-lerp center toward mouse (CONFIG.PLAYER.MOUSE_LERP factor per second).
 *
 * Banking:
 *  - `_bank` (render-only) eases toward the lateral velocity fraction each update; `draw` leans
 *    the sprite (slight rotation + horizontal squash). Disabled under prefers-reduced-motion.
 *
 * Performance Notes:
 *  - Update: O(1) arithmetic + clamp; no allocations.
 *  - Draw: one drawImage (plus a save/transform/restore while banking).
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
    /** Velocity of the last simulated step (px/sec); render-only hint for extrapolation. */
    this.vx = 0;
    this.vy = 0;
    /** @private Playable bounds captured from the last update (render-side clamp). */
    this._maxX = Infinity;
    /** @private */
    this._maxY = Infinity;
    /** @private Eased lateral lean in [-1, 1] (render-only). */
    this._bank = 0;
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
    const prevX = this.x;
    const prevY = this.y;
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
    this._maxX = Math.max(0, view.width - this.width);
    this._maxY = Math.max(0, view.height - this.height);
    this.x = clamp(this.x, 0, this._maxX);
    this.y = clamp(this.y, 0, this._maxY);
    if (dtSec > 0) {
      this.vx = (this.x - prevX) / dtSec;
      this.vy = (this.y - prevY) / dtSec;
      const target = this.speed > 0 ? clamp(this.vx / this.speed, -1, 1) : 0;
      this._bank += (target - this._bank) * Math.min(1, dtSec * BANK_RESPONSE);
    }
  }

  /**
   * Draw the ship (cached sprite; direct vector fallback), leaning into lateral motion.
   * @param {CanvasRenderingContext2D} ctx 2D context.
   * @param {number} [extrapolateSec=0] Seconds past the last simulated state; the last step's
   *  velocity is projected forward (clamped to the playable bounds) for smooth motion.
   * @param {"red"|"blue"} [accent="red"] Run accent colour (engine flame); follows the nebula palette.
   */
  draw(ctx, extrapolateSec = 0, accent = "red") {
    let x = this.x;
    let y = this.y;
    if (extrapolateSec > 0) {
      x = clamp(x + this.vx * extrapolateSec, 0, this._maxX);
      y = clamp(y + this.vy * extrapolateSec, 0, this._maxY);
    }
    const bank = prefersReducedMotion() ? 0 : this._bank;
    const sprite = Player._getSprite(this.width, this.height, accent);
    if (Math.abs(bank) < 0.02) {
      if (sprite) ctx.drawImage(sprite.canvas, x - sprite.padX, y - sprite.padY);
      else Player._drawShip(ctx, this.width, this.height, x, y, accent);
      return;
    }
    const cx = x + this.width / 2;
    const cy = y + this.height / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(bank * MAX_BANK * 0.55);
    ctx.scale(1 - 0.28 * Math.abs(bank), 1);
    if (sprite) {
      ctx.drawImage(sprite.canvas, -this.width / 2 - sprite.padX, -this.height / 2 - sprite.padY);
    } else {
      Player._drawShip(ctx, this.width, this.height, -this.width / 2, -this.height / 2, accent);
    }
    ctx.restore();
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
   * @param {"red"|"blue"} [accent="red"] Run accent colour for the engine flame.
   */
  static _drawShip(ctx, width, height, originX, originY, accent = "red") {
    const P = CONFIG.COLORS.PLAYER;
    const flame = accent === "blue" ? CONFIG.COLORS.ACCENT.BLUE : CONFIG.COLORS.ACCENT.RED;
    // Design unit: the hitbox size, drawn ~10% larger so the ship reads clearly while collisions
    // stay forgiving (the visual extends past the box, never the other way round).
    const u = Math.min(width, height) * 1.1;
    const cx = originX + width / 2;
    const top = originY - u * 0.1; // nose pokes slightly above the hitbox
    const bottom = originY + height + u * 0.06;
    ctx.save();
    ctx.lineJoin = "round";

    // Engine flame (behind the hull): accent triangle with a white core.
    const tailY = bottom - u * 0.2;
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(cx - u * 0.17, tailY);
    ctx.lineTo(cx + u * 0.17, tailY);
    ctx.lineTo(cx, bottom + u * 0.26);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.moveTo(cx - u * 0.07, tailY);
    ctx.lineTo(cx + u * 0.07, tailY);
    ctx.lineTo(cx, bottom + u * 0.04);
    ctx.closePath();
    ctx.fill();

    // Hull: one arrowhead silhouette with a hard shadow facet on the right half.
    const traceHull = () => {
      ctx.beginPath();
      ctx.moveTo(cx, top);
      ctx.lineTo(cx + u * 0.72, bottom - u * 0.12);
      ctx.lineTo(cx + u * 0.26, bottom - u * 0.28);
      ctx.lineTo(cx, tailY);
      ctx.lineTo(cx - u * 0.26, bottom - u * 0.28);
      ctx.lineTo(cx - u * 0.72, bottom - u * 0.12);
      ctx.closePath();
    };
    ctx.save();
    traceHull();
    ctx.fillStyle = P.HULL;
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = P.HULL_SHADE;
    ctx.fillRect(cx + u * 0.02, top - u, u * 2, u * 3);
    ctx.restore();
    traceHull();
    ctx.strokeStyle = P.OUTLINE;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Canopy: small dark triangle set back from the nose.
    ctx.fillStyle = P.COCKPIT;
    ctx.beginPath();
    ctx.moveTo(cx, originY + height * 0.22);
    ctx.lineTo(cx + u * 0.1, originY + height * 0.52);
    ctx.lineTo(cx - u * 0.1, originY + height * 0.52);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  /** @private */
  /**
   * @param {number} width
   * @param {number} height
   * @param {"red"|"blue"} [accent="red"]
   * @returns {{ canvas: OffscreenCanvas | HTMLCanvasElement, padX: number, padY: number } | null}
   */
  static _getSprite(width, height, accent = "red") {
    if (typeof width !== "number" || typeof height !== "number" || width <= 0 || height <= 0) {
      return null;
    }
    if (!Player._spriteCache) Player._spriteCache = new Map();
    const key = `${width.toFixed(2)}x${height.toFixed(2)}|${accent}`;
    const cached = Player._spriteCache.get(key);
    if (cached) return cached;

    // Wings and the flame extend past the hitbox; pad the sprite accordingly.
    const u = Math.min(width, height);
    const padX = Math.ceil(u * 0.35 + 3);
    const padY = Math.ceil(u * 0.15 + 3);
    const canvasWidth = Math.ceil(width + padX * 2);
    const canvasHeight = Math.ceil(height + padY * 2 + u * 0.4);
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
    Player._drawShip(offCtx, width, height, padX, padY, accent);
    const sprite = { canvas, padX, padY };
    Player._spriteCache.set(key, sprite);
    return sprite;
  }
}

/** @type {Map<string, { canvas: OffscreenCanvas | HTMLCanvasElement, padX: number, padY: number }> | undefined} */
Player._spriteCache = undefined;
