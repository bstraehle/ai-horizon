/**
 * LeaderboardManager – static facade for a Top-N high score list supporting local + remote persistence.
 * All mutating async methods return Promises; minimal internal mutable state (_cacheEntries, timers).
 * Offline mode stores the whole list in localStorage; remote mode submits one entry at a time and
 * the leaderboard Lambda owns ranking, de-duplication and validation.
 */
import { qualifiesForInitials, formatRow, formatRows } from "./leaderboard/LeaderboardFormatter.js";
import { LeaderboardRepository } from "./leaderboard/LeaderboardRepository.js";
import { RemoteStorageAdapter } from "../adapters/RemoteStorageAdapter.js";
import { getApiEndpoint, loadSignedFetch } from "../adapters/SignedApi.js";
import { isAllowedInitials } from "../utils/initials.js";

/**
 * @typedef {Object} LeaderboardEntry
 * @property {string} id
 * @property {number} score
 * @property {number} [accuracy]
 * @property {string} [date]
 * @property {any} [game-summary]
 * @property {any} [ai-analysis]
 */

/**
 * Copy the persisted fields of an entry, serializing `game-summary` / `ai-analysis` to JSON strings.
 * @param {LeaderboardEntry} entry
 * @returns {LeaderboardEntry}
 */
function toStoredEntry(entry) {
  /** @type {LeaderboardEntry} */
  const cleaned = { id: entry.id, score: entry.score };
  if (typeof entry.accuracy === "number" && !isNaN(entry.accuracy))
    cleaned.accuracy = entry.accuracy;
  if (entry.date) cleaned.date = entry.date;
  for (const key of /** @type {const} */ (["game-summary", "ai-analysis"])) {
    const value = entry[key];
    if (value === undefined || value === null) continue;
    try {
      cleaned[key] = typeof value === "string" ? value : JSON.stringify(value);
    } catch {
      // If serialization fails, skip this field
    }
  }
  return cleaned;
}

export class LeaderboardManager {
  static IS_REMOTE = true;
  // Remote partition identifier (query param ?id=...)
  static REMOTE_ID = 1;
  static MAX_ENTRIES = 10;
  static KEY_LEADERBOARD = "aiHorizonLeaderboard";
  static REMOTE_REFRESH_COOLDOWN_MS = 0;
  /** @type {LeaderboardEntry[]|null} */
  static _cacheEntries = null;
  /** @type {Promise<LeaderboardEntry[]>|null} */
  static _pendingLoadPromise = null;
  /** @type {number} */
  static _lastRemoteSync = 0;

  /**
   * Internal repository factory (injects signed RemoteStorageAdapter outside tests).
   * Async because the signing client lives in a lazily loaded chunk (see adapters/SignedApi.js);
   * the SDK is only fetched when a remote repository is actually requested.
   * @returns {Promise<LeaderboardRepository>}
   */
  static async _createRepository() {
    const g = /** @type {any} */ (typeof globalThis !== "undefined" ? globalThis : {});
    const proc = g.process;
    const isTestEnv = !!(proc && proc.env && (proc.env.NODE_ENV === "test" || proc.env.VITEST));

    // Endpoint is static configuration (even in tests); a signed fetch is only attached in
    // non-test environments when remote mode is on.
    const endpoint = `${getApiEndpoint()}?id=${encodeURIComponent(LeaderboardManager.REMOTE_ID)}`;
    /** @type {RemoteStorageAdapter|undefined} */
    let remoteAdapter = undefined;
    if (!isTestEnv && LeaderboardManager.IS_REMOTE) {
      try {
        remoteAdapter = new RemoteStorageAdapter({ fetchFn: await loadSignedFetch() });
      } catch (_) {
        remoteAdapter = undefined;
      }
    }

    return new LeaderboardRepository({
      key: LeaderboardManager.KEY_LEADERBOARD,
      endpoint,
      maxEntries: LeaderboardManager.MAX_ENTRIES,
      ...(remoteAdapter ? { remoteAdapter } : {}),
    });
  }

  /**
   * Delegate: test if score qualifies for initials (see helper rules).
   * @param {number} score
   * @param {LeaderboardEntry[]|null|undefined} entries
   * @param {number} [max=LeaderboardManager.MAX_ENTRIES]
   * @returns {boolean}
   */
  static qualifiesForInitials(score, entries, max = LeaderboardManager.MAX_ENTRIES) {
    return qualifiesForInitials(score, entries, max);
  }

  /**
   * Pure: derive formatted label info for a single entry.
   * @param {LeaderboardEntry} entry
   * @param {number} index
   * @returns {{rank:number,badge:string,medal:string,icon:string,text:string,accuracyFormatted:string,dateFormatted:string}}
   */
  static formatRow(entry, index) {
    return formatRow(entry, index);
  }

