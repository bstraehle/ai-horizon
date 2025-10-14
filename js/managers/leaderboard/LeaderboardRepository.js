import { normalize } from "./LeaderboardFormatter.js";
import { LocalStorageAdapter } from "../../adapters/LocalStorageAdapter.js";
import { RemoteStorageAdapter } from "../../adapters/RemoteStorageAdapter.js";

/**
 * @typedef {Object} LeaderboardEntry
 * @property {string} id
 * @property {number} score
 *
 * @typedef {Object} SaveRemoteResult
 * @property {boolean} ok        True on successful authoritative save.
 * @property {boolean} conflict  True when optimistic concurrency conflict detected.
 * @property {LeaderboardEntry[]} entries Authoritative entries after the attempt.
 */

/**
 * Persistence repository (local + optional remote) for leaderboard entries.
 * Provides a small async API: loadLocal, loadRemote, saveLocal, saveRemote.
 * Remote operations support optimistic concurrency via a version token.
 */
export class LeaderboardRepository {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.key="aiHorizonLeaderboard"] Local storage key.
   * @param {string} [opts.endpoint] Remote endpoint URL (omit/empty for local-only mode).
   * @param {number} [opts.maxEntries=10] Defensive cap on entries processed.
   * @param {LocalStorageAdapter} [opts.storageAdapter] Injected storage adapter (test seam).
   * @param {RemoteStorageAdapter} [opts.remoteAdapter] Injected remote adapter (test seam).
   */
  constructor(opts = {}) {
    this.key = opts.key || "aiHorizonLeaderboard";
    this.endpoint = opts.endpoint || "";
    this.maxEntries = typeof opts.maxEntries === "number" ? opts.maxEntries : 10;
    this._storageAdapter = opts.storageAdapter || new LocalStorageAdapter();
    this._remoteAdapter = opts.remoteAdapter || new RemoteStorageAdapter({});
    /** @type {number|undefined} */
    this._version = undefined;
  }

  /**
   * Load entries from local storage, returning a normalized truncated list.
   * @returns {Promise<LeaderboardEntry[]>}
   */
  async loadLocal() {
    const parsed = this._storageAdapter.getJSON(this.key, []);
    if (!Array.isArray(parsed)) return [];
    return normalize(parsed).slice(0, this.maxEntries);
  }

  /**
   * Load entries from remote endpoint (if configured) supporting legacy payload shapes.
   * - Accepts either an array or an object with `scores` and optional `version`.
   * - Updates internal `_version` when version token present.
   * @returns {Promise<LeaderboardEntry[]>}
   */
  async loadRemote() {
    if (!this.endpoint) return [];
    const parsed = await this._remoteAdapter.getJSON(this.endpoint);
    let arr = null;
    if (Array.isArray(parsed)) arr = parsed;
    else if (parsed && Array.isArray(parsed.scores)) arr = parsed.scores;
    this._version = typeof parsed?.version === "number" ? parsed.version : 0;
    if (!arr) return [];
    return normalize(arr).slice(0, this.maxEntries);
  }

  /**
   * Persist entries locally (overwrite semantics).
   * @param {LeaderboardEntry[]} entries Already normalized entries.
   * @returns {Promise<boolean>}
   */
  async saveLocal(entries) {
    return this._storageAdapter.setJSON(this.key, entries.slice(0, this.maxEntries));
  }

  /**
   * Save entries to remote endpoint with optimistic concurrency.
   * Conflict path returns `ok:false, conflict:true` plus server's authoritative list.
   * Network / adapter failure returns `ok:false, conflict:false` and echoes client payload.
   * @param {LeaderboardEntry[]} entries Proposed (normalized, sorted) entries.
   * @returns {Promise<SaveRemoteResult>}
   */
  async saveRemote(entries) {
    if (!this.endpoint) return { ok: false, conflict: false, entries };
    const payload = entries.slice(0, this.maxEntries);
    /** @type {{scores:LeaderboardEntry[], version?:number}} */
    const body = { scores: payload };
    if (typeof this._version === "number") body.version = this._version;
    const parsed = await this._remoteAdapter.putJSON(this.endpoint, body);
    if (parsed === null) return { ok: false, conflict: false, entries: payload };
    if (parsed && parsed.conflict) {
      if (typeof parsed.version === "number") this._version = parsed.version;
      const arr = Array.isArray(parsed.scores) ? parsed.scores : [];
      return { ok: false, conflict: true, entries: normalize(arr).slice(0, this.maxEntries) };
    }
    if (typeof parsed?.version === "number") this._version = parsed.version;
    let arr = null;
    if (Array.isArray(parsed)) arr = parsed;
    else if (parsed && Array.isArray(parsed.scores)) arr = parsed.scores;
    const norm = arr ? normalize(arr).slice(0, this.maxEntries) : payload;
    return { ok: true, conflict: false, entries: norm };
  }
}
