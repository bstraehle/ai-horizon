/**
 * ObjectPool – allocation avoidance & lifecycle reuse for short‑lived, homogeneous game objects.
 *
 * Purpose
 * -------
 * Centralizes object reuse to keep GC pauses negligible during peak gameplay. Particularly useful
 * for frequently spawned ephemeral entities (bullets, particles, explosions) whose construction
 * cost and garbage churn would otherwise accumulate.
 *
 * Behavior & API
 * --------------
 * - acquire(...args): Returns a recycled or freshly created instance and reinitializes it using:
 *     1) Instance method obj.reset(...args) if present.
 *     2) Provided pool resetFn(obj, ...args) otherwise.
 * - release(obj): Returns an object to the free list if capacity allows; optionally disposes overflow.
 * - warmUp(n, ...args): Pre-fills pool with up to n reset objects.
 * - clear(disposeAll): Drops free objects, optionally disposing each.
 * - Introspection getters (freeCount, hasFree, createdCount, remainingCapacity) support metrics / tests.
 *
 * Performance
 * -----------
 * - acquire: Amortized O(1) (single pop or factory call + optional reset).
 * - release: O(1) push; disposal path only for overflow.
 * - warmUp: O(n) upfront to reduce first-use spikes.
 * - Memory bounded by maxSize + live in‑use objects.
 *
 * Determinism
 * -----------
 * Deterministic state reinitialization depends entirely on reset logic supplied; pool itself adds no
 * randomness. Ordering of recycled objects is LIFO (stack semantics) to favor cache locality.
 *
 * Failure Modes / Defensive Notes
 * -------------------------------
 * - Throws if createFn returns a falsy value (prevents silent invalid objects entering circulation).
 * - Swallows disposer exceptions to avoid cascading failures during cleanup.
 * - Passing null/undefined to release is ignored (guard fast path).
 *
 * Usage Example
 * -------------
 * const bulletPool = new ObjectPool(
 *   (x, y) => new Bullet(x, y),
 *   (b, x, y) => { b.x = x; b.y = y; b.alive = true; },
 *   { maxSize: 512 }
 * );
 * const b = bulletPool.acquire(10, 20);
 * // ... use bullet ...
 * bulletPool.release(b);
 *
 * @template T
 */
export class ObjectPool {
  /**
   * Construct a new ObjectPool.
   * @param {(...args:any[])=>T} createFn Factory for new objects when the pool is empty.
   * @param {(obj:T, ...args:any[])=>void} [resetFn] Optional fallback reset logic when instance lacks its own reset.
   * @param {{ maxSize?: number, dispose?: (obj:T)=>void }} [opts] Configuration: maxSize soft cap & optional disposer.
   */
  constructor(createFn, resetFn, opts) {
    this._create = createFn;
    this._reset = resetFn || null;
    /** @type {T[]} */
    this._free = [];
    this._maxSize =
      opts && typeof opts.maxSize === "number" ? Math.max(0, opts.maxSize | 0) : Infinity;
    this._dispose = opts && typeof opts.dispose === "function" ? opts.dispose : null;
    this._created = 0;
  }

  /**
   * Acquire an object (recycle or create) and reinitialize it.
   * Contract: Always returns a valid object or throws (never null/undefined).
   * @param {...any} args Initialization args forwarded to reset path.
   * @returns {T}
   */
  acquire(...args) {
    let obj;
    if (this._free.length > 0) {
      // @ts-ignore - known non-null after length check
      obj = this._free.pop();
    } else {
      obj = this._create(...args);
      this._created++;
    }
    if (!obj) {
      throw new Error("ObjectPool: createFn returned falsy value");
    }
    // @ts-ignore - duck-typed reset method
    if (typeof obj.reset === "function") {
      // @ts-ignore
      obj.reset(...args);
    } else if (this._reset) {
      this._reset(obj, ...args);
    }
    return /** @type {T} */ (obj);
  }

  /**
   * Return an object to the pool. If capacity exceeded, optionally disposes instead.
   * No-op for null/undefined inputs.
   * @param {T} obj
   */
  release(obj) {
    if (obj === null || obj === undefined) return;
    if (this._free.length < this._maxSize) {
      this._free.push(obj);
    } else if (this._dispose) {
      try {
        this._dispose(obj);
      } catch {
        /* noop */
      }
    }
  }

  /** Number of currently cached (free) objects. */
  get freeCount() {
    return this._free.length;
  }

  /** True if at least one free object is available (fast path hint). */
  get hasFree() {
    return this._free.length > 0;
  }

  /** Total number of objects ever created by this pool. */
  get createdCount() {
    return this._created;
  }

  /** Remaining capacity before hitting maxSize (Infinity -> Number.POSITIVE_INFINITY). */
  get remainingCapacity() {
    if (this._maxSize === Infinity) return Number.POSITIVE_INFINITY;
    return Math.max(0, this._maxSize - this._free.length);
  }

  /**
   * Pre-allocate (and reset) up to N instances, bounded by remaining capacity.
   * Useful to eliminate first-interaction spikes in latency-critical artifacts.
   * @param {number} n Desired number of objects to provision.
   * @param {...any} args Args forwarded to factory for construction (not reset path here by design).
   */
  warmUp(n, ...args) {
    const count = Math.max(0, n | 0);
    const capacity = Math.max(
      0,
      Math.min(count, this._maxSize === Infinity ? count : this._maxSize - this._free.length)
    );
    for (let i = 0; i < capacity; i++) {
      const obj = this._create(...args);
      this._created++;
      this._free.push(obj);
    }
  }

  /**
   * Clear the free list. Optionally dispose each freed object (best-effort; disposer errors ignored).
   * In-use objects remain untouched and can later be released into an empty pool.
   * @param {boolean} [disposeAll=false]
   */
  clear(disposeAll = false) {
    if (disposeAll && this._dispose) {
      for (let i = 0; i < this._free.length; i++) {
        const obj = this._free[i];
        try {
          this._dispose(obj);
        } catch {
          /* noop */
        }
      }
    }
    this._free.length = 0;
  }
}
