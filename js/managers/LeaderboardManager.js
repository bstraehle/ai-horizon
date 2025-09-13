/**
 * LeaderboardManager: simple top-N leaderboard using localStorage or a remote server.
 * Stores entries as [{id, score}] sorted by score desc. No PII collected.
 */
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
   * For remote=true returns a Promise resolving to the array.
   * @param {{remote?:boolean}=} options
   * @returns {{id:string,score:number}[]|Promise<{id:string,score:number}[]>}
   */
  static load({ remote = this.IS_REMOTE } = {}) {
    //if (typeof console !== "undefined" && console && typeof console.log === "function") {
    //  console.log("LeaderboardManager: load", { remote });
    //}

    if (!remote) {
      try {
        if (Array.isArray(LeaderboardManager._cacheEntries))
          return LeaderboardManager._cacheEntries.slice();
        const raw = localStorage.getItem(LeaderboardManager.KEY_LEADERBOARD);
        if (!raw) {
          LeaderboardManager._cacheEntries = [];
          return [];
        }
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          LeaderboardManager._cacheEntries = [];
          return [];
        }
        const normalized = parsed.map(
          /** @param {{id:any,score:any}} e */
          (e) => ({ id: String(e.id || ""), score: Number(e.score || 0) })
        );
        LeaderboardManager._cacheEntries = normalized;
        return normalized.slice();
      } catch (_) {
        LeaderboardManager._cacheEntries = [];
        return [];
      }
    }

    if (remote) {
      if (LeaderboardManager._pendingLoadPromise) return LeaderboardManager._pendingLoadPromise;

      LeaderboardManager._pendingLoadPromise = fetch(LeaderboardManager.REMOTE_ENDPOINT, {
        method: "GET",
      })
        .then((res) => {
          if (!res.ok) return [];
          return res.json();
        })
        .then((parsed) => {
          let arr = null;
          if (Array.isArray(parsed)) arr = parsed;
          else if (parsed && Array.isArray(parsed.scores)) arr = parsed.scores;
          if (!arr) {
            LeaderboardManager._cacheEntries = [];
            return [];
          }
          const normalized = arr.map(
            /** @param {{id:any,score:any}} e */
            (e) => ({ id: String(e.id || ""), score: Number(e.score || 0) })
          );
          LeaderboardManager._cacheEntries = normalized;
          return normalized.slice();
        })
        .catch(() => [])
        .finally(() => {
          LeaderboardManager._pendingLoadPromise = null;
        });

      return LeaderboardManager._pendingLoadPromise;
    }

    return [];
  }

  /**
   * Save leaderboard entries (safe).
   * For remote=true returns a Promise resolving to boolean.
   * @param {{id:string,score:number}[]} entries
   * @param {{remote?:boolean}=} options
   * @returns {boolean|Promise<boolean>}
   */
  static save(entries, { remote = this.IS_REMOTE } = {}) {
    //if (typeof console !== "undefined" && console && typeof console.log === "function") {
    //  console.log("LeaderboardManager: save", { remote });
    //}

    const payload = entries.slice(0, LeaderboardManager.MAX_ENTRIES);

    if (!remote) {
      try {
        localStorage.setItem(LeaderboardManager.KEY_LEADERBOARD, JSON.stringify(payload));
        LeaderboardManager._cacheEntries = payload.slice();
        return true;
      } catch (_) {
        return false;
      }
    }

    const body = JSON.stringify({ scores: payload });

    // Optimistic update: immediately reflect the provided entries locally while the network
    // request is in flight so the UI appears responsive. We'll reconcile with server response
    // when the fetch resolves (already handled below). We do not write to localStorage.
    try {
      LeaderboardManager._cacheEntries = payload.slice();
      if (typeof document !== "undefined") {
        const listEl = document.getElementById("leaderboardList");
        if (listEl) {
          LeaderboardManager.render(listEl, LeaderboardManager._cacheEntries);
        }
      }
    } catch (_) {
      /* ignore */
    }

    return fetch(LeaderboardManager.REMOTE_ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body,
    })
      .then((res) => {
        // If server responded ok, attempt to parse the response body which should use
        // the same shape as `load` (either an array of entries or { scores: [...] }).
        /** @param {{id:any,score:any}[]|null} arr */
        const handleAndPersist = (arr) => {
          // Normalize returned entries. DO NOT persist to localStorage on successful remote save
          // (requirement). We only update in-memory cache and emit the event. Local storage is
          // reserved for purely local leaderboards or remote failures (fallback in catch).
          try {
            const normalized = /** @type {{id:any,score:any}[]} */ (arr)
              .map(
                /** @param {{id:any,score:any}} e */
                (e) => ({ id: String(e.id || ""), score: Number(e.score || 0) })
              )
              .slice(0, LeaderboardManager.MAX_ENTRIES);
            LeaderboardManager._cacheEntries = normalized.slice();
            // Dispatch a DOM event so any UI can update immediately without requiring a full reload.
            try {
              if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
                const CE =
                  typeof window.CustomEvent === "function"
                    ? window.CustomEvent
                    : typeof CustomEvent === "function"
                      ? CustomEvent
                      : null;
                if (CE) {
                  window.dispatchEvent(new CE("leaderboard:updated", { detail: normalized }));
                }
              }
            } catch (_) {
              /* ignore */
            }
            // Opportunistically update DOM list if it already exists (avoid waiting for event listener)
            try {
              const listEl =
                typeof document !== "undefined" ? document.getElementById("leaderboardList") : null;
              if (listEl) {
                // Reuse render logic without triggering another load by passing entries directly
                LeaderboardManager.render(listEl, normalized);
              }
            } catch (_) {
              /* ignore */
            }
            return Promise.resolve(true);
          } catch (_) {
            return Promise.resolve(true);
          }
        };

        return res.json().then((parsed) => {
          let arr = null;
          if (Array.isArray(parsed)) arr = parsed;
          else if (parsed && Array.isArray(parsed.scores)) arr = parsed.scores;
          if (arr) return handleAndPersist(arr);
          // Ensure we always return a Promise<boolean> to satisfy consistent-return.
          return Promise.resolve(true);
        });
      })
      .catch(() => {
        // network or other error - fallback to local storage
        try {
          localStorage.setItem(LeaderboardManager.KEY_LEADERBOARD, JSON.stringify(payload));
        } catch (_) {
          /* ignore */
        }
        return false;
      });
  }

  /**
   * Submit a score and persist top-N.
   * For remote=true returns a Promise resolving to boolean.
   * @param {number} score
   * @param {string} userId
   * @param {{remote?:boolean}=} options
   * @returns {boolean|Promise<boolean>}
   */
  static submit(score, userId, { remote = false } = {}) {
    if (typeof score !== "number" || !Number.isFinite(score) || score <= 0) return false;

    /**
     * Comparator for entries.
     * @param {{id:string,score:number}} a
     * @param {{id:string,score:number}} b
     * @returns {number}
     */
    const compareEntries = (a, b) => b.score - a.score || a.id.localeCompare(b.id);

    /**
     * @param {{id:string,score:number}[]} entries
     */
    const handleEntriesAndSave = (entries) => {
      const id = userId && /^[A-Z]{1,3}$/.test(userId) ? userId : "???";
      entries.push({ id, score: Math.floor(score) });
      entries.sort(compareEntries);
      return LeaderboardManager.save(entries.slice(0, LeaderboardManager.MAX_ENTRIES), { remote });
    };

    const maybeEntries = LeaderboardManager.load({ remote });

    // Local
    if (Array.isArray(maybeEntries)) {
      return handleEntriesAndSave(maybeEntries);
    }

    // Remote
    return maybeEntries.then(
      /** @param {{id:string,score:number}[]} entries */ (entries) => handleEntriesAndSave(entries)
    );
  }

  /**
   * Render leaderboard into an ordered list element.
   * @param {HTMLElement|null} listEl
   */
  /**
   * Render leaderboard into an ordered list element.
   * If `entries` is provided, use it directly instead of calling `load()`
   * which avoids double-loading when the caller already fetched the data.
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
      entriesToRender.slice(0, 100).forEach(
        /** @param {{id:string,score:number}} e */
        (e, idx) => {
          const li = document.createElement("li");
          const rank = `${idx + 1}`;
          let badge;
          if (/^[A-Z]{1,3}$/.test(e.id)) {
            badge = e.id;
          } else {
            badge = "???";
          }
          const medals = ["🥇", "🥈", "🥉"];
          const medalPrefix = idx >= 0 && idx < 3 ? medals[idx] + " " : "";
          const outsideTopThreePrefix = idx >= 3 ? "👍 " : "";
          li.textContent = `${medalPrefix}${outsideTopThreePrefix}${rank} — ${badge} — ${e.score}`;
          listEl.appendChild(li);
        }
      );
    };

    // 1. If entries were provided by the caller, render them and return.
    if (Array.isArray(entries)) {
      doRender(entries);
      return;
    }

    // 2. If we already have a cached array, use it without triggering another load.
    if (Array.isArray(LeaderboardManager._cacheEntries)) {
      doRender(LeaderboardManager._cacheEntries);
      return;
    }

    // 3. If a load (remote) is currently pending, attach a once-only continuation.
    if (LeaderboardManager._pendingLoadPromise) {
      LeaderboardManager._pendingLoadPromise
        .then((arr) => {
          if (Array.isArray(LeaderboardManager._cacheEntries)) {
            doRender(LeaderboardManager._cacheEntries);
          } else if (Array.isArray(arr)) {
            doRender(arr);
          }
        })
        .catch(() => {});
      return;
    }

    // 4. Kick off a load exactly once (remote or local depending on config) and render when ready.
    const maybeEntries = LeaderboardManager.load({ remote: LeaderboardManager.IS_REMOTE });
    if (Array.isArray(maybeEntries)) {
      doRender(maybeEntries);
      return;
    }
    if (maybeEntries && typeof maybeEntries.then === "function") {
      maybeEntries.then(doRender).catch(() => {});
    }
  }
}

export default LeaderboardManager;
