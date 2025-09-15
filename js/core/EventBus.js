/**
 * EventBus – tiny pub/sub for decoupling systems.
 *
 * Characteristics:
 * - O(1) typical add/remove using Map<event, Set<handler>>.
 * - Snapshot array on emit => safe reentrant subscribe/unsubscribe during dispatch.
 * - Swallows handler errors to protect the frame loop (log externally for diagnostics).
 *
 * Usage (Game typed events): events enumerated via the `GameEvent` union in `types.js` for IDE hints.
 *
 * @example
 * const bus = new EventBus();
 * const off = bus.on('playerHitAsteroid', (p) => console.log(p));
 * // Emit with a minimal payload shape (fields elided for brevity)
 * bus.emit('playerHitAsteroid', { asteroid: { x:0, y:0, width:10, height:10 } });
 * off(); // unsubscribe
 *
 * Higher‑level side effects live in `systems/EventHandlers.js` to keep gameplay orchestration auditable.
 */
export class EventBus {
  constructor() {
    /** @type {Map<import('../types.js').GameEvent, Set<Function>>} */
    this._handlers = new Map();
  }

  /**
   * Subscribe a handler to an event type.
   * @param {import('../types.js').GameEvent} type
   * @param {(payload: any)=>void} handler
   * @returns {()=>void} Unsubscribe function
   */
  on(type, handler) {
    let set = this._handlers.get(type);
    if (!set) {
      set = new Set();
      this._handlers.set(type, set);
    }
    set.add(handler);
    return () => this.off(type, handler);
  }

  /**
   * Unsubscribe a handler from an event type.
   * @param {import('../types.js').GameEvent} type
   * @param {(payload: any)=>void} handler
   * @returns {void}
   */
  off(type, handler) {
    const set = this._handlers.get(type);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) this._handlers.delete(type);
  }

  /**
   * Emit an event to all subscribed handlers.
   * @param {import('../types.js').GameEvent} type
   * @param {any} payload
   * @returns {void}
   */
  emit(type, payload) {
    const set = this._handlers.get(type);
    if (!set || set.size === 0) return; // Fast path: no listeners
    // Snapshot to ensure all handlers at emit start run even if some unsubscribe
    const handlers = Array.from(set);
    for (const fn of handlers) {
      try {
        fn(payload);
      } catch (_) {
        // Swallow handler errors so one bad listener doesn't break the loop
      }
    }
  }

  /**
   * Clear handlers for a specific type or all handlers when omitted.
   * @param {import('../types.js').GameEvent=} type
   * @returns {void}
   */
  clear(type) {
    if (type) this._handlers.delete(type);
    else this._handlers.clear();
  }

  /**
   * Test if at least one handler is registered for type.
   * @param {import('../types.js').GameEvent} type
   * @returns {boolean}
   */
  has(type) {
    const set = this._handlers.get(type);
    return !!set && set.size > 0;
  }

  /** Total number of distinct event types currently tracked. */
  get size() {
    return this._handlers.size;
  }
}
