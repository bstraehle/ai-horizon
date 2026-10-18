/**
 * initials.js – leaderboard initials rules shared by the initials prompt and LeaderboardManager.
 *
 * The leaderboard Lambda (server/lambda/leaderboard.js) is authoritative and keeps its own copy of
 * the blocklist because it deploys as a single file; tests/initials.test.js keeps both in sync.
 * The client copy only provides immediate feedback before a submission is sent.
 */

/** Initials rejected for the public leaderboard. */
export const BLOCKED_INITIALS = new Set([
  "ASS",
  "AZZ",
  "BCH",
  "CCK",
  "CLT",
  "CNT",
  "COC",
  "COK",
  "CUM",
  "CUN",
  "DCK",
  "DIC",
  "DIK",
  "FAG",
  "FAP",
  "FCK",
  "FKU",
  "FUC",
  "FUK",
  "FUQ",
  "HOE",
  "JIZ",
  "JZZ",
  "KKK",
  "KUM",
  "KYS",
  "NAZ",
  "NGA",
  "NGR",
  "NIG",
  "SEX",
  "SHT",
  "SLT",
  "SPK",
  "TIT",
  "TWT",
  "VAG",
  "WTF",
  "XXX",
]);

/**
 * @param {unknown} id
 * @returns {boolean} True for 1-3 upper-case letters that are not on the blocklist.
 */
export function isAllowedInitials(id) {
  return typeof id === "string" && /^[A-Z]{1,3}$/.test(id) && !BLOCKED_INITIALS.has(id);
}
