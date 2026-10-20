import { clamp, CONFIG } from "../constants.js";

/** @typedef {{ identifier:number, clientX:number, clientY:number }} TouchPoint */
/** @typedef {{ x:number, y:number, width:number, height:number }} Box */
/** @typedef {{ width:number, height:number }} ViewSize */

/**
 * TouchControls – multi-touch steering and firing, written into an InputState.
 *
 * Gestures:
 *  - The first finger down steers. It drags the ship relatively (like a trackpad): the pointer
 *    target starts at the ship's centre and moves by the finger's travel times DRAG_GAIN, so the
 *    ship never jumps to the finger or hides under the thumb. The steering finger never holds fire.
 *  - A steering touch that ends quickly without moving (TAP_MAX_MS / TAP_SLOP_PX) is a tap: `end`
 *    reports it so the caller fires one shot.
 *  - Every other finger fires: `fireHeld` stays true while at least one is down.
 *
 * The target is clamped to where the ship's centre can go, so reversing a drag at a screen edge
 * moves the ship back at once, and it stays positive (Player treats (0, 0) as "no pointer").
 */
export class TouchControls {
  /**
   * @param {() => import('./InputState.js').InputState} getInput Returns the InputState that
   *  receives the pointer target and fireHeld. Looked up on every event because a run reset
   *  replaces the game's InputState.
   * @param {{ DRAG_GAIN:number, TAP_MAX_MS:number, TAP_SLOP_PX:number }} [opts]
   */
  constructor(getInput, opts = CONFIG.INPUT.TOUCH) {
    this.getInput = getInput;
    this.opts = opts;
    /** @type {{ id:number, lastX:number, lastY:number, startX:number, startY:number, startMs:number, moved:boolean } | null} */
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
   * Track new fingers: the first becomes the steering finger, any others fire.
   * @param {ArrayLike<TouchPoint>} touches The event's `changedTouches`.
   * @param {Box} ship Current ship bounds (the drag starts from its centre).
   * @param {number} nowMs Event time in milliseconds.
   * @param {ArrayLike<TouchPoint>} [active] The event's `touches` (all fingers now down); tracked
   *  fingers missing from it (a lost touchend, e.g. when the app was backgrounded) are dropped.
   * @returns {boolean} Whether a firing finger went down (the caller fires immediately).
   */
  start(touches, ship, nowMs, active) {
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
          lastX: t.clientX,
          lastY: t.clientY,
          startX: t.clientX,
          startY: t.clientY,
          startMs: nowMs,
          moved: false,
        };
        this.getInput().mouse.x = ship.x + ship.width / 2;
        this.getInput().mouse.y = ship.y + ship.height / 2;
      } else {
        this.fireIds.add(t.identifier);
        fired = true;
      }
    }
    this.getInput().fireHeld = this.fireIds.size > 0;
    return fired;
  }

  /**
   * Move the pointer target by the steering finger's travel; other fingers are ignored.
   * @param {ArrayLike<TouchPoint>} touches The event's `changedTouches`.
   * @param {Box} ship Current ship bounds (its size limits where the centre can go).
   * @param {ViewSize} view Playable area.
   */
  move(touches, ship, view) {
    const s = this.steer;
    if (!s) return;
    const t = Array.from(touches).find((p) => p.identifier === s.id);
    if (!t) return;
    const gain = this.opts.DRAG_GAIN;
    const halfW = ship.width / 2;
    const halfH = ship.height / 2;
    const mouse = this.getInput().mouse;
    mouse.x = clamp(
      mouse.x + (t.clientX - s.lastX) * gain,
      halfW,
      Math.max(halfW, view.width - halfW)
    );
    mouse.y = clamp(
      mouse.y + (t.clientY - s.lastY) * gain,
      halfH,
      Math.max(halfH, view.height - halfH)
    );
    s.lastX = t.clientX;
    s.lastY = t.clientY;
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
