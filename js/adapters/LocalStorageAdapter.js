/**
 * LocalStorageAdapter – defensive JSON wrapper around Web Storage (localStorage style).
 *
 * Safety features:
 * - Silently degrades (returns fallbacks) when storage API unavailable or throws (quota / privacy mode).
 * - Shields callers from JSON.parse exceptions; returns provided fallback instead.
 */
export class LocalStorageAdapter {
  /**
   * Create a LocalStorageAdapter.
   * @param {{storage?: Storage|null}} [opts] Optional dependency injection hook (pass mock storage in tests).
   */
  constructor(opts = {}) {
    this._storage = opts.storage || (typeof localStorage !== "undefined" ? localStorage : null);
  }

  /**
   * Whether an underlying storage implementation is available.
   * Returns false in environments without Web Storage (SSR / privacy modes).
   * @returns {boolean}
   */
  get available() {
    return !!this._storage;
  }

  /**
   * Read and parse JSON value.
   * @template T
   * @param {string} key
   * @param {T|null|undefined} [fallback]
   * @returns {T|null}
   */
  getJSON(key, fallback) {
    if (!this._storage) return fallback ?? null;
    try {
      const raw = this._storage.getItem(key);
      if (raw === null) return fallback ?? null;
      return JSON.parse(raw);
    } catch {
      return fallback ?? null;
    }
  }

  /**
   * Serialize JSON value.
   * @param {string} key
   * @param {any} value
   * @returns {boolean}
   */
  setJSON(key, value) {
    if (!this._storage) return false;
    try {
      this._storage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }
}
