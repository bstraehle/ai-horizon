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
import { RemoteAdapter } from "../adapters/RemoteAdapter.js";
import { CognitoAPIClient } from "../adapters/Cognito.js";
export class LeaderboardManager {
  static IS_REMOTE = true;
  // Identifier for leaderboard partition; appended as query param `?id=...` to the Cognito API endpoint
  static REMOTE_ID = 1;
  static MAX_ENTRIES = 25;
  static KEY_LEADERBOARD = "aiHorizonLeaderboard";
  static REMOTE_REFRESH_COOLDOWN_MS = 2500;
  /** @type {{id:string,score:number}[]|null} */
  static _cacheEntries = null;
  /** @type {Promise<{id:string,score:number}[]>|null} */
  static _pendingLoadPromise = null;
  /** Server version for optimistic concurrency (undefined until a remote load/save).
   * @type {number|undefined}
   */
  static _version = undefined;
  /** Timestamp (performance.now()/Date.now) of last successful authoritative remote sync */
  static _lastRemoteSync = 0;

  /**
   * Internal: lazily create a repository with appropriate remote adapter.
   * In test environments, avoid Cognito to prevent network/credential resolution.
   * @returns {LeaderboardRepository}
   */
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
   * @returns {{rank:number,badge:string,medal:string,thumb:boolean,icon:string,text:string}}
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
      /* intentionally empty */
    }
    return high;
  }

  /**
   * Load leaderboard entries with caching + optional remote fetch.
   *
   * Behavior:
   * - Returns in‑flight promise if a load is already pending to prevent duplicate network calls (de‑dupe).
   * - When `remote:false` and cache populated, resolves immediately with a copy (fast path, no I/O).
   * - When remote, updates `_lastRemoteSync` timestamp for cooldown logic in `render`.
   * - Captures version from repository to support optimistic concurrency in subsequent `save` calls.
   *
   * Failure Handling:
   * - Any adapter/network error yields empty array (swallowed) so UI can gracefully degrade.
   * - Pending promise cleared in finally to allow retries.
   *
   * Caching:
   * - `_cacheEntries` always set to a fresh copy of loaded entries for synchronous lookups.
   *
   * @param {{remote?:boolean}=} options Set `remote:true` to force remote fetch even if cache exists.
   * @returns {Promise<{id:string,score:number}[]>} Normalized entries (possibly empty array) – never rejects.
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
   * Persist leaderboard entries (local or remote) with optimistic concurrency & conflict resolution.
   *
   * Local Mode:
   * - Writes immediately via repository; updates cache only on success.
   *
   * Remote Mode:
   * - Optimistic UI update: cache updated & list rendered before network round‑trip completes.
   * - Up to 3 attempts on version conflict. Merge strategy picks max score per id, re‑sorts, truncates.
   * - Network / non‑conflict failure aborts retry loop early.
   * - Always refreshes DOM list after final result (success or best effort) and emits 'leaderboard:updated'.
   *
   * Concurrency:
   * - Uses stored `_version` (if known) to include in payload enabling server optimistic checks.
   * - Updates `_version` from repository after each attempt.
   *
   * Return Value:
   * - Boolean indicating ultimate success (server accepted) vs failure (still possibly updated cache optimistically).
   *
   * @param {{id:string,score:number}[]} entries Canonical sorted entries to persist (caller ensures ordering).
   * @param {{remote?:boolean}=} options Set remote true to attempt HTTP save; false for local only.
   * @returns {Promise<boolean>} True if remote/local persistence definitively succeeded.
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
   * Submit a single score (append + sort + truncate + save).
   *
   * Flow:
   * - Validates positive finite score; rejects invalid silently with false (UI convenience).
   * - Loads existing entries (possibly remote) then inserts new (id validated against /^[A-Z]{1,3}$/).
   * - Stable ordering: higher score first; ties resolved by lexicographic id (deterministic for tests).
   * - Delegates persistence to `save` (inherits its optimistic/concurrency behavior).
   *
   * @param {number} score Raw numeric score (floored to integer).
   * @param {string} userId User provided 1–3 uppercase letters; fallback '???' if invalid.
   * @param {{remote?:boolean}=} options Whether to also sync remotely.
   * @returns {Promise<boolean>} True if ultimately persisted (see save docs for semantics).
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
   * Render the current (or provided) leaderboard into an <ol>/<ul> element.
   *
   * Behavior:
   * - If explicit `entries` provided: renders them immediately (skips remote fetch) for caller-controlled flows.
   * - Else renders cached entries (if any) and optionally schedules a background remote refresh if cooldown elapsed.
   * - Background refresh suppressed in test environments (NODE_ENV=test or VITEST) to avoid flaky network calls.
   *
   * Cooldown Logic:
   * - Remote refresh only attempted if `now - _lastRemoteSync >= REMOTE_REFRESH_COOLDOWN_MS`.
   * - Prevents spamming endpoint on rapid UI re-renders (e.g., focus changes).
   *
   * DOM Safety:
   * - Best-effort; failures are swallowed. Removes all children then appends new <li> rows or 'No scores yet'.
   *
   * @param {HTMLElement|null} listEl Target list element (ignored if null).
   * @param {{id:string,score:number}[]=} entries Optional pre-fetched entries to render directly.
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
   * Detect whether we should operate in remote mode by probing a third-party endpoint.
   * We only care about basic network reachability; use `no-cors` so CORS doesn't block the signal.
   * Conservative: returns false in tests/SSR/file:// contexts and when fetch is unavailable.
   * @param {{urls?: string[], timeoutMs?: number}} [opts]
   * @returns {Promise<boolean>}
   */
  static async detectRemote(opts = {}) {
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
