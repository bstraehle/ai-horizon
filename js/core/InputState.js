import { clamp } from "../constants.js";

/**
 * Where a pointer lands in the game: the canvas position on screen (client coords), the ship's
 * size (it limits where the ship's centre can go) and the playable area.
 * @typedef {{ rect:{ left:number, top:number }, ship:{ width:number, height:number }, view:{ width:number, height:number } }} PointerFrame
 */

/**
 * @private Map a pointer coordinate on one axis to the ship-centre target (see `aimAt`).
 * @param {number} p Pointer position on the axis (canvas px).
 * @param {number} size Playable size on the axis.
 * @param {number} half Half the ship's size on the axis.
 * @param {number} margin Edge margin in px.
 * @returns {number}
 */
function aimAxis(p, size, half, margin) {
  const reach = Math.max(0, size - 2 * half);
  const m = Math.max(half, margin);
  const band = size - 2 * m;
  const target = band > 0 ? half + ((p - m) * reach) / band : p;
  return clamp(target, half, half + reach);
}

/**
 * InputState – mutable snapshot of current user input (keys, pointer, fire hold).
 *
 * Design:
 * - Simple POJO style container mutated by InputManager handlers each frame.
 * - Queried by gameplay systems to avoid direct DOM event reliance mid‑loop.
 * - Kept intentionally minimal; no getters/setters to reduce overhead in hot paths.
 */
export class InputState {
  constructor() {
    /** @type {Record<string, boolean>} */
    this.keys = {};
    /** @type {{ x:number, y:number }} */
    this.mouse = { x: 0, y: 0 };
    /**
     * True while the primary fire control is held (mouse, touch, or key).
     * Updated by input handlers; consumed by game update for continuous firing.
     * @type {boolean}
     */
    this.fireHeld = false;
  }

  /**
   * Set a key state by code.
   * @param {string} code
   * @param {boolean} down
   */
  setKey(code, down) {
    this.keys[code] = !!down;
  }

  /**
   * Point the ship at a mouse / touch position, clamped to where the ship's centre can go. The
   * clamp keeps steering alive when the pointer sits on or beyond a canvas edge (or over the HUD),
   * and keeps the target positive, since Player treats (0, 0) as "no pointer".
   *
   * With an edge margin, the band [margin, size - margin] is stretched over the ship's reach, so
   * the ship meets each edge while the pointer is still `margin` px inside (a mouse cursor that
   * leaves the window stops sending events). The centre maps to itself.
   * @param {number} clientX Pointer position in client (viewport) coordinates.
   * @param {number} clientY
   * @param {PointerFrame} frame
   * @param {number} [margin=0] Edge margin in px; 0 puts the ship's centre exactly on the pointer.
   */
  aimAt(clientX, clientY, { rect, ship, view }, margin = 0) {
    this.mouse.x = aimAxis(clientX - rect.left, view.width, ship.width / 2, margin);
    this.mouse.y = aimAxis(clientY - rect.top, view.height, ship.height / 2, margin);
  }

  /**
   * Move the pointer target by a relative mouse motion (captured mouse), clamped to the ship's
   * reach: pushing past an edge keeps the ship there, and moving along it slides at once. With no
   * target yet (0, 0), the motion starts from the ship's centre.
   * @param {number} dx
   * @param {number} dy
   * @param {{ ship:{ x:number, y:number, width:number, height:number }, view:{ width:number, height:number } }} frame
   */
  nudge(dx, dy, { ship, view }) {
    const halfW = ship.width / 2;
    const halfH = ship.height / 2;
    if (this.mouse.x <= 0 && this.mouse.y <= 0) {
      this.mouse.x = ship.x + halfW;
      this.mouse.y = ship.y + halfH;
    }
    this.mouse.x = clamp(this.mouse.x + dx, halfW, Math.max(halfW, view.width - halfW));
    this.mouse.y = clamp(this.mouse.y + dy, halfH, Math.max(halfH, view.height - halfH));
  }

  /** Reset mouse position. */
  clearMouse() {
    this.mouse.x = 0;
    this.mouse.y = 0;
  }
}
