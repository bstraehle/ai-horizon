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
    if (Array.isArray(parsed)) arr = parsed;
    else if (parsed && Array.isArray(parsed.scores)) arr = parsed.scores;
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
   * @returns {Promise<{ok:boolean, entries:{id:string,score:number}[]}>}
   */
  async saveRemote(entries) {
    if (!this.endpoint) return { ok: false, entries };
    const payload = entries.slice(0, this.maxEntries);
    const parsed = await this._remoteAdapter.putJSON(this.endpoint, { scores: payload });
    let arr = null;
    if (Array.isArray(parsed)) arr = parsed;
    else if (parsed && Array.isArray(parsed.scores)) arr = parsed.scores;
    const norm = arr ? normalize(arr).slice(0, this.maxEntries) : payload;
    return { ok: true, entries: norm };
  }
}

export default LeaderboardRepository;