  /**
   * Pure: format many entries.
   * @param {LeaderboardEntry[]} entries
   * @returns {string[]}
   */
  static formatRows(entries) {
    return formatRows(entries);
  }

  /**
   * Shallow copy of cache (null if empty).
   * @returns {LeaderboardEntry[]|null}
   */
  static getCached() {
    return Array.isArray(LeaderboardManager._cacheEntries)
      ? LeaderboardManager._cacheEntries.slice()
      : null;
  }

  /**
   * Compute & optionally render high score; returns updated high.
   * @param {number} score
   * @param {number} [prevHigh]
   * @param {HTMLElement|null} [highScoreEl]
   * @returns {number}
   */
  static setHighScore(score, prevHigh, highScoreEl) {
    let high = prevHigh || 0;
    if (score > high) {
      high = score;
    }
    try {
      if (highScoreEl) highScoreEl.textContent = String(high);
    } catch (_) {
      /* intentionally empty */
    }
    return high;
  }

  /**
   * Load entries (dedupes concurrent calls, optional remote). Never rejects; returns [] on failure.
   * @param {{remote?:boolean}=} options
   * @returns {Promise<LeaderboardEntry[]>}
   */
  static async load({ remote = this.IS_REMOTE } = {}) {
    if (LeaderboardManager._pendingLoadPromise) return LeaderboardManager._pendingLoadPromise;
    if (!remote && Array.isArray(LeaderboardManager._cacheEntries)) {
      return Promise.resolve(LeaderboardManager._cacheEntries.slice());
    }
    const p = (async () => {
      const repo = await LeaderboardManager._createRepository();
      const entries = remote ? await repo.loadRemote() : await repo.loadLocal();
      LeaderboardManager._cacheEntries = entries.slice();
      if (remote) {
        const now = (typeof performance !== "undefined" && performance.now()) || Date.now();
        LeaderboardManager._lastRemoteSync = now;
      }
      return entries.slice();
    })()
      .catch(() => [])
      .finally(() => {
        LeaderboardManager._pendingLoadPromise = null;
      });
    LeaderboardManager._pendingLoadPromise = p;
    return p;
  }

  /**
   * Persist the whole list to local storage (offline mode), then publish it to the cache, the
   * `leaderboard:updated` event and `#leaderboardList`. Remote boards are only written through
   * {@link LeaderboardManager.submit}, which sends a single entry.
   * @param {LeaderboardEntry[]} entries
   * @returns {Promise<boolean>}
   */
  static async save(entries) {
    const payload = entries.slice(0, LeaderboardManager.MAX_ENTRIES).map(toStoredEntry);
    const repo = await LeaderboardManager._createRepository();
    const ok = await repo.saveLocal(payload);
    if (ok) LeaderboardManager._publish(payload);
    return ok;
  }

  /**
   * Record a score. Initials must be 1-3 letters and not blocklisted (see utils/initials.js);
   * invalid scores or initials resolve to `false` without persisting anything.
   * The same initials keep only their higher score.
   * - Local: merges into the stored list and saves it.
   * - Remote: renders the merged list optimistically, sends only the new entry, then publishes the
   *   server's authoritative list (or keeps the optimistic one when the request fails).
   * @param {number} score
   * @param {string} userId
   * @param {{remote?:boolean, accuracy?:number, gameSummary?:any, aiAnalysis?:any}=} options
   * @returns {Promise<boolean>} True when stored locally / accepted for processing by the server.
   */
  static async submit(score, userId, { remote = false, accuracy, gameSummary, aiAnalysis } = {}) {
    if (typeof score !== "number" || !Number.isFinite(score) || score <= 0) return false;
    if (!isAllowedInitials(userId)) return false;
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const newEntry = toStoredEntry({
      id: userId,
      score: Math.floor(score),
      date,
      ...(typeof accuracy === "number" ? { accuracy } : {}),
      "game-summary": gameSummary,
      "ai-analysis": aiAnalysis,
    });

    const entries = await LeaderboardManager.load({ remote });
    const existing = entries.find((e) => e.id === newEntry.id);
    const merged = (
      existing && existing.score >= newEntry.score
        ? entries
        : entries.filter((e) => e.id !== newEntry.id).concat(newEntry)
    )
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, LeaderboardManager.MAX_ENTRIES);
    if (!remote) return LeaderboardManager.save(merged);

