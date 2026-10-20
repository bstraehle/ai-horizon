import { CONFIG } from "../constants.js";

/** @typedef {{ identifier:number, clientX:number, clientY:number }} TouchPoint */
/** @typedef {import('./InputState.js').PointerFrame} TouchFrame */

/**
 * TouchControls – multi-touch steering and firing, written into an InputState.
 *
 * Gestures:
 *  - The first finger down steers: the ship's centre follows that finger (same lerp as the mouse).
 *    The steering finger never holds fire, so moving costs no accuracy.
 *  - A steering touch that ends quickly without moving (TAP_MAX_MS / TAP_SLOP_PX) is a tap: `end`
 *    reports it so the caller fires one shot.
 *  - Every other finger fires: `fireHeld` stays true while at least one is down.
 *
 * Aiming goes through `InputState.aimAt`, which clamps the target to the ship's reach.
 */
export class TouchControls {
  /**
   * @param {() => import('./InputState.js').InputState} getInput Returns the InputState that
   *  receives the pointer target and fireHeld. Looked up on every event because a run reset
   *  replaces the game's InputState.
   * @param {{ TAP_MAX_MS:number, TAP_SLOP_PX:number }} [opts]
   */
  constructor(getInput, opts = CONFIG.INPUT.TOUCH) {
    this.getInput = getInput;
    this.opts = opts;
    /** @type {{ id:number, startX:number, startY:number, startMs:number, moved:boolean } | null} */
    this.steer = null;
    /** @type {Set<number>} */
    this.fireIds = new Set();
  }

  /** Forget all tracked fingers and release fire (e.g. at the start of a run). */
  reset() {
    this.steer = null;
    this.fireIds.clear();
    this.getInput().fireHeld = false;
  }

  /**
   * Track new fingers: the first becomes the steering finger (the ship heads to it), any others
   * fire.
   * @param {ArrayLike<TouchPoint>} touches The event's `changedTouches`.
   * @param {TouchFrame} frame
   * @param {number} nowMs Event time in milliseconds.
   * @param {ArrayLike<TouchPoint>} [active] The event's `touches` (all fingers now down); tracked
   *  fingers missing from it (a lost touchend, e.g. when the app was backgrounded) are dropped.
   * @returns {boolean} Whether a firing finger went down (the caller fires immediately).
   */
  start(touches, frame, nowMs, active) {
    if (active) {
      const down = new Set(Array.from(active, (t) => t.identifier));
      if (this.steer && !down.has(this.steer.id)) this.steer = null;
      for (const id of this.fireIds) if (!down.has(id)) this.fireIds.delete(id);
    }
    let fired = false;
    for (const t of Array.from(touches)) {
      if (!this.steer) {
        this.steer = {
          id: t.identifier,
          startX: t.clientX,
          startY: t.clientY,
          startMs: nowMs,
          moved: false,
        };
        this.getInput().aimAt(t.clientX, t.clientY, frame);
      } else {
        this.fireIds.add(t.identifier);
        fired = true;
      }
    }
    this.getInput().fireHeld = this.fireIds.size > 0;
    return fired;
  }

  /**
   * Point the ship at the steering finger; other fingers are ignored.
   * @param {ArrayLike<TouchPoint>} touches The event's `changedTouches`.
   * @param {TouchFrame} frame
   */
  move(touches, frame) {
    const s = this.steer;
    if (!s) return;
    const t = Array.from(touches).find((p) => p.identifier === s.id);
    if (!t) return;
    this.getInput().aimAt(t.clientX, t.clientY, frame);
    if (Math.hypot(t.clientX - s.startX, t.clientY - s.startY) > this.opts.TAP_SLOP_PX)
      s.moved = true;
  }

  /**
   * Release lifted / cancelled fingers.
   * @param {ArrayLike<TouchPoint>} touches The event's `changedTouches`.
   * @param {number} nowMs Event time in milliseconds.
   * @param {boolean} [cancelled=false] True for `touchcancel` (never counts as a tap).
   * @returns {boolean} Whether the steering finger ended as a tap (the caller fires one shot).
   */
  end(touches, nowMs, cancelled = false) {
    let tap = false;
    for (const t of Array.from(touches)) {
      const s = this.steer;
      if (s && t.identifier === s.id) {
        tap = !cancelled && !s.moved && nowMs - s.startMs <= this.opts.TAP_MAX_MS;
        this.steer = null;
      } else {
        this.fireIds.delete(t.identifier);
      }
    }
    this.getInput().fireHeld = this.fireIds.size > 0;
    return tap;
  }
}
