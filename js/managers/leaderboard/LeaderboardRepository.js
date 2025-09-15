import { normalize } from "./LeaderboardFormatter.js";
import { StorageAdapter } from "../../adapters/StorageAdapter.js";
import { RemoteAdapter } from "../../adapters/RemoteAdapter.js";

/**
 * Repository encapsulates persistence mechanics (localStorage vs remote HTTP).
 * All methods are Promise-based for a uniform async contract.
 */
export class LeaderboardRepository {
  /**
   * Create a new repository instance.
   *
   * Behavior / Responsibilities:
   * - Provides a unified async API for loading & saving leaderboard entries from localStorage and/or a remote endpoint.
   * - Handles legacy remote shapes: either a plain array or an object containing `scores` + optional `version` / `conflict` flags.
   * - Maintains a private optimistic concurrency `_version` used on remote PUT requests; updated from server responses.
   *
   * Failure Philosophy:
   * - Local operations almost always succeed (wrapping adapter already guards). Failures return empty arrays / false booleans.
   * - Remote failures return structured objects with `ok:false` so higher-level retry logic (`LeaderboardManager`) can decide.
   *
   * @param {{
   *   key?: string,                 // Storage key for local persistence.
   *   endpoint?: string,            // Remote HTTP endpoint root (omit for local-only mode).
   *   maxEntries?: number,          // Safety upper bound applied on load/save slices.
   *   storageAdapter?: StorageAdapter, // Injected adapter for testability.
   *   remoteAdapter?: RemoteAdapter,   // Injected adapter for testability / mocking.
   * }} [opts] Optional configuration overrides.
   */
  constructor(opts = {}) {
    this.key = opts.key || "aiHorizonLeaderboard";
    this.endpoint = opts.endpoint || "";
    this.maxEntries = typeof opts.maxEntries === "number" ? opts.maxEntries : 10;
    this._storageAdapter = opts.storageAdapter || new StorageAdapter();
    this._remoteAdapter = opts.remoteAdapter || new RemoteAdapter({});
  }

  /**
   * Load leaderboard entries from local storage.
   *
   * Process:
   * - Delegates to StorageAdapter.getJSON (returns fallback [] on parse errors).
   * - Normalizes data shape and truncates to `maxEntries`.
   *
   * @returns {Promise<{id:string,score:number}[]>} Normalized entries (possibly empty array).
   */
  async loadLocal() {
    const parsed = this._storageAdapter.getJSON(this.key, []);
    if (!Array.isArray(parsed)) return [];
    return normalize(parsed).slice(0, this.maxEntries);
  }

  /**
   * Load leaderboard entries from remote endpoint (if configured).
   *
   * Behavior:
   * - If endpoint is empty, resolves to an empty list (no error).
   * - Accepts legacy payload forms:
   *   * Array: [ {id,score}, ... ]
   *   * Object: { scores:[...], version?:number }
   * - Stores returned version (or 0) on `_version` for subsequent optimistic `saveRemote` calls.
   * - Normalizes + truncates result.
   *
   * Failure:
   * - Network / adapter failure surfaces as thrown rejection upstream (adapter returns null? => empty array here).
   *
   * @returns {Promise<{id:string,score:number}[]>} Normalized remote entries (empty on missing endpoint or parse failure).
   */
  async loadRemote() {
    if (!this.endpoint) return [];
    const parsed = await this._remoteAdapter.getJSON(this.endpoint);
    let arr = null;
    if (Array.isArray(parsed))
      arr = parsed; // legacy plain array
    else if (parsed && Array.isArray(parsed.scores)) arr = parsed.scores;
    // store version if provided (side-channel: instance field)
    this._version = typeof parsed?.version === "number" ? parsed.version : 0;
    if (!arr) return [];
    return normalize(arr).slice(0, this.maxEntries);
  }

  /**
   * Persist entries locally (overwrite semantics).
   *
   * - Caller expected to have already applied ordering/truncation; method still enforces slice to `maxEntries` defensively.
   * - Returns boolean success from underlying adapter.
   *
   * @param {{id:string,score:number}[]} entries Canonical entries.
   * @returns {Promise<boolean>} True if write succeeded.
   */
  async saveLocal(entries) {
    return this._storageAdapter.setJSON(this.key, entries.slice(0, this.maxEntries));
  }

  /**
   * Attempt remote save (optimistic concurrency aware).
   *
   * Protocol:
   * - Sends { scores:[...], version? } where version is last observed server version (if any).
   * - Server may return one of:
   *   * Success: { scores:[...], version:number }
   *   * Conflict: { conflict:true, version:number, scores:[serverLatest...] }
   *   * Legacy success: plain array of scores.
   * - On conflict, returns { ok:false, conflict:true } with server's authoritative entries so caller can merge & retry.
   * - On network / non-OK response (adapter -> null) returns { ok:false, conflict:false } with client payload (fallback).
   *
   * Version Handling:
   * - `_version` updated on both success and conflict so subsequent retry includes newest version.
   *
   * @param {{id:string,score:number}[]} entries Proposed client entries (already normalized & sorted upstream).
   * @returns {Promise<{ok:boolean, conflict:boolean, entries:{id:string,score:number}[]}>} Structured result for higher-level orchestration.
   */
  async saveRemote(entries) {
    if (!this.endpoint) return { ok: false, conflict: false, entries };
    const payload = entries.slice(0, this.maxEntries);
    /** @type {{scores:{id:string,score:number}[], version?:number}} */
    const body = { scores: payload };
    if (typeof this._version === "number") body.version = this._version; // send optimistic version if known
    const parsed = await this._remoteAdapter.putJSON(this.endpoint, body);
    // If null (network or non-200), treat as failure (will retry higher level if needed)
    if (parsed === null) return { ok: false, conflict: false, entries: payload };
    // Detect conflict shape: server may respond { conflict: true, version: <current>, scores: [...] }
    if (parsed && parsed.conflict) {
      // update local notion of version so caller can retry
      if (typeof parsed.version === "number") this._version = parsed.version;
      let arr = Array.isArray(parsed.scores) ? parsed.scores : [];
      return { ok: false, conflict: true, entries: normalize(arr).slice(0, this.maxEntries) };
    }
    // Success path – update version (increment returned by server)
    if (typeof parsed?.version === "number") this._version = parsed.version;
    let arr = null;
    if (Array.isArray(parsed))
      arr = parsed; // legacy success (plain array)
    else if (parsed && Array.isArray(parsed.scores)) arr = parsed.scores;
    const norm = arr ? normalize(arr).slice(0, this.maxEntries) : payload;
    return { ok: true, conflict: false, entries: norm };
  }
}

// (Removed default export – use named import { LeaderboardRepository })
