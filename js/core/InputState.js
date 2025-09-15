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

  /** Reset mouse position. */
  clearMouse() {
    this.mouse.x = 0;
    this.mouse.y = 0;
  }
}
