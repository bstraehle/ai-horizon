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
   * Purpose: Register a callback to be invoked on future emits of the specified event.
   * Complexity: Amortized O(1) insertion into a Set.
   * Reentrancy: Safe to subscribe/unsubscribe other handlers inside a handler (snapshot emit model).
   * @param {import('../types.js').GameEvent} type Event identifier (string literal union).
   * @param {(payload: any)=>void} handler Invoked with the payload passed to emit.
   * @returns {()=>void} Unsubscribe function (idempotent: calling multiple times is safe).
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
   * Unsubscribe a previously registered handler.
   * Purpose: Stop receiving future emits for this event type.
   * Complexity: O(1) expected (Set.delete). Cleans up empty Sets to reclaim Map slots.
   * @param {import('../types.js').GameEvent} type Event identifier used during subscription.
   * @param {(payload: any)=>void} handler Exact function reference originally passed to on().
   * @returns {void}
   */
  off(type, handler) {
    const set = this._handlers.get(type);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) this._handlers.delete(type);
  }

  /**
   * Emit an event to all current handlers.
   * Purpose: Broadcast a payload to every subscribed listener at emit start time.
   * Snapshot Semantics: Captures handlers into an array first so modifications (on/off) during dispatch
   * do not affect which handlers run this cycle.
   * Error Handling: Individual handler errors are swallowed (fail-fast isolation) to protect the main loop.
   * Performance: O(n) where n = handler count for the event.
   * @param {import('../types.js').GameEvent} type Event identifier.
   * @param {any} payload Arbitrary data passed to each handler.
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
   * Clear handlers.
   * Purpose: Remove all handlers for a specific event, or all events when type omitted.
   * Use Cases: Level reset, test teardown, memory reclamation.
   * @param {import('../types.js').GameEvent=} type Optional event identifier; omit to clear entire bus.
   * @returns {void}
   */
  clear(type) {
    if (type) this._handlers.delete(type);
    else this._handlers.clear();
  }

  /**
   * Check presence of at least one handler for an event.
   * @param {import('../types.js').GameEvent} type Event identifier.
   * @returns {boolean} True if at least one handler currently registered.
   */
  has(type) {
    const set = this._handlers.get(type);
    return !!set && set.size > 0;
  }

  /**
   * Number of distinct event types with at least one handler.
   * @returns {number}
   */
  get size() {
    return this._handlers.size;
  }
}
