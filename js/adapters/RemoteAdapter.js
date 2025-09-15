/**
 * RemoteAdapter – minimal fetch wrapper for JSON endpoints with timeout + graceful failure.
 *
 * Goals:
 * - Encapsulate network concerns (timeouts, JSON parsing, null‑on‑failure contract).
 * - Remain environment tolerant (returns null when fetch unavailable – e.g., tests / SSR).
 */
export class RemoteAdapter {
  /**
   * @param {{ fetchFn?: typeof fetch, baseUrl?: string, timeoutMs?: number }} [opts]
   */
  constructor(opts = {}) {
    this._fetch = opts.fetchFn || (typeof fetch !== "undefined" ? fetch.bind(globalThis) : null);
    this._base = opts.baseUrl || "";
    this._timeoutMs = typeof opts.timeoutMs === "number" ? opts.timeoutMs : 8000;
  }

  /** @param {string} path */
  _url(path) {
    return this._base ? this._base.replace(/\/$/, "") + "/" + path.replace(/^\//, "") : path;
  }

  /**
   * Perform a GET returning parsed JSON or null.
   * @template T
   * @param {string} urlOrPath
   * @returns {Promise<T|null>}
   */
  async getJSON(urlOrPath) {
    // console.log("GET", urlOrPath); // debug helper (disabled)
    if (!this._fetch) return null;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const to = controller ? setTimeout(() => controller.abort(), this._timeoutMs) : null;
    try {
      const res = await this._fetch(this._url(urlOrPath), {
        method: "GET",
        signal: controller?.signal,
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    } finally {
      if (to) clearTimeout(to);
    }
  }

  /**
   * PUT JSON and return parsed JSON or null.
   * @template T
   * @param {string} urlOrPath
   * @param {any} body
   * @returns {Promise<T|null>}
   */
  async putJSON(urlOrPath, body) {
    // console.log("PUT", urlOrPath, body); // debug helper (disabled)
    if (!this._fetch) return null;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const to = controller ? setTimeout(() => controller.abort(), this._timeoutMs) : null;
    try {
      const res = await this._fetch(this._url(urlOrPath), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller?.signal,
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    } finally {
      if (to) clearTimeout(to);
    }
  }
}
