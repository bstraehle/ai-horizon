// @ts-nocheck
import { AIAnalysisAdapter, debriefLabels } from "../adapters/AIAnalysisAdapter.js";
import { RemoteStorageAdapter } from "../adapters/RemoteStorageAdapter.js";
import { getApiEndpoint, loadSignedFetch } from "../adapters/SignedApi.js";
import { CONFIG } from "../constants.js";
import { prefersReducedMotion } from "../utils/motion.js";
import { typewrite } from "../ui/Typewriter.js";
import { LeaderboardManager } from "./LeaderboardManager.js";
import { FocusManager } from "./FocusManager.js";

/** Typing pace for the headline when there is no voice to follow, and its bounds. */
const TYPE_MS_PER_CHAR = 32;
const TYPE_MIN_MS = 1000;
const TYPE_MAX_MS = 3500;
/** Longest wait for the narration clip's timing before typing without it. */
const SPEECH_TIMING_WAIT_MS = 1500;

/**
 * AIAnalysisManager – static facade to compute and render post-game AI analysis.
 * Mirrors the online/offline gating style of LeaderboardManager.
 *
 * Presentation: while a remote debrief loads, the screen shows an "incoming transmission" from
 * Commander Vega (localized) with a radio crackle; the outcome title and the Ok button are hidden
 * until the debrief arrives (then shown, Ok enabled and focused). The headline then types out in
 * sync with the spoken clip (or at a reading pace without one, instantly under reduced motion),
 * and the Well done / Next mission sections appear when it is complete. Screen readers get the
 * full headline at once.
 */
export class AIAnalysisManager {
  static IS_REMOTE = true;

  /**
   * Sound engine used to narrate the Game Over headline (set by the game). Speech is requested
   * from the server – which invokes Amazon Polly – only when this is set, supported, unmuted and
   * remote mode is on.
   * @type {{ supported: boolean, muted: boolean, playTransmission?: () => void,
   *   playSpeech: (base64: string) => Promise<{ delay: number, duration: number }|null> }|null}
   */
  static audio = null;

