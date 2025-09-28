import { LeaderboardManager } from "../LeaderboardManager";

/**
 * Normalize raw leaderboard entries into a canonical immutable array shape.
 *
 * Behavior:
 * - Coerces each entry's `id` to a string (empty string fallback) and `score` to a finite number (0 fallback).
 * - Filters nothing: preserves array length for stable indexing; caller can filter separately.
 * - Defensive: non-array inputs yield an empty array.
 *
 * Complexity: O(N) over input length with minimal allocations (new array + small objects).
 *
 * @param {{id:any,score:any}[]|any} arr Potential untrusted raw data.
 * @returns {{id:string,score:number}[]} New normalized array (never the original reference).
 */
export function normalize(arr) {
  return Array.isArray(arr)
    ? arr.map((e) => ({ id: String(e?.id || ""), score: Number(e?.score || 0) }))
    : [];
}

/**
 * Determine whether a score qualifies for showing the initials input UI.
 *
 * Rules:
 * - Score must be a finite positive number (>0).
 * - Bootstrap: if fewer than 3 existing entries, any positive score qualifies.
 * - Otherwise sort descending, take top `max`, and succeed if the candidate score strictly beats
 *   at least one of those (ties do NOT qualify to encourage improvement).
 * - Fail‑open philosophy: unexpected errors (sorting, data shape) return true to avoid UX dead‑ends.
 *
 * @param {number} score Candidate score.
 * @param {{id:string,score:number}[]|null|undefined} entries Current (possibly unsorted) entries.
 * @param {number} [max=LeaderboardManager.MAX_ENTRIES] Upper bound list length considered for qualification.
 * @returns {boolean} True if user should be prompted for initials.
 */
export function qualifiesForInitials(score, entries, max = LeaderboardManager.MAX_ENTRIES) {
  if (typeof score !== "number" || !Number.isFinite(score) || score <= 0) return false;
  if (!Array.isArray(entries) || entries.length === 0) return true; // empty board bootstrap
  try {
    const sorted = entries.slice().sort((a, b) => b.score - a.score);
    // If the board is not yet full, accept any positive score (space remains)
    if (sorted.length < max) return true;
    // Board full: require strictly beating the cutoff (lowest score within top max)
    const cutoff = sorted[max - 1]?.score;
    return typeof cutoff === "number" && Number.isFinite(cutoff) ? score > cutoff : true;
  } catch (_) {
    // Fail-open to avoid blocking UX if data shape unexpectedly breaks sorting.
    return true;
  }
}

/**
 * Format a single leaderboard entry into both semantic parts and a composite text string.
 *
 * Presentation Rules:
 * - Medals for ranks 1–3 using emoji (🥇/🥈/🥉).
 * - Ranks 4–10: clapping hands emoji (👏).
 * - Ranks 11–25: thumbs‑up emoji (👍).
 * - Ranks >25: no additional icon (still supported if more than MAX_ENTRIES passed into formatRows safeguard).
 * - Badge displays 1–3 uppercase letters; otherwise '???'.
 * - Text order: medal? + icon? + rank — BADGE — score.
 *
 * @param {{id:string,score:number}} entry Canonical normalized entry.
 * @param {number} index Zero‑based index (rank = index + 1).
 * @returns {{rank:number,badge:string,medal:string,thumb:boolean,icon:string,text:string}} Structured + textual formatting.
 */
export function formatRow(entry, index) {
  const rank = index + 1;
  const medals = ["🥇", "🥈", "🥉"];
  const medal = index < 3 ? medals[index] : "";
  let icon = "";
  if (!medal) {
    if (rank >= 4 && rank <= 10) icon = "👏";
    else if (rank >= 11 && rank <= 25) icon = "👍";
  }
  const badge = /^[A-Z]{1,3}$/.test(entry.id) ? entry.id : "???";
  const medalPrefix = medal ? medal + " " : "";
  const iconPrefix = icon ? icon + " " : "";
  const text = `${medalPrefix}${iconPrefix}${rank} — ${badge} — ${entry.score}`;
  // Backward compatibility: retain `thumb` boolean to indicate thumbs-up specifically.
  const thumb = icon === "👍";
  return { rank, badge, medal, thumb, icon, text };
}

/**
 * Batch format multiple entries into an array of text rows.
 *
 * Safeguards:
 * - Limits output to first 100 entries to avoid pathological DOM list inflation.
 * - Non-array or empty array returns an empty list (pure behavior).
 *
 * @param {{id:string,score:number}[]} entries Normalized entries.
 * @returns {string[]} Formatted text lines (length <= 100).
 */
export function formatRows(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  return entries.slice(0, 100).map((e, idx) => formatRow(e, idx).text);
}
