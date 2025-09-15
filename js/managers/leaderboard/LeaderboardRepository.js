import { normalize } from "./LeaderboardFormatter.js";
import { StorageAdapter } from "../../adapters/StorageAdapter.js";
import { RemoteAdapter } from "../../adapters/RemoteAdapter.js";

/**
 * Repository encapsulates persistence mechanics (localStorage vs remote HTTP).
 * All methods are Promise-based for a uniform async contract.
 */
export class LeaderboardRepository {
  /**
   * @param {{
   *   key?: string,
   *   endpoint?: string,
   *   maxEntries?: number,
   *   storageAdapter?: StorageAdapter,
   *   remoteAdapter?: RemoteAdapter,
   * }} [opts]
   */
  constructor(opts = {}) {
    this.key = opts.key || "aiHorizonLeaderboard";
    this.endpoint = opts.endpoint || "";
    this.maxEntries = typeof opts.maxEntries === "number" ? opts.maxEntries : 10;
    this._storageAdapter = opts.storageAdapter || new StorageAdapter();
    this._remoteAdapter = opts.remoteAdapter || new RemoteAdapter({});
  }

  /** @returns {Promise<{id:string,score:number}[]>} */
  async loadLocal() {
    const parsed = this._storageAdapter.getJSON(this.key, []);
    if (!Array.isArray(parsed)) return [];
    return normalize(parsed).slice(0, this.maxEntries);
  }

  /** @returns {Promise<{id:string,score:number}[]>} */
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
   * Save locally (overwrite) – never truncates beyond maxEntries already applied by caller.
   * @param {{id:string,score:number}[]} entries
   * @returns {Promise<boolean>}
   */
  async saveLocal(entries) {
    return this._storageAdapter.setJSON(this.key, entries.slice(0, this.maxEntries));
  }

  /**
   * Remote save. Returns normalized server entries when available; else falls back to provided.
   * @param {{id:string,score:number}[]} entries
   * @returns {Promise<{ok:boolean, conflict:boolean, entries:{id:string,score:number}[]}>}
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
