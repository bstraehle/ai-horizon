import { CONFIG } from "../constants.js";
import { LocalStorageAdapter } from "../adapters/LocalStorageAdapter.js";
import { prefersReducedMotion } from "../utils/motion.js";

/** Design box of the hint panel (logical px before scaling to the view). */
const PANEL_W = 220;
const PANEL_H = 112;
const INK = "#f6f7fa";
const DARK = "#0a0b0f";

/**
 * ControlsHint – shows how to fire until the pilot has done it once on this device.
 *
 * Nothing in the game explains the fire control, and on touch screens it is not guessable: the
 * first finger only steers, firing needs a second finger held down. The hint is a small panel of
 * pictograms on the playfield (no words, so it needs no translation):
 *  - touch: finger 1 with steering arrows + finger 2 with bolts rising from it;
 *  - desktop: the space bar / the left mouse button, under the same bolts.
 *
 * Lifecycle: `begin()` at every mission start arms it unless the control is already learned (or
 * the mission is flown by the autopilot, which keeps it out of recordings). `markLearned()`,
 * called by the input handlers when the fire control is used (a held second finger, the space
 * bar, the mouse button; a quick single-finger tap does not count, since it teaches nothing
 * about holding to fire), stores the flag and fades the hint out for good. `draw()` is
 * render-only: it fades with the real frame delta and never touches simulation state.
 */
export class ControlsHint {
  /**
   * @param {{ storage?: LocalStorageAdapter, key?: string }} [opts] Test seams.
   */
  constructor(opts = {}) {
    this._storage = opts.storage || new LocalStorageAdapter();
    this._key = opts.key || CONFIG.HINT.STORAGE_KEY;
    this._learned = this._storage.getJSON(this._key, /** @type {boolean} */ (false)) === true;
    /** Armed for the current mission. */
    this._armed = false;
    this._touch = false;
    this._alpha = 0;
    this._t = 0;
  }

  /** Whether the pilot has used the fire control on this device. */
  get learned() {
    return this._learned;
  }

  /** Whether the hint is on screen (including while it fades). */
  get visible() {
    return this._alpha > 0;
  }

  /**
   * Arm the hint for a new mission.
   * @param {{ touch?: boolean, enabled?: boolean }} [opts] `touch`: show the two-finger
   *   pictogram instead of the keyboard / mouse one; `enabled` false (autopilot) keeps it off.
   */
  begin({ touch = false, enabled = true } = {}) {
    this._armed = enabled && !this._learned;
    this._touch = !!touch;
    this._alpha = 0;
    this._t = 0;
  }

  /** Switch to the two-finger pictogram (a touch arrived on a device taken for a desktop). */
  useTouch() {
    this._touch = true;
  }

  /** The pilot used the fire control: remember it and let the hint fade out. */
  markLearned() {
    if (this._learned || !this._armed) return;
    this._learned = true;
    this._storage.setJSON(this._key, true);
  }

  /**
   * Fade toward shown (armed, not learned, mission running) or hidden, and paint the panel in
   * the upper part of the view, scaled to its width.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} viewWidth Logical view width.
   * @param {number} viewHeight Logical view height.
   * @param {number} dtSec Real frame delta (seconds).
   * @param {boolean} active Whether the mission is running.
   * @param {"red"|"blue"} [accent="red"] Run accent colour (the fire control and its bolts).
   */
  draw(ctx, viewWidth, viewHeight, dtSec, active, accent = "red") {
    const shown = this._armed && !this._learned && active;
    if (!shown && this._alpha <= 0) return;
    const step = dtSec / CONFIG.HINT.FADE_S;
    this._alpha = shown ? Math.min(1, this._alpha + step) : Math.max(0, this._alpha - step);
    this._t += dtSec;
    if (this._alpha <= 0 || !Number.isFinite(viewWidth) || !Number.isFinite(viewHeight)) return;

    const scale = Math.max(0.8, Math.min(1.25, viewWidth / 400));
    const color = accent === "blue" ? CONFIG.COLORS.ACCENT.BLUE : CONFIG.COLORS.ACCENT.RED;
    // The fire control breathes to draw the eye; steady under prefers-reduced-motion.
    const pulse = prefersReducedMotion() ? 1 : 0.5 + 0.5 * Math.sin(this._t * 5);
    ctx.save();
    ctx.translate((viewWidth - PANEL_W * scale) / 2, viewHeight * 0.3 - (PANEL_H * scale) / 2);
    ctx.scale(scale, scale);
    ctx.globalAlpha = this._alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    roundRect(ctx, 0, 0, PANEL_W, PANEL_H, 14);
    ctx.fillStyle = "rgba(10, 11, 15, 0.62)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (this._touch) paintTouch(ctx, color, pulse);
    else paintDesktop(ctx, color, pulse);
    ctx.restore();
  }
}

