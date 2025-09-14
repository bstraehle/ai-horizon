/**
 * ObjectPool - generic pool to recycle frequently created short‑lived objects.
 *
 * Design:
 * - Accepts a factory `createFn` and optional `resetFn` (or instance `reset`).
 * - `acquire(...args)` either reuses a freed object or creates a new one.
 * - `release(obj)` returns object to free list (bounded by `maxSize`).
 * - Optional `dispose(obj)` called when pool over capacity or during `clear(true)`.
 * - `warmUp(n, ...args)` pre-allocates N to smooth first-frame spikes.
 *
 * Preference order for resetting state: instance.reset(...args) > pool.resetFn.
 *
 * @template T
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
   * Acquire an object from the pool, creating one if necessary.
   * @returns {T}
   */
  /** @param {...any} args */
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

  /** Total number of objects ever created by this pool. */
  get createdCount() {
    return this._created;
  }

  /**
   * Pre-allocate and cache N objects in the pool for smoother first-use.
   * Objects are created using the provided args but kept in the free list.
   * @param {number} n
   */
  /** @param {number} n @param {...any} args */
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
   * Clear all cached objects. If disposeAll is true and a disposer exists, dispose each.
   * @param {boolean} [disposeAll]
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