  /** @type {Promise<{title:string,sections:import("../adapters/AIAnalysisAdapter.js").DebriefSection[],isRemote:boolean,rawResponse?:any}>|null} */
  static _pending = null;
  /** @type {{title:string,sections:import("../adapters/AIAnalysisAdapter.js").DebriefSection[],isRemote:boolean,rawResponse?:any}|null} */
  static _cache = null;
  /** Headline reveal in progress (cancelled by the next render). */
  static _reveal = null;

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
   * Speech request for this debrief (Commander Vega's voice), or null when sound is
   * off/unsupported or not remote (so Polly is never invoked).
   * @returns {{ voice: string }|null}
   */
  static _speechRequest() {
    const audio = AIAnalysisManager.audio;
    if (!AIAnalysisManager.IS_REMOTE || !audio || !audio.supported || audio.muted) return null;
    return { voice: CONFIG.AUDIO.NARRATOR_VOICE };
  }

  /**
   * Kick off an asynchronous analysis. Returns a promise and caches result.
   * Never rejects; resolves to a default suggestion payload on failure.
   * When the server returns a narration clip it is played immediately and not kept in the result;
   * `speechTiming` then resolves to when the voice starts and how long it lasts (see
   * AudioManager.playSpeech), for the headline reveal.
   * @param {object} stats See AIAnalysisAdapter.analyze JSDoc for shape.
   * @returns {Promise<{title:string,sections:import("../adapters/AIAnalysisAdapter.js").DebriefSection[],isRemote:boolean,rawResponse?:any,speechTiming?:Promise<{delay:number,duration:number}|null>}>}
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
        AIAnalysisManager._cache = result;
        if (clip && AIAnalysisManager.audio) {
          const speechTiming = Promise.resolve(AIAnalysisManager.audio.playSpeech(clip.audio))
            .then((t) => (t && typeof t === "object" ? t : null))
            .catch(() => null);
          return { ...result, speechTiming };
        }
        return { ...result };
      } finally {
        AIAnalysisManager._pending = null;
      }
    })();
    AIAnalysisManager._pending = p;
    return p;
  }

  /**
   * Hide or show the post-game screen's outcome title (#gameOverTitle, e.g. "Ship Down"), which
   * stays hidden while the transmission is incoming.
   * @param {boolean} hidden
   */
  static _setHeadlineHidden(hidden) {
    const el = typeof document !== "undefined" ? document.getElementById("gameOverTitle") : null;
    if (el) el.hidden = hidden;
  }

  /**
   * How to type the headline: in sync with the voice when its timing arrives in time, otherwise
   * at a reading pace; instantly under reduced motion.
   * @param {string} title
   * @param {Promise<{delay:number,duration:number}|null>|undefined} speechTiming
   * @returns {Promise<{ delayMs: number, durationMs: number, instant: boolean }>}
   */
  static async _revealTiming(title, speechTiming) {
    if (prefersReducedMotion()) return { delayMs: 0, durationMs: 0, instant: true };
    const timing = speechTiming
      ? await Promise.race([
          speechTiming,
          new Promise((resolve) => setTimeout(() => resolve(null), SPEECH_TIMING_WAIT_MS)),
        ])
      : null;
    if (timing && timing.duration > 0) {
      return { delayMs: timing.delay * 1000, durationMs: timing.duration * 1000, instant: false };
    }
    const durationMs = Math.min(
      TYPE_MAX_MS,
      Math.max(TYPE_MIN_MS, title.length * TYPE_MS_PER_CHAR)
    );
    return { delayMs: 0, durationMs, instant: false };
  }

  /**
   * Render analysis into the post-game message container.
   * - If a result is cached, renders immediately
   * - Otherwise triggers analyze(stats) and updates when ready
   * @param {HTMLElement|null} container Typically the #postGameMessage element
   * @param {object} stats
   * @param {object|null} runSummary
   * @param {boolean} isRemote Whether remote mode is enabled
   * @param {((result: {title:string,sections:import("../adapters/AIAnalysisAdapter.js").DebriefSection[],isRemote:boolean,rawResponse?:any}) => void)|null} [onComplete] Optional callback when analysis completes
   * @param {import("./RunHistory.js").DebriefHistory|null} [history] Mission number and story
   *   hooks sent with the request (see RunHistory)
   */
  static render(
    container,
    stats,
    runSummary = null,
    isRemote = true,
    onComplete = null,
    history = null
  ) {
    if (!container) return;
    const locale =
      (runSummary && runSummary.device && runSummary.device.locale) ||
      (typeof navigator !== "undefined" ? navigator.language : null);
    const labels = debriefLabels(locale);
    if (AIAnalysisManager._reveal) AIAnalysisManager._reveal.cancel();
    AIAnalysisManager._reveal = null;

    const clear = () => {
      try {
        while (container.firstChild) container.removeChild(container.firstChild);
      } catch {
        /* non-critical cleanup of container children */
      }
    };

    const doRender = (payload) => {
      clear();
      AIAnalysisManager._setHeadlineHidden(false);
      const title = String(payload?.title ?? "");
      /** @type {HTMLElement|null} */
      let typed = null;
      try {
        const from = document.createElement("p");
        from.className = "debrief-from";
        from.textContent = labels.commander;
        const headline = document.createElement("p");
        headline.className = "debrief-headline";
        const spoken = document.createElement("span");
        spoken.className = "sr-only";
        spoken.textContent = title;
        typed = document.createElement("span");
        typed.className = "debrief-typed";
        typed.setAttribute("aria-hidden", "true");
        const shown = document.createElement("span");
        shown.className = "debrief-typed-shown";
        const rest = document.createElement("span");
        rest.className = "debrief-typed-rest";
        rest.textContent = title;
        typed.append(shown, rest);
        headline.append(spoken, typed);
        container.append(from, headline);
      } catch {
        /* non-critical creation of the headline */
      }
      /** @type {HTMLElement|null} */
      let debrief = null;
      try {
        debrief = document.createElement("div");
        debrief.className = "debrief pending";
        const sections = Array.isArray(payload?.sections) ? payload.sections : [];
        for (const section of sections) {
          const block = document.createElement("section");
          block.className = `debrief-section debrief-${section.kind === "done" ? "done" : "next"}`;
          const heading = document.createElement("h3");
          heading.textContent = String(section.heading ?? "");
          const ul = document.createElement("ul");
          for (const text of (Array.isArray(section.items) ? section.items : []).slice(0, 8)) {
            const li = document.createElement("li");
            li.textContent = String(text);
            ul.appendChild(li);
          }
          block.append(heading, ul);
          debrief.appendChild(block);
        }
        container.appendChild(debrief);
      } catch {
        /* non-critical creation of debrief sections */
      }
      try {
        const okBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById("okBtn"));
        if (okBtn) {
          okBtn.disabled = false;
          okBtn.hidden = false;
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
      const showSections = () => {
        if (debrief) debrief.classList.remove("pending");
        if (typed) typed.classList.remove("typing");
      };
      if (!typed) {
        showSections();
        return;
      }
      const box = typed;
      const shownEl = /** @type {HTMLElement} */ (box.querySelector(".debrief-typed-shown"));
      const restEl = /** @type {HTMLElement} */ (box.querySelector(".debrief-typed-rest"));
      /** Placeholder reveal until the timing is known; cancel() shows everything at once. */
      const pending = {
        cancelled: false,
        cancel: () => {
          pending.cancelled = true;
        },
      };
      AIAnalysisManager._reveal = pending;
      AIAnalysisManager._revealTiming(title, payload?.speechTiming).then((timing) => {
        const reveal = typewrite(shownEl, title, {
          ...timing,
          instant: timing.instant || pending.cancelled,
          restEl,
        });
        box.classList.toggle("typing", !(timing.instant || pending.cancelled));
        AIAnalysisManager._reveal = reveal;
        reveal.done.then(showSections);
      });
    };

    if (isRemote) {
      try {
        const p = document.createElement("p");
        p.className = "transmission";
        p.setAttribute("role", "status");
        const label = document.createElement("span");
        label.className = "transmission-label";
        label.textContent = `📡 ${labels.transmission}`;
        const dots = document.createElement("span");
        dots.className = "transmission-dots";
        dots.setAttribute("aria-hidden", "true");
        dots.textContent = "…";
        const from = document.createElement("span");
        from.className = "transmission-from";
        from.textContent = labels.commander;
        p.append(label, dots, from);
        container.appendChild(p);
        AIAnalysisManager._setHeadlineHidden(true);
      } catch {
        /* non-critical immediate placeholder render */
      }
      try {
        const audio = AIAnalysisManager.audio;
        if (audio && typeof audio.playTransmission === "function") audio.playTransmission();
      } catch {
        /* sound optional */
      }
      try {
        const okBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById("okBtn"));
        if (okBtn) {
          okBtn.disabled = true;
          okBtn.hidden = true;
          okBtn.tabIndex = -1;
          try {
            okBtn.blur();
          } catch {
            /* non-critical blur */
          }
        }
      } catch {
        /* non-critical hide of the ok button during the transmission */
      }
    }

    const maybe = AIAnalysisManager.analyze({
      stats,
      runSummary,
      ...(history ? { history } : {}),
    });
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