/**
 * Trace a rounded rectangle.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} r
 */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Three bolts rising from (cx, y): the "fire" sign above a control.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} y Bottom of the middle bolt.
 * @param {string} color
 */
function paintBolts(ctx, cx, y, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (const [dx, dy] of [
    [-9, 6],
    [0, 0],
    [9, 6],
  ]) {
    ctx.moveTo(cx + dx, y + dy);
    ctx.lineTo(cx + dx, y + dy - 11);
  }
  ctx.stroke();
}

/**
 * A finger pointing up with its number on it and a touch ring around the tip.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {string} label
 * @param {string} ring Ring colour.
 * @param {number} ringRadius
 */
function paintFinger(ctx, cx, label, ring, ringRadius) {
  roundRect(ctx, cx - 9, 46, 18, 56, 9);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.fillStyle = DARK;
  ctx.font = "700 13px system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, cx, 84);
  ctx.strokeStyle = ring;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, 55, ringRadius, 0, CONFIG.TWO_PI);
  ctx.stroke();
}

/**
 * Touch pictogram: finger 1 steers (arrows), finger 2, held down as well, fires (bolts).
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} color Accent colour.
 * @param {number} pulse 0..1.
 */
function paintTouch(ctx, color, pulse) {
  paintFinger(ctx, 62, "1", INK, 15);
  ctx.fillStyle = INK;
  ctx.beginPath();
  for (const [ax, ay, bx, by, cx, cy] of [
    [62, 23, 57, 31, 67, 31],
    [32, 55, 40, 50, 40, 60],
    [92, 55, 84, 50, 84, 60],
  ]) {
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(cx, cy);
    ctx.closePath();
  }
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(104, 58);
  ctx.lineTo(116, 58);
  ctx.moveTo(110, 52);
  ctx.lineTo(110, 64);
  ctx.stroke();
  paintFinger(ctx, 158, "2", color, 15 + 3 * pulse);
  paintBolts(ctx, 158, 26, color);
}

/**
 * Desktop pictogram: the space bar or the left mouse button fires (bolts above them).
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} color Accent colour.
 * @param {number} pulse 0..1.
 */
function paintDesktop(ctx, color, pulse) {
  const alpha = ctx.globalAlpha;
  paintBolts(ctx, 110, 30, color);
  // Space bar: a wide keycap with the open-box "space" sign, outlined in the accent colour.
  roundRect(ctx, 22, 56, 104, 30, 7);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.globalAlpha = alpha * (0.45 + 0.55 * pulse);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = DARK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(58, 68);
  ctx.lineTo(58, 76);
  ctx.lineTo(90, 76);
  ctx.lineTo(90, 68);
  ctx.stroke();
  // "or"
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.moveTo(140, 88);
  ctx.lineTo(150, 54);
  ctx.stroke();
  // Mouse with its left button in the accent colour.
  roundRect(ctx, 164, 46, 32, 50, 14);
  ctx.fillStyle = INK;
  ctx.fill();
  ctx.globalAlpha = alpha * (0.45 + 0.55 * pulse);
  ctx.beginPath();
  ctx.moveTo(180, 46);
  ctx.lineTo(180, 68);
  ctx.lineTo(164, 68);
  ctx.lineTo(164, 60);
  ctx.arcTo(164, 46, 178, 46, 14);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = DARK;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(180, 46);
  ctx.lineTo(180, 68);
  ctx.moveTo(164, 68);
  ctx.lineTo(196, 68);
  ctx.stroke();
}
