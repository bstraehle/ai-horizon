/**
 * Top-N leaderboard facade (transitional).
 * Refactor: All formerly sync-returning methods now return Promises for a uniform async contract.
 * Backward compatibility: tests that previously consumed sync arrays should be updated to await.
 * Public static API (maintained):
 *   - IS_REMOTE (boolean flag)
 *   - MAX_ENTRIES, KEY_LEADERBOARD
 *   - setHighScore(score, prevHigh?, highScoreEl?) -> number (still sync)
 *   - load({remote?}) -> Promise<entries[]>
 *   - save(entries, {remote?}) -> Promise<boolean>
 *   - submit(score, userId, {remote?}) -> Promise<boolean>
 *   - render(listEl, entries?) -> void (accepts optional pre-fetched entries)
 * Internal transitional state (_cacheEntries, _pendingLoadPromise) retained for tests/UIManager.
 * Future: Move to instance-based service + event emitters instead of DOM events.
 * Migration Notes:
 *   - load/save/submit now ALWAYS return Promise.<T>. Old synchronous usage must `await`.
 *   - Use `LeaderboardManager._cacheEntries` for immediate state reads (read-only) between awaits.
 *   - `qualifiesForInitials`, `formatRow(s)` delegated to pure helpers in
 *     `./leaderboard/` so they can be reused independently or imported directly in future.
 *   - A future breaking change will remove static mutable state; plan to inject a LeaderboardService.
 */
import { qualifiesForInitials, formatRow, formatRows } from "./leaderboard/LeaderboardFormatter.js";
import { LeaderboardRepository } from "./leaderboard/LeaderboardRepository.js";
export class LeaderboardManager {
  static IS_REMOTE = true;
  static REMOTE_ENDPOINT =
    "https://0p6x6bw6c2.execute-api.us-west-2.amazonaws.com/dev/leaderboard?id=1";
  // Server-side leaderboard identifier used when posting scores
  static MAX_ENTRIES = 10;
  static KEY_LEADERBOARD = "aiHorizonLeaderboard";
  /** @type {{id:string,score:number}[]|null} */
  static _cacheEntries = null;
  /** @type {Promise<{id:string,score:number}[]>|null} */
  static _pendingLoadPromise = null;

  // --- Internal helpers --------------------------------------------------
  // (Removed deprecated static _normalize helper – use imported normalize() directly.)

  /**
   * Determine if a score qualifies for initials entry given current entries.
   * Rules (reflected in tests):
   *   - Score must be > 0.
   *   - If fewer than 3 existing entries, any positive score qualifies (bootstrap behavior).
   *   - Otherwise require the score to exceed at least one of the current top MAX_ENTRIES scores.
   * NOTE: `entries` may be unsorted; we do not mutate the input.
   * @param {number} score
   * @param {{id:string,score:number}[]|null|undefined} entries
   * @param {number} [max=LeaderboardManager.MAX_ENTRIES]
   */
  static qualifiesForInitials(score, entries, max = LeaderboardManager.MAX_ENTRIES) {
    return qualifiesForInitials(score, entries, max);
  }

  /**
   * Produce display label components for an entry.
   * Pure: does not touch DOM; safe for snapshot/unit tests.
   * @param {{id:string,score:number}} entry
   * @param {number} index Zero-based rank index
   * @returns {{rank:number,badge:string,medal:string,thumb:boolean,text:string}}
   */
  static formatRow(entry, index) {
    return formatRow(entry, index);
  }

  /**
   * Format multiple entries in one pass (pure helper).
   * @param {{id:string,score:number}[]} entries
   * @returns {string[]} text rows limited to 100 items (UI safeguard)
   */
  static formatRows(entries) {
    return formatRows(entries);
  }

  /**
   * Return a shallow copy of cached entries or null if none.
   * Prefer this over reading _cacheEntries directly (will be deprecated).
   * @returns {{id:string,score:number}[]|null}
   */
  static getCached() {
    return Array.isArray(LeaderboardManager._cacheEntries)
      ? LeaderboardManager._cacheEntries.slice()
      : null;
  }

