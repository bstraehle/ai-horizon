import { CONFIG } from "../constants.js";

/**
 * Share – leaderboard "Share" link: sends the last score plus the canonical game URL through the
 * Web Share API, falling back to copying the same text to the clipboard. The URL is always
 * `CONFIG.SHARE.URL` (never `location`) so shares from dev servers, portals, or the Play Store
 * wrapper all point players at the production site.
 *
 * @typedef {{ title: string, text: string, url: string }} ShareData
 * @typedef {"shared"|"copied"|"cancelled"|"unavailable"} ShareResult
 * @typedef {{ share?: (data: ShareData) => Promise<void>, canShare?: (data: ShareData) => boolean, clipboard?: { writeText?: (text: string) => Promise<void> } }} ShareNavigator
 */

/**
 * Build the share payload for a finished run; a non-positive score yields a generic invite.
 * @param {number} score
 * @param {string} [url]
 * @returns {ShareData}
 */
export function buildShareData(score, url = CONFIG.SHARE.URL) {
  const points = Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;
  const text =
    points > 0
      ? `I scored ${points.toLocaleString("en-US")} points in AI HORIZON. Can you beat it?`
      : "Collect stars, blast asteroids, and beat the clock in AI HORIZON.";
  return { title: CONFIG.SHARE.TITLE, text, url };
}

/**
 * Share via the native share sheet when available, otherwise copy `text url` to the clipboard.
 * A user-dismissed share sheet resolves to "cancelled" without falling back; other share errors
 * fall through to the clipboard. Never rejects.
 * @param {ShareData} data
 * @param {ShareNavigator|undefined} [nav]
 * @returns {Promise<ShareResult>}
 */
export async function shareScore(
  data,
  nav = typeof navigator !== "undefined" ? navigator : undefined
) {
  if (nav && typeof nav.share === "function") {
    const allowed = typeof nav.canShare !== "function" || nav.canShare(data);
    if (allowed) {
      try {
        await nav.share(data);
        return "shared";
      } catch (err) {
        if (err && /** @type {{name?:string}} */ (err).name === "AbortError") return "cancelled";
      }
    }
  }
  try {
    const clipboard = nav && nav.clipboard;
    if (!clipboard || typeof clipboard.writeText !== "function") return "unavailable";
    await clipboard.writeText(`${data.text} ${data.url}`);
    return "copied";
  } catch {
    return "unavailable";
  }
}

/**
 * Wire the Share link. Clicking shares the score returned by `getScore` at click time; clipboard
 * and failure outcomes briefly replace the link label, then restore it after
 * `CONFIG.SHARE.FEEDBACK_MS`. The link's `href` stays a plain fallback for when JS is unavailable.
 * @param {HTMLAnchorElement|HTMLElement|null} el
 * @param {() => number} getScore
 * @param {ShareNavigator|undefined} [nav]
 */
export function initShareLink(
  el,
  getScore,
  nav = typeof navigator !== "undefined" ? navigator : undefined
) {
  if (!el) return;
  const label = el.textContent;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let resetTimer = null;
  el.addEventListener("click", async (e) => {
    e.preventDefault();
    const result = await shareScore(buildShareData(getScore()), nav);
    const feedback =
      result === "copied" ? "Link copied" : result === "unavailable" ? "Share unavailable" : null;
    if (!feedback) return;
    el.textContent = feedback;
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      el.textContent = label;
    }, CONFIG.SHARE.FEEDBACK_MS);
  });
}
