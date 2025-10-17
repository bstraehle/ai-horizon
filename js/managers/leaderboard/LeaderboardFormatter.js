import { LeaderboardManager } from "../LeaderboardManager";

/**
 * @typedef {Object} LeaderboardEntry
 * @property {string} id   Upper‑case initials (1–3 chars) or placeholder.
 * @property {number} score Non‑negative integer score.
 * @property {number} [accuracy] Accuracy as decimal (0.0-1.0).
 * @property {string} [date] ISO date string (YYYY-MM-DD) when score was achieved.
 *
 * @typedef {Object} FormattedRow
 * @property {number} rank   1‑based rank.
 * @property {string} badge  Sanitized / validated `id` ("???" fallback).
 * @property {string} medal  Medal emoji for top 3 or empty string.
 * @property {string} icon   Secondary icon (👏) for non‑medal ranks within range.
 * @property {string} text   Composite presentation string.
 * @property {string} accuracyFormatted Formatted accuracy (XX%) or empty string.
 * @property {string} dateFormatted Formatted date (YYYY-MM-DD) or empty string.
 */

/**
 * Normalize potentially untrusted raw data into safe immutable entries.
 * - Always returns a new array (never mutates input).
 * - Coerces `id` to string (empty string fallback) and `score` to finite number (0 fallback).
 * - Preserves `date` field if present and valid string, otherwise omits it.
 * - Preserves original ordering and length (caller decides filtering / sorting separately).
 *
 * @param {any} arr Incoming value (expected array of objects with `id` & `score`).
 * @returns {LeaderboardEntry[]} Normalized entries array (empty when input invalid).
 */
export function normalize(arr) {
  return Array.isArray(arr)
    ? arr.map((e) => {
        /** @type {LeaderboardEntry} */
        const entry = { id: String(e?.id || ""), score: Number(e?.score || 0) };
        if (typeof e?.accuracy === "number") {
          entry.accuracy = e.accuracy;
        }
        if (e?.date && typeof e.date === "string") {
          entry.date = e.date;
        }
        return entry;
      })
    : [];
}

/**
 * Decide whether a new score should trigger the initials entry UI.
 * Algorithm:
 * 1. Reject non‑finite or non‑positive scores.
 * 2. Accept immediately if board empty OR has fewer than `max` entries.
 * 3. Otherwise compute cutoff = score of the last (worst) entry within top `max` after sorting descending.
 * 4. Qualify only when candidate strictly beats cutoff (ties excluded to promote improvement).
 * Fail‑open: unexpected runtime issues (e.g., malformed data) return `true` to avoid blocking the player.
 *
 * @param {number} score Candidate score.
 * @param {LeaderboardEntry[]|null|undefined} entries Current entries (unsorted allowed).
 * @param {number} [max=LeaderboardManager.MAX_ENTRIES] Max leaderboard length considered.
 * @returns {boolean} True if initials collection should proceed.
 */
export function qualifiesForInitials(score, entries, max = LeaderboardManager.MAX_ENTRIES) {
  if (typeof score !== "number" || !Number.isFinite(score) || score <= 0) return false;
  if (!Array.isArray(entries) || entries.length === 0) return true;
  try {
    const sorted = entries.slice().sort((a, b) => b.score - a.score);
    if (sorted.length < max) return true;
    const cutoff = sorted[max - 1]?.score;
    return typeof cutoff === "number" && Number.isFinite(cutoff) ? score > cutoff : true;
  } catch (_) {
    return true;
  }
}

/**
 * Produce semantic + textual formatting for a single entry.
 * Presentation:
 * - Ranks 1–3 receive medal emoji (🥇🥈🥉).
 * - Remaining ranks up to MAX_ENTRIES receive a clap icon (👏).
 * - Badge is the validated initials (1–3 A–Z) or "???" fallback.
 * - Accuracy is formatted as XX% (rounded to whole number) or empty string if missing.
 * - Date is formatted as YYYY-MM-DD or empty string if missing.
 * - Text layout: `[medal ][icon ]<rank> — <BADGE> — <score>[ — XX%][ — YYYY-MM-DD]` (spaces only when parts present).
 *
 * @param {LeaderboardEntry} entry Normalized entry.
 * @param {number} index Zero‑based index within already ordered list.
 * @returns {FormattedRow} Structured + composite formatting.
 */
export function formatRow(entry, index) {
  const rank = index + 1;
  const medals = ["🥇", "🥈", "🥉"];
  const medal = index < 3 ? medals[index] : "";
  const needsClap = !medal && rank >= 4 && rank <= LeaderboardManager.MAX_ENTRIES;
  const icon = needsClap ? "👏" : "";
  const badge = /^[A-Z]{1,3}$/.test(entry.id) ? entry.id : "???";

  let accuracyFormatted = "";
  if (typeof entry.accuracy === "number" && !isNaN(entry.accuracy)) {
    const accuracyPercent = Math.round(entry.accuracy * 100);
    accuracyFormatted = `${accuracyPercent}%`;
  }

  const dateFormatted = entry.date || "";
  const medalPrefix = medal ? medal + " " : "";
  const iconPrefix = icon ? icon + " " : "";
  const accuracySuffix = accuracyFormatted ? " — " + accuracyFormatted : "";
  const dateSuffix = dateFormatted ? " — " + dateFormatted : "";
  const text = `${medalPrefix}${iconPrefix}${rank} — ${badge} — ${entry.score}${accuracySuffix}${dateSuffix}`;
  return { rank, badge, medal, icon, text, accuracyFormatted, dateFormatted };
}

/**
 * Vectorized convenience wrapper: returns presentation strings for many entries.
 * Safeguards: caps output at 100 rows to avoid excessive DOM inflation.
 *
 * @param {LeaderboardEntry[]} entries Pre‑sorted normalized entries.
 * @returns {string[]} Presentation strings (<=100 length).
 */
export function formatRows(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  return entries.slice(0, 100).map((e, idx) => formatRow(e, idx).text);
}