  /**
   * Update the high score display and return the current high.
   * High score is derived from leaderboard entries (no separate persistence).
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
      /* ignore */
    }
    return high;
  }

  /**
   * Load leaderboard entries (safe).
   * Always returns a Promise resolving to the array.
   * @param {{remote?:boolean}=} options
   * @returns {Promise<{id:string,score:number}[]>}
   */
  static async load({ remote = this.IS_REMOTE } = {}) {
    if (LeaderboardManager._pendingLoadPromise) return LeaderboardManager._pendingLoadPromise;
    // Fast path: if cache already populated and caller not forcing remote, return copy.
    if (!remote && Array.isArray(LeaderboardManager._cacheEntries)) {
      return Promise.resolve(LeaderboardManager._cacheEntries.slice());
    }
    const repo = new LeaderboardRepository({
      key: LeaderboardManager.KEY_LEADERBOARD,
      endpoint: LeaderboardManager.REMOTE_ENDPOINT,
      maxEntries: LeaderboardManager.MAX_ENTRIES,
    });
    const p = (async () => {
      const entries = remote ? await repo.loadRemote() : await repo.loadLocal();
      LeaderboardManager._cacheEntries = entries.slice();
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
   * Save leaderboard entries (safe).
   * Always returns a Promise resolving to boolean.
   * @param {{id:string,score:number}[]} entries
   * @param {{remote?:boolean}=} options
   * @returns {Promise<boolean>}
   */
  static async save(entries, { remote = this.IS_REMOTE } = {}) {
    const payload = entries.slice(0, LeaderboardManager.MAX_ENTRIES);
    const repo = new LeaderboardRepository({
      key: LeaderboardManager.KEY_LEADERBOARD,
      endpoint: LeaderboardManager.REMOTE_ENDPOINT,
      maxEntries: LeaderboardManager.MAX_ENTRIES,
    });

    if (!remote) {
      const ok = await repo.saveLocal(payload);
      if (ok) LeaderboardManager._cacheEntries = payload.slice();
      return ok;
    }

    // Optimistic update
    LeaderboardManager._cacheEntries = payload.slice();
    try {
      const listEl =
        typeof document !== "undefined" ? document.getElementById("leaderboardList") : null;
      if (listEl) LeaderboardManager.render(listEl, LeaderboardManager._cacheEntries);
    } catch (_) {
      /* ignore */
    }

    const { ok, entries: serverEntries } = await repo.saveRemote(payload);
    LeaderboardManager._cacheEntries = serverEntries.slice();
    // Dispatch DOM event for backward compatibility
    try {
      if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
        const CE = typeof window.CustomEvent === "function" ? window.CustomEvent : CustomEvent;
        if (CE)
          window.dispatchEvent(new CE("leaderboard:updated", { detail: serverEntries.slice() }));
      }
    } catch (_) {
      /* ignore */
    }
    // Opportunistic DOM refresh
    try {
      const listEl =
        typeof document !== "undefined" ? document.getElementById("leaderboardList") : null;
      if (listEl) LeaderboardManager.render(listEl, serverEntries);
    } catch (_) {
      /* ignore */
    }
    return ok;
  }

  /**
   * Submit a score and persist top-N.
   * Always returns a Promise resolving to boolean.
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
   * Render leaderboard into an ordered list element.
   * If `entries` provided, uses them directly; otherwise resolves via `load()`.
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

    // 1. If entries were provided by the caller, render them and return.
    if (Array.isArray(entries)) {
      doRender(entries);
    } else if (Array.isArray(LeaderboardManager._cacheEntries)) {
      doRender(LeaderboardManager._cacheEntries);
    }
    // Always async now
    (async () => {
      try {
        const arr = await LeaderboardManager.load({ remote: LeaderboardManager.IS_REMOTE });
        doRender(arr);
      } catch (_) {
        /* ignore */
      }
    })();
  }
}

// (Removed default export – use named import { LeaderboardManager })
