import { normalize } from "./LeaderboardFormatter.js";
import { LocalStorageAdapter } from "../../adapters/LocalStorageAdapter.js";
import { RemoteStorageAdapter } from "../../adapters/RemoteStorageAdapter.js";

/**
 * @typedef {Object} LeaderboardEntry
 * @property {string} id
 * @property {number} score
 * @property {number} [accuracy]
 * @property {string} [date]
 * @property {any} [game-summary]
 * @property {any} [ai-analysis]
 *
 * @typedef {Object} SubmitRemoteResult
 * @property {boolean} ok        True when the server processed the submission.
 * @property {boolean} accepted  True when the entry made it onto the leaderboard.
 * @property {LeaderboardEntry[]|null} entries Authoritative entries (null on failure).
 */

/**
 * Persistence repository (local + optional remote) for leaderboard entries.
 * Provides a small async API: loadLocal, loadRemote, saveLocal, submitRemote.
 * Local storage holds the whole list; the remote endpoint only accepts a single entry and does the
 * ranking itself, so a client can never overwrite other players' scores.
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
   * - Accepts either an array or an object with `scores`.
   * @returns {Promise<LeaderboardEntry[]>}
   */
  async loadRemote() {
    if (!this.endpoint) return [];
    const parsed = await this._remoteAdapter.getJSON(this.endpoint);
    let arr = null;
    if (Array.isArray(parsed)) arr = parsed;
    else if (parsed && Array.isArray(parsed.scores)) arr = parsed.scores;
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
   * Submit a single entry (`PUT { entry }`). The server validates it (initials blocklist, score
   * bounds), merges it into the ranked list and returns the authoritative top-N.
   * Rejection (HTTP 4xx), throttling, conflicts and network failures all return `ok:false` with
   * `entries: null`; callers keep their optimistic list in that case.
   * @param {LeaderboardEntry} entry
   * @returns {Promise<SubmitRemoteResult>}
   */
  async submitRemote(entry) {
    if (!this.endpoint) return { ok: false, accepted: false, entries: null };
    /** @type {any} */
    const parsed = await this._remoteAdapter.putJSON(this.endpoint, { entry });
    if (!parsed || !Array.isArray(parsed.scores))
      return { ok: false, accepted: false, entries: null };
    return {
      ok: true,
      accepted: parsed.accepted === true,
      entries: normalize(parsed.scores).slice(0, this.maxEntries),
    };
  }
}
