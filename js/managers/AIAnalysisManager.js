// @ts-nocheck
import { AIAnalysisAdapter } from "../adapters/AIAnalysisAdapter.js";
import { RemoteStorageAdapter } from "../adapters/RemoteStorageAdapter.js";
import { getApiEndpoint, loadSignedFetch } from "../adapters/SignedApi.js";
import { LeaderboardManager } from "./LeaderboardManager.js";
import { FocusManager } from "./FocusManager.js";

/**
 * AIAnalysisManager – static facade to compute and render post-game AI analysis.
 * Mirrors the online/offline gating style of LeaderboardManager.
 */
export class AIAnalysisManager {
  static IS_REMOTE = true;

  /**
   * Sound engine used to narrate the Game Over headline (set by the game). Speech is requested
   * from the server – which invokes Amazon Polly – only when this is set, supported, unmuted and
   * remote mode is on.
   * @type {{ supported: boolean, muted: boolean, takeNarratorVoice: () => string,
   *   playSpeech: (base64: string) => Promise<boolean> }|null}
   */
  static audio = null;

  /** @type {Promise<{title:string,bullets:string[],isRemote:boolean,rawResponse?:any}>|null} */
  static _pending = null;
  /** @type {{title:string,bullets:string[],isRemote:boolean,rawResponse?:any}|null} */
  static _cache = null;

  /**
   * Create an AIAnalysisAdapter with appropriate remote configuration.
   * Async because the signing client is a lazily loaded chunk (see adapters/SignedApi.js).
   * @returns {Promise<AIAnalysisAdapter>}
   */
  static async _createAdapter() {
    const g = /** @type {any} */ (typeof globalThis !== "undefined" ? globalThis : {});
    const proc = g.process;
    const isTestEnv = !!(proc && proc.env && (proc.env.NODE_ENV === "test" || proc.env.VITEST));

    let endpoint = "";
    /** @type {RemoteStorageAdapter|undefined} */
    let remoteAdapter = undefined;

    try {
      if (!isTestEnv && AIAnalysisManager.IS_REMOTE) {
        endpoint = getApiEndpoint();
        remoteAdapter = new RemoteStorageAdapter({ fetchFn: await loadSignedFetch() });
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
   * Speech request for this debrief, or null when sound is off/unsupported or not remote (so
   * Polly is never invoked). Alternates the narrator gender only when speech is requested.
   * @returns {{ voice: string }|null}
   */
  static _speechRequest() {
    const audio = AIAnalysisManager.audio;
    if (!AIAnalysisManager.IS_REMOTE || !audio || !audio.supported || audio.muted) return null;
    return { voice: audio.takeNarratorVoice() };
  }

  /**
   * Kick off an asynchronous analysis. Returns a promise and caches result.
   * Never rejects; resolves to a default suggestion payload on failure.
   * When the server returns a narration clip it is played immediately and not kept in the result.
   * @param {object} stats See AIAnalysisAdapter.analyze JSDoc for shape.
   * @returns {Promise<{title:string,bullets:string[],isRemote:boolean,rawResponse?:any}>}
   */
  static async analyze(stats) {
    if (AIAnalysisManager._pending) return AIAnalysisManager._pending;
    const p = (async () => {
      try {
        const adapter = await AIAnalysisManager._createAdapter();
        const speech = AIAnalysisManager._speechRequest();
        const { speech: clip, ...result } = await adapter.analyze(
          speech ? { ...stats, speech } : stats
        );
        if (clip && AIAnalysisManager.audio) {
          AIAnalysisManager.audio.playSpeech(clip.audio).catch(() => {});
        }
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
        p.textContent = "✨ Mission debrief protocol initiated...";
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
