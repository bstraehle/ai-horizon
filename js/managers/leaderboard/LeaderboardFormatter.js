/**
 * Pure formatting and qualification helpers for leaderboard entries.
 * Kept framework / DOM agnostic so they are trivial to unit test and reuse.
 */
export const MAX_DEFAULT = 10;

/** Normalize raw entries into canonical shape (non-mutating). */
/** @param {{id:any,score:any}[]|any} arr */
export function normalize(arr) {
  return Array.isArray(arr)
    ? arr.map((e) => ({ id: String(e?.id || ""), score: Number(e?.score || 0) }))
    : [];
}

/**
 * Determine if a score qualifies for initials entry given current entries.
 * Rules:
 *  - Score must be > 0.
 *  - If fewer than 3 existing entries, any positive score qualifies (bootstrap behavior).
 *  - Otherwise require the score to exceed at least one of the current top max scores.
 * NOTE: `entries` may be unsorted; function does not mutate the input.
 * @param {number} score
 * @param {{id:string,score:number}[]|null|undefined} entries
 * @param {number} [max=MAX_DEFAULT]
 */
export function qualifiesForInitials(score, entries, max = MAX_DEFAULT) {
  if (typeof score !== "number" || !Number.isFinite(score) || score <= 0) return false;
  if (!Array.isArray(entries) || entries.length === 0) return true;
  if (entries.length < 3) return true; // bootstrap threshold
  try {
    const sorted = entries
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, max);
    return sorted.some((e) => score > e.score);
  } catch (_) {
    return true; // fail open (best effort UI behavior)
  }
}

/**
 * Produce display label components for an entry.
 * @param {{id:string,score:number}} entry
 * @param {number} index Zero-based rank index
 * @returns {{rank:number,badge:string,medal:string,thumb:boolean,text:string}}
 */
export function formatRow(entry, index) {
  const rank = index + 1;
  const medals = ["🥇", "🥈", "🥉"];
  const medal = index < 3 ? medals[index] : "";
  const thumb = index >= 3; // matches previous visual design
  const badge = /^[A-Z]{1,3}$/.test(entry.id) ? entry.id : "???";
  const medalPrefix = medal ? medal + " " : "";
  const thumbPrefix = thumb ? "👍 " : "";
  const text = `${medalPrefix}${thumbPrefix}${rank} — ${badge} — ${entry.score}`;
  return { rank, badge, medal, thumb, text };
}

/**
 * Format multiple entries in one pass (pure helper).
 * @param {{id:string,score:number}[]} entries
 * @returns {string[]} text rows limited to 100 items (UI safeguard)
 */
export function formatRows(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  return entries.slice(0, 100).map((e, idx) => formatRow(e, idx).text);
}

export default {
  normalize,
  qualifiesForInitials,
  formatRow,
  formatRows,
};
