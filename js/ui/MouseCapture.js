/**
 * MouseCapture – Pointer Lock wrapper for desktop mouse steering.
 *
 * While captured, the cursor is hidden and confined to the page, so mouse motion keeps steering
 * even where a free cursor would have left the window (e.g. sliding along the bottom edge).
 * Browsers only grant a lock from a user gesture, always release it on Esc / tab switch, and
 * ignore re-requests for about a second after the user released it; failed requests are silent
 * and the next gesture simply tries again.
 *
 * `onChange(locked)` fires on every lock gain / loss, whether requested here or forced by the
 * browser. Where Pointer Lock is unavailable, `request` is a no-op and `locked` stays false.
 */
export class MouseCapture {
  /**
   * @param {HTMLElement} target Element to lock (the game canvas).
   * @param {(locked: boolean) => void} onChange
   * @param {Document} [doc]
   */
  constructor(target, onChange, doc = target.ownerDocument) {
    this.target = target;
    this.doc = doc;
    this.onChange = onChange;
    this._wasLocked = false;
    this._onLockChange = () => {
      const locked = this.locked;
      if (locked === this._wasLocked) return;
      this._wasLocked = locked;
      this.onChange(locked);
    };
    doc.addEventListener("pointerlockchange", this._onLockChange);
  }

  /** @returns {boolean} Whether the target currently holds the pointer lock. */
  get locked() {
    return !!this.doc.pointerLockElement && this.doc.pointerLockElement === this.target;
  }

  /** Ask for the lock (call from a mouse gesture handler); no-op when locked or unsupported. */
  request() {
    if (this.locked || typeof this.target.requestPointerLock !== "function") return;
    try {
      const pending = /** @type {any} */ (this.target.requestPointerLock());
      if (pending && typeof pending.catch === "function") pending.catch(() => {});
    } catch {
      /* denied (no gesture / cooldown); the next gesture retries */
    }
  }

  /** Give the cursor back; no-op when not locked. */
  release() {
    if (!this.locked) return;
    try {
      this.doc.exitPointerLock();
    } catch {
      /* ignore */
    }
  }

  /** Remove the document listener. */
  dispose() {
    this.doc.removeEventListener("pointerlockchange", this._onLockChange);
  }
}

/**
 * @param {Event|undefined} e
 * @returns {boolean} Whether `e` came from a mouse (clicks are PointerEvents in modern browsers),
 *  so taps and keyboard activation never capture the pointer.
 */
export function isMouseEvent(e) {
  return !!e && /** @type {any} */ (e).pointerType === "mouse";
}