    LeaderboardManager._cacheEntries = merged.slice();
    LeaderboardManager._renderList(merged);
    const repo = await LeaderboardManager._createRepository();
    const result = await repo.submitRemote(newEntry);
    if (result.ok) {
      LeaderboardManager._lastRemoteSync =
        (typeof performance !== "undefined" && performance.now()) || Date.now();
    }
    LeaderboardManager._publish(result.entries || merged);
    return result.ok;
  }

  /**
   * Internal: replace the cache, emit `leaderboard:updated` and re-render `#leaderboardList`.
   * @param {LeaderboardEntry[]} entries
   */
  static _publish(entries) {
    LeaderboardManager._cacheEntries = entries.slice();
    try {
      if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
        const CE = typeof window.CustomEvent === "function" ? window.CustomEvent : CustomEvent;
        if (CE) window.dispatchEvent(new CE("leaderboard:updated", { detail: entries.slice() }));
      }
    } catch (_) {
      /* ignore */
    }
    LeaderboardManager._renderList(entries);
  }

  /**
   * Internal: render entries into `#leaderboardList` when present.
   * @param {LeaderboardEntry[]} entries
   */
  static _renderList(entries) {
    try {
      const listEl =
        typeof document !== "undefined" ? document.getElementById("leaderboardList") : null;
      if (listEl) LeaderboardManager.render(listEl, entries);
    } catch (_) {
      /* ignore */
    }
  }

  /**
   * Render cached or provided entries into a list element; optional background refresh (cooldown‑gated).
   * @param {HTMLElement|null} listEl
   * @param {LeaderboardEntry[]=} entries
   */
  static render(listEl, entries) {
    if (!listEl) return;

    /**
     * @param {{id:string,score:number}[]} entriesToRender
     */
    const doRender = (entriesToRender) => {
      while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
      if (!entriesToRender || entriesToRender.length === 0) {
        const li = document.createElement("li");
        li.textContent = "No scores yet";
        listEl.appendChild(li);
        return;
      }
      LeaderboardManager.formatRows(entriesToRender).forEach((row) => {
        const li = document.createElement("li");
        li.textContent = row;
        listEl.appendChild(li);
      });
    };

    if (Array.isArray(entries)) {
      doRender(entries);
      return;
    } else if (Array.isArray(LeaderboardManager._cacheEntries)) {
      doRender(LeaderboardManager._cacheEntries);
    }
    const g = /** @type {any} */ (typeof globalThis !== "undefined" ? globalThis : {});
    const proc = g.process;
    const isTestEnv = !!(proc && proc.env && (proc.env.NODE_ENV === "test" || proc.env.VITEST));
    if (LeaderboardManager.IS_REMOTE && !isTestEnv) {
      const now = (typeof performance !== "undefined" && performance.now()) || Date.now();
      if (
        now - (LeaderboardManager._lastRemoteSync || 0) >=
        LeaderboardManager.REMOTE_REFRESH_COOLDOWN_MS
      ) {
        (async () => {
          try {
            const arr = await LeaderboardManager.load({ remote: true });
            doRender(arr);
          } catch (_) {
            /* ignore */
          }
        })();
      }
    }
  }

  /**
   * Lightweight network reachability probe (no‑cors); returns false in tests/SSR.
   * @param {{urls?: string[], timeoutMs?: number}} [opts]
   * @returns {Promise<boolean>}
   */
  static async detectRemote(opts = /** @type {{urls?:string[],timeoutMs?:number}} */ ({})) {
    try {
      const g = /** @type {any} */ (typeof globalThis !== "undefined" ? globalThis : {});
      const proc = g.process;
      const isTestEnv = !!(proc && proc.env && (proc.env.NODE_ENV === "test" || proc.env.VITEST));
      if (isTestEnv) return false;
      if (typeof window === "undefined") return false;
      if (typeof fetch !== "function") return false;
      /** @type {string[]} */
      const urls =
        Array.isArray(opts.urls) && opts.urls.length
          ? opts.urls
          : ["https://www.gstatic.com/generate_204"];
      const timeoutMs = typeof opts.timeoutMs === "number" ? opts.timeoutMs : 1500;

      // Probe each candidate until one appears reachable.
      for (const url of urls) {
        const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        const to = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
        try {
          const res = await fetch(url, {
            method: "GET",
            cache: "no-store",
            redirect: "follow",
            mode: "no-cors", // avoid CORS failures; opaque success still indicates reachability
            signal: controller?.signal,
          });
          // If we got a Response (even opaque), consider network reachable.
          if (res) return true;
        } catch (_) {
          // ignore and try next
        } finally {
          if (to) clearTimeout(to);
        }
      }
    } catch (_) {
      // fall through to false
    }
    return false;
  }
}
