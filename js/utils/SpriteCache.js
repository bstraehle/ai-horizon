/**
 * SpriteCache – bounded, insertion-ordered (FIFO) cache for pre-rendered sprite surfaces.
 *
 * Purpose:
 *  - Entity sprite caches key on quantized size / color / alpha. If a key is ever derived from a
 *    continuous value, an unbounded Map grows by one canvas per entity for the life of the page.
 *    This cache caps that failure mode; after proper quantization the working set is expected to
 *    stay far below `maxSize`, so eviction is a safety net rather than a steady-state behavior.
 *
 * Behavior:
 *  - `get`/`set`/`has`/`clear`/`size` mirror the Map surface used by entity code (drop-in).
 *  - When full, `set` of a new key evicts the oldest inserted entry (no recency tracking; a hit
 *    costs a single Map lookup). `evictions` exposes pressure for diagnostics.
 *
 * @template V
 */
export class SpriteCache {
  /**
   * @param {number} [maxSize=256] Maximum number of entries retained.
   */
  constructor(maxSize = 256) {
    /** @private */ this._max = Math.max(1, maxSize | 0);
    /** @private @type {Map<string, V>} */ this._map = new Map();
    /** @private */ this._evictions = 0;
  }

  /** Number of cached entries. */
  get size() {
    return this._map.size;
  }

  /** Total entries evicted due to capacity since construction (diagnostic). */
  get evictions() {
    return this._evictions;
  }

  /**
   * @param {string} key
   * @returns {V|undefined}
   */
  get(key) {
    return this._map.get(key);
  }

  /**
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return this._map.has(key);
  }

  /**
   * Insert or replace an entry, evicting the oldest entry first when at capacity.
   * @param {string} key
   * @param {V} value
   * @returns {V} The stored value (for call-site chaining).
   */
  set(key, value) {
    if (!this._map.has(key) && this._map.size >= this._max) {
      const oldest = this._map.keys().next().value;
      if (oldest !== undefined) {
        this._map.delete(oldest);
        this._evictions++;
      }
    }
    this._map.set(key, value);
    return value;
  }

  /** Drop all entries (eviction counter is preserved). */
  clear() {
    this._map.clear();
  }
}
