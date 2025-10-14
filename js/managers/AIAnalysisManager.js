// @ts-nocheck
import { AIAnalysisAdapter } from "../adapters/AIAnalysisAdapter.js";
import { LeaderboardManager } from "./LeaderboardManager.js";

/**
 * AIAnalysisManager – static facade to compute and render post-game AI analysis.
 * Mirrors the online/offline gating style of LeaderboardManager.
 */
export class AIAnalysisManager {
  static IS_REMOTE = true; // follow leaderboard toggle for now
  /** @type {Promise<{title:string,bullets:string[]}>|null} */
  static _pending = null;
  /** @type {{title:string,bullets:string[]}|null} */
  static _cache = null;

  /**
   * Kick off an asynchronous analysis. Returns a promise and caches result.
   * Never rejects; resolves to a default suggestion payload on failure.
   * @param {object} stats See AIAnalysisAdapter.analyze JSDoc for shape.
   * @returns {Promise<{title:string,bullets:string[]}>}
   */
  static async analyze(stats) {
    if (AIAnalysisManager._pending) return AIAnalysisManager._pending;
    const adapter = new AIAnalysisAdapter();
    const p = (async () => {
      try {
        const result = await adapter.analyze(stats);
        AIAnalysisManager._cache = result;
        return { ...result };
      } catch {
        const fallback = {
          title: "✨ AI analysis is not available",
          bullets: [
            "Collect more stars and destroy more asteroids",
            "Increase your accuracy",
            "Maximize double points in the last 10 seconds",
          ],
        };
        AIAnalysisManager._cache = fallback;
        return { ...fallback };
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
        p.textContent = payload?.title || "✨ AI analysis is not available";
        container.appendChild(p);
      } catch {
        /* non-critical creation of title paragraph */
      }
      try {
        const ul = document.createElement("ul");
        //alert(1);
        const items = Array.isArray(payload?.bullets) ? payload.bullets : [];
        for (const text of items) {
          const li = document.createElement("li");
          li.textContent = String(text);
          ul.appendChild(li);
        }
        container.appendChild(ul);
      } catch {
        /* non-critical creation of bullet list */
      }
    };

    try {
      const p = document.createElement("p");
      p.textContent = "✨ AI analysis is in progress";
      container.appendChild(p);
    } catch {
      /* non-critical immediate placeholder render */
    }

    const maybe = AIAnalysisManager.analyze({ stats, runSummary });
    if (maybe && typeof maybe.then === "function") {
      maybe
        .then((res) => doRender(res))
        .catch(() => {
          doRender({
            title: "✨ AI analysis is not available",
            bullets: [
              "Collect more bonus stars",
              "Destroy more bonus asteroids",
              "Maximize double points in the last 10 seconds",
            ],
          });
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
