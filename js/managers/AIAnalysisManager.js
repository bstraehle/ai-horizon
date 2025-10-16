// @ts-nocheck
import { AIAnalysisAdapter } from "../adapters/AIAnalysisAdapter.js";
import { RemoteStorageAdapter } from "../adapters/RemoteStorageAdapter.js";
import { CognitoAPIClient } from "../adapters/Cognito.js";
import { LeaderboardManager } from "./LeaderboardManager.js";

/**
 * AIAnalysisManager – static facade to compute and render post-game AI analysis.
 * Mirrors the online/offline gating style of LeaderboardManager.
 */
export class AIAnalysisManager {
  static IS_REMOTE = true;

  /** @type {Promise<{title:string,bullets:string[]}>|null} */
  static _pending = null;
  /** @type {{title:string,bullets:string[]}|null} */
  static _cache = null;

  /**
   * Create an AIAnalysisAdapter with appropriate remote configuration.
   * @returns {AIAnalysisAdapter}
   */
  static _createAdapter() {
    const g = /** @type {any} */ (typeof globalThis !== "undefined" ? globalThis : {});
    const proc = g.process;
    const isTestEnv = !!(proc && proc.env && (proc.env.NODE_ENV === "test" || proc.env.VITEST));

    let endpoint = "";
    /** @type {RemoteStorageAdapter|undefined} */
    let remoteAdapter = undefined;

    try {
      if (!isTestEnv && AIAnalysisManager.IS_REMOTE) {
        const api = new CognitoAPIClient();
        endpoint = api.getApiEndpoint();
        remoteAdapter = new RemoteStorageAdapter({ fetchFn: api.buildSignedFetch() });
      }
    } catch (_) {
      endpoint = "";
      remoteAdapter = undefined;
    }

    return new AIAnalysisAdapter({
      ...(remoteAdapter ? { remoteAdapter } : {}),
      ...(endpoint ? { endpoint } : {}),
    });
  }

  /**
   * Kick off an asynchronous analysis. Returns a promise and caches result.
   * Never rejects; resolves to a default suggestion payload on failure.
   * @param {object} stats See AIAnalysisAdapter.analyze JSDoc for shape.
   * @returns {Promise<{title:string,bullets:string[]}>}
   */
  static async analyze(stats) {
    if (AIAnalysisManager._pending) return AIAnalysisManager._pending;
    const adapter = AIAnalysisManager._createAdapter();
    const p = (async () => {
      try {
        const result = await adapter.analyze(stats);
        AIAnalysisManager._cache = result;
        return { ...result };
      } finally {
        AIAnalysisManager._pending = null;
      }
    })();
    AIAnalysisManager._pending = p;
    return p;
  }

  /**
   * Render analysis into the post-game message container.
   * - If a result is cached, renders immediately
   * - Otherwise triggers analyze(stats) and updates when ready
   * @param {HTMLElement|null} container Typically the #postGameMessage element
   * @param {object} stats
   */
  static render(container, stats, runSummary = null) {
    if (!container) return;

    const doRender = (payload) => {
      try {
        while (container.firstChild) container.removeChild(container.firstChild);
      } catch {
        /* non-critical cleanup of container children */
      }
      try {
        const p = document.createElement("p");
        p.textContent = payload?.title;
        container.appendChild(p);
      } catch {
        /* non-critical creation of title paragraph */
      }
      try {
        const ol = document.createElement("ol");
        const items = Array.isArray(payload?.bullets) ? payload.bullets : [];
        for (const text of items.slice(0, 8)) {
          const li = document.createElement("li");
          li.textContent = String(text);
          ol.appendChild(li);
        }
        container.appendChild(ol);
      } catch {
        /* non-critical creation of bullet list */
      }
    };

    try {
      const p = document.createElement("p");
      p.textContent = "✨ Analysis in progress ✨";
      container.appendChild(p);
    } catch {
      /* non-critical immediate placeholder render */
    }

    const maybe = AIAnalysisManager.analyze({ stats, runSummary });
    if (maybe && typeof maybe.then === "function") {
      maybe.then((res) => doRender(res));
    }
  }

  /** Lightweight probe – defers to LeaderboardManager.detectRemote for now. */
  static async detectRemote() {
    try {
      return await LeaderboardManager.detectRemote();
    } catch {
      return false;
    }
  }
}
