import { clamp } from "../constants.js";

/**
 * Where a pointer lands in the game: the canvas position on screen (client coords), the ship's
 * size (it limits where the ship's centre can go) and the playable area.
 * @typedef {{ rect:{ left:number, top:number }, ship:{ width:number, height:number }, view:{ width:number, height:number } }} PointerFrame
 */

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
   * @param {number} clientX Pointer position in client (viewport) coordinates.
   * @param {number} clientY
   * @param {PointerFrame} frame
   */
  aimAt(clientX, clientY, { rect, ship, view }) {
    const halfW = ship.width / 2;
    const halfH = ship.height / 2;
    this.mouse.x = clamp(clientX - rect.left, halfW, Math.max(halfW, view.width - halfW));
    this.mouse.y = clamp(clientY - rect.top, halfH, Math.max(halfH, view.height - halfH));
  }

  /** Reset mouse position. */
  clearMouse() {
    this.mouse.x = 0;
    this.mouse.y = 0;
  }
}
