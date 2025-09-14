/**
 * ObjectPool – generic recyclable object pool for short‑lived entities (bullets, particles, etc.).
 *
 * Responsibilities:
 * - Reuse objects to reduce GC pressure & frame spikes.
 * - Provide optional warm up to avoid first interaction jank (allocation spikes).
 * - Respect an upper bound (`maxSize`) to cap memory while allowing reuse bursts.
 *
 * Reset precedence (highest first):
 * 1. Instance method `obj.reset(...args)` if present.
 * 2. Pool-level `resetFn(obj, ...args)` if provided.
 *
 * @template T
 * @example
 * const bulletPool = new ObjectPool(
 *   (x, y) => new Bullet(x, y),
 *   (b, x, y) => { b.x = x; b.y = y; b.alive = true; },
 *   { maxSize: 512 }
 * );
 * const b = bulletPool.acquire(10, 20);
 * // ...use bullet
 * bulletPool.release(b);
 */
export class ObjectPool {
  /**
   * @param {(...args:any[])=>T} createFn - Creates a new object when pool is empty.
   * @param {(obj:T, ...args:any[])=>void} [resetFn] - Optional: Resets an object to a fresh state when acquired.
   * @param {{ maxSize?: number, dispose?: (obj:T)=>void }} [opts] - Optional pool options.
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
   * Acquire an object; creates new when free list empty.
   * Forwards `...args` to factory on creation and to reset logic.
   * @param {...any} args Init arguments (shape defined by caller / factory).
   * @returns {T} Recycled or newly created instance.
   */
  acquire(...args) {
    let obj;
    if (this._free.length > 0) {
      // pop should be defined because length > 0
      // @ts-ignore - known non-null after length check
      obj = this._free.pop();
    } else {
      obj = this._create(...args);
      this._created++;
    }
    // Ensure a valid object was produced
    if (!obj) {
      throw new Error("ObjectPool: createFn returned falsy value");
    }
    // Prefer instance reset if available, otherwise fallback to pool-level reset
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
   * Return an object to the pool for reuse.
   * @param {T} obj
   */
  release(obj) {
    // Guard against null or undefined without using loose equality
    if (obj === null || obj === undefined) return;
    if (this._free.length < this._maxSize) {
      this._free.push(obj);
    } else if (this._dispose) {
      // Drop overflow object and optionally dispose
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
   * Pre-allocate up to N instances (subject to remaining capacity).
   * Created objects are placed on the free list already reset.
   * @param {number} n Target number to add (may allocate fewer due to maxSize).
   * @param {...any} args Arguments passed to factory for initial construction.
   */
  warmUp(n, ...args) {
    const count = Math.max(0, n | 0);
    // Respect maxSize: only create up to available capacity
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
   * Clear pooled (free) objects. When `disposeAll` and a disposer is set, invokes it on each.
   * Does NOT affect objects currently in use by callers.
   * @param {boolean} [disposeAll=false] Also dispose each free object.
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
