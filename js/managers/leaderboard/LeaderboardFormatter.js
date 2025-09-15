/**
 * Pure formatting and qualification helpers for leaderboard entries.
 * Kept framework / DOM agnostic so they are trivial to unit test and reuse.
 */
export const MAX_DEFAULT = 10;

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
 * @param {number} [max=MAX_DEFAULT] Upper bound list length considered for qualification.
 * @returns {boolean} True if user should be prompted for initials.
 */
export function qualifiesForInitials(score, entries, max = MAX_DEFAULT) {
  if (typeof score !== "number" || !Number.isFinite(score) || score <= 0) return false;
  if (!Array.isArray(entries) || entries.length === 0) return true;
  if (entries.length < 3) return true;
  try {
    const sorted = entries
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, max);
    return sorted.some((e) => score > e.score);
  } catch (_) {
    return true;
  }
}

/**
 * Format a single leaderboard entry into both semantic parts and a composite text string.
 *
 * Presentation Rules:
 * - Medals for ranks 1–3 using emoji (🥇/🥈/🥉).
 * - Thumbs‑up indicator for ranks >=4 (legacy visual cue).
 * - Badge displays 1–3 uppercase letters; otherwise '???'.
 * - Text order: medal? + thumb? + rank — BADGE — score.
 *
 * @param {{id:string,score:number}} entry Canonical normalized entry.
 * @param {number} index Zero‑based index (rank = index + 1).
 * @returns {{rank:number,badge:string,medal:string,thumb:boolean,text:string}} Structured + textual formatting.
 */
export function formatRow(entry, index) {
  const rank = index + 1;
  const medals = ["🥇", "🥈", "🥉"];
  const medal = index < 3 ? medals[index] : "";
  const thumb = index >= 3;
  const badge = /^[A-Z]{1,3}$/.test(entry.id) ? entry.id : "???";
  const medalPrefix = medal ? medal + " " : "";
  const thumbPrefix = thumb ? "👍 " : "";
  const text = `${medalPrefix}${thumbPrefix}${rank} — ${badge} — ${entry.score}`;
  return { rank, badge, medal, thumb, text };
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
