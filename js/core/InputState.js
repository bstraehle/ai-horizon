/** Centralized input state for keys, pointer, and firing. */
export class InputState {
  constructor() {
    /** @type {Record<string, boolean>} */
    this.keys = {};
    /** @type {{ x:number, y:number }} */
    this.mouse = { x: 0, y: 0 };
    /** @type {boolean} */
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
