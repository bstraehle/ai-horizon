/**
 * LeaderboardManager – static facade for a Top-N high score list supporting local + remote persistence.
 * All mutating async methods return Promises; minimal internal mutable state (_cacheEntries, _version, timers).
 */
import { qualifiesForInitials, formatRow, formatRows } from "./leaderboard/LeaderboardFormatter.js";
import { LeaderboardRepository } from "./leaderboard/LeaderboardRepository.js";
import { RemoteAdapter } from "../adapters/RemoteAdapter.js";
import { CognitoAPIClient } from "../adapters/Cognito.js";
export class LeaderboardManager {
  static IS_REMOTE = true;
  // Remote partition identifier (query param ?id=...)
  static REMOTE_ID = 1;
  static MAX_ENTRIES = 25;
  static KEY_LEADERBOARD = "aiHorizonLeaderboard";
  static REMOTE_REFRESH_COOLDOWN_MS = 0;
  /** @type {{id:string,score:number}[]|null} */
  static _cacheEntries = null;
  /** @type {Promise<{id:string,score:number}[]>|null} */
  static _pendingLoadPromise = null;
  /** @type {number|undefined} Optimistic concurrency version */
  static _version = undefined;
  /** @type {number} Last remote sync timestamp */
  static _lastRemoteSync = 0;

  /** Internal repository factory (injects signed RemoteAdapter outside tests). */
  static _createRepository() {
    const g = /** @type {any} */ (typeof globalThis !== "undefined" ? globalThis : {});
    const proc = g.process;
    const isTestEnv = !!(proc && proc.env && (proc.env.NODE_ENV === "test" || proc.env.VITEST));

    // Build endpoint from Cognito client defaults (even in tests),
    // but only attach a signed fetch in non-test environments.
    let endpoint = "";
    /** @type {RemoteAdapter|undefined} */
    let remoteAdapter = undefined;

    try {
      const api = new CognitoAPIClient();
      // Base endpoint (no query) + id param
      endpoint = `${api.getApiEndpoint()}?id=${encodeURIComponent(LeaderboardManager.REMOTE_ID)}`;
      if (!isTestEnv && LeaderboardManager.IS_REMOTE) {
        remoteAdapter = new RemoteAdapter({ fetchFn: api.buildSignedFetch() });
      }
    } catch (_) {
      // If Cognito initialization fails entirely, leave endpoint empty to imply local-only mode
      endpoint = "";
      remoteAdapter = undefined;
    }

    return new LeaderboardRepository({
      key: LeaderboardManager.KEY_LEADERBOARD,
      endpoint,
      maxEntries: LeaderboardManager.MAX_ENTRIES,
      // Only pass remoteAdapter when we actually created a signed one; default handles tests
      ...(remoteAdapter ? { remoteAdapter } : {}),
    });
  }

  /**
   * Delegate: test if score qualifies for initials (see helper rules).
   * @param {number} score
   * @param {{id:string,score:number}[]|null|undefined} entries
   * @param {number} [max=LeaderboardManager.MAX_ENTRIES]
   * @returns {boolean}
   */
  static qualifiesForInitials(score, entries, max = LeaderboardManager.MAX_ENTRIES) {
    return qualifiesForInitials(score, entries, max);
  }

  /**
   * Pure: derive formatted label info for a single entry.
   * @param {{id:string,score:number}} entry
   * @param {number} index
   * @returns {{rank:number,badge:string,medal:string,icon:string,text:string}}
   */
  static formatRow(entry, index) {
    return formatRow(entry, index);
  }

  /**
   * Pure: format many entries.
   * @param {{id:string,score:number}[]} entries
   * @returns {string[]}
   */
  static formatRows(entries) {
    return formatRows(entries);
  }

