// @ts-nocheck
import { AIAnalysisAdapter } from "../adapters/AIAnalysisAdapter.js";
import { RemoteStorageAdapter } from "../adapters/RemoteStorageAdapter.js";
import { CognitoAPIClient } from "../adapters/Cognito.js";
import { LeaderboardManager } from "./LeaderboardManager.js";
import { FocusManager } from "./FocusManager.js";

/**
 * AIAnalysisManager – static facade to compute and render post-game AI analysis.
 * Mirrors the online/offline gating style of LeaderboardManager.
 */
export class AIAnalysisManager {
  static IS_REMOTE = true;

  /** @type {Promise<{title:string,bullets:string[],isRemote:boolean,rawResponse?:any}>|null} */
  static _pending = null;
  /** @type {{title:string,bullets:string[],isRemote:boolean,rawResponse?:any}|null} */
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
   * @returns {Promise<{title:string,bullets:string[],isRemote:boolean,rawResponse?:any}>}
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
   * @param {object|null} runSummary
   * @param {boolean} isRemote Whether remote mode is enabled
   * @param {((result: {title:string,bullets:string[],isRemote:boolean,rawResponse?:any}) => void)|null} [onComplete] Optional callback when analysis completes
   */
  static render(container, stats, runSummary = null, isRemote = true, onComplete = null) {
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
      try {
        const okBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById("okBtn"));
        if (okBtn) {
          okBtn.disabled = false;
          okBtn.tabIndex = 0;
          try {
            okBtn.focus();
          } catch {
            /* non-critical focus */
          }
          try {
            const postGame = /** @type {HTMLElement|null} */ (
              document.getElementById("gameOverScreen")
            );
            FocusManager.lock(okBtn, {
              scope: postGame || null,
              allowedSelectors: ["#okBtn"],
              preserveScroll: true,
            });
          } catch {
            /* focus lock optional */
          }
        }
      } catch {
        /* non-critical re-enable ok button */
      }
    };

    if (isRemote) {
      try {
        const p = document.createElement("p");
        p.textContent = "✨ AI analysis in progress ✨";
        container.appendChild(p);
      } catch {
        /* non-critical immediate placeholder render */
      }
      try {
        const okBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById("okBtn"));
        if (okBtn) {
          okBtn.disabled = true;
          okBtn.tabIndex = -1;
          try {
            okBtn.blur();
          } catch {
            /* non-critical blur */
          }
        }
      } catch {
        /* non-critical disable ok button during analysis */
      }
    }

    const maybe = AIAnalysisManager.analyze({ stats, runSummary });
    if (maybe && typeof maybe.then === "function") {
      maybe.then((res) => {
        doRender(res);
        if (onComplete && typeof onComplete === "function") {
          try {
            onComplete(res);
          } catch {
            /* ignore callback errors */
          }
        }
      });
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
