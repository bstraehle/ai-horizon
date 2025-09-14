/**
 * StorageAdapter provides a thin, safe wrapper over Web Storage (localStorage-like).
 * It tolerates JSON parse errors and missing storage gracefully.
 */
export class StorageAdapter {
  /** @param {{storage?: Storage|null}} [opts] */
  constructor(opts = {}) {
    this._storage = opts.storage || (typeof localStorage !== "undefined" ? localStorage : null);
  }

  /** @returns {boolean} */
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
      // getItem returns either a string or null (never undefined); use strict equality for ESLint eqeqeq rule
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

  /**
   * Remove a key.
   * @param {string} key
   */
  remove(key) {
    if (!this._storage) return;
    try {
      this._storage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

export default StorageAdapter;