  /**
   * Shallow copy of cache (null if empty).
   * @returns {{id:string,score:number}[]|null}
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
   * @returns {Promise<{id:string,score:number}[]>}
   */
  static async load({ remote = this.IS_REMOTE } = {}) {
    if (LeaderboardManager._pendingLoadPromise) return LeaderboardManager._pendingLoadPromise;
    if (!remote && Array.isArray(LeaderboardManager._cacheEntries)) {
      return Promise.resolve(LeaderboardManager._cacheEntries.slice());
    }
    const repo = LeaderboardManager._createRepository();
    const p = (async () => {
      const entries = remote ? await repo.loadRemote() : await repo.loadLocal();
      if (typeof repo._version === "number") LeaderboardManager._version = repo._version;
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
   * Save entries (local or remote) with optimistic concurrency + conflict merge.
   * @param {{id:string,score:number}[]} entries
   * @param {{remote?:boolean}=} options
   * @returns {Promise<boolean>}
   */
  static async save(entries, { remote = this.IS_REMOTE } = {}) {
    const payload = entries.slice(0, LeaderboardManager.MAX_ENTRIES);
    const repo = LeaderboardManager._createRepository();
    if (typeof LeaderboardManager._version === "number")
      repo._version = LeaderboardManager._version;

    if (!remote) {
      const ok = await repo.saveLocal(payload);
      if (ok) {
        LeaderboardManager._cacheEntries = payload.slice();
        try {
          if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
            const CE = typeof window.CustomEvent === "function" ? window.CustomEvent : CustomEvent;
            if (CE)
              window.dispatchEvent(
                new CE("leaderboard:updated", { detail: LeaderboardManager._cacheEntries.slice() })
              );
          }
        } catch (_) {
          /* ignore */
        }
        try {
          const listEl =
            typeof document !== "undefined" ? document.getElementById("leaderboardList") : null;
          if (listEl) LeaderboardManager.render(listEl, LeaderboardManager._cacheEntries);
        } catch (_) {
          /* ignore */
        }
      }
      return ok;
    }

    LeaderboardManager._cacheEntries = payload.slice();
    try {
      const listEl =
        typeof document !== "undefined" ? document.getElementById("leaderboardList") : null;
      if (listEl) LeaderboardManager.render(listEl, LeaderboardManager._cacheEntries);
    } catch (_) {
      /* ignore */
    }

    let attempt = 0;
    const MAX_ATTEMPTS = 3;
    /** @type {{ok:boolean, conflict:boolean, entries:{id:string,score:number}[]}} */
    let lastResult = { ok: false, conflict: false, entries: payload };
    while (attempt < MAX_ATTEMPTS) {
      lastResult = await repo.saveRemote(payload);
      if (lastResult.ok) break;
      if (lastResult.conflict) {
        LeaderboardManager._cacheEntries = lastResult.entries.slice();
        if (typeof repo._version === "number") LeaderboardManager._version = repo._version;
        const map = new Map();
        for (const e of lastResult.entries) map.set(e.id, e.score);
        for (const e of entries) {
          const prev = map.get(e.id);
          if (prev === undefined || prev === null || e.score > prev) map.set(e.id, e.score);
        }
        const merged = Array.from(map, ([id, score]) => ({ id, score }))
          .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
          .slice(0, LeaderboardManager.MAX_ENTRIES);
        payload.splice(0, payload.length, ...merged);
        attempt += 1;
        continue;
      }
      break;
    }
    const serverEntries = lastResult.entries;
    if (typeof repo._version === "number") LeaderboardManager._version = repo._version;
    LeaderboardManager._cacheEntries = serverEntries.slice();
    if (remote && lastResult.ok) {
      const now = (typeof performance !== "undefined" && performance.now()) || Date.now();
      LeaderboardManager._lastRemoteSync = now;
    }
    try {
      if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
        const CE = typeof window.CustomEvent === "function" ? window.CustomEvent : CustomEvent;
        if (CE)
          window.dispatchEvent(new CE("leaderboard:updated", { detail: serverEntries.slice() }));
      }
    } catch (_) {
      /* ignore */
    }
    try {
      const listEl =
        typeof document !== "undefined" ? document.getElementById("leaderboardList") : null;
      if (listEl) LeaderboardManager.render(listEl, serverEntries);
    } catch (_) {
      /* ignore */
    }
    return lastResult.ok;
  }

  /**
   * Append score + persist (validates score/id).
   * @param {number} score
   * @param {string} userId
   * @param {{remote?:boolean}=} options
   * @returns {Promise<boolean>}
   */
  static async submit(score, userId, { remote = false } = {}) {
    if (typeof score !== "number" || !Number.isFinite(score) || score <= 0) return false;
    /** @param {{id:string,score:number}} a @param {{id:string,score:number}} b */
    const compareEntries = (a, b) => b.score - a.score || a.id.localeCompare(b.id);
    const entries = await LeaderboardManager.load({ remote });
    const id = userId && /^[A-Z]{1,3}$/.test(userId) ? userId : "???";
    entries.push({ id, score: Math.floor(score) });
    entries.sort(compareEntries);
    return LeaderboardManager.save(entries.slice(0, LeaderboardManager.MAX_ENTRIES), { remote });
  }

  /**
   * Render cached or provided entries into a list element; optional background refresh (cooldown‑gated).
   * @param {HTMLElement|null} listEl
   * @param {{id:string,score:number}[]=} entries
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
