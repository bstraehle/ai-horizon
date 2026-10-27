/**
 * The two debrief commanders and who radios the pilot after a mission.
 *
 * Commander Vega (she/her) is the gruff veteran mentor; Captain Straehle (he/him), call sign
 * "Altair", is the hotshot ace (their personas and voices live in server/lambda/analysis.js:
 * Vega's an Amazon Polly voice, Altair's a custom ElevenLabs voice that speaks every language;
 * their radio tones in CONFIG.AUDIO.COMMANDERS). Vega debriefs every mission that ends before the
 * full 90 seconds, record or not; Altair debriefs every full mission. His debut (introducing
 * himself) is the first full mission with the AI debrief online, so it is never spent on an
 * offline line; offline full missions before it get his offline lines without the introduction.
 */

/** @typedef {"vega"|"altair"} CommanderId */

/**
 * Display names in the English story hooks (the commanders word them in the player's language).
 * Altair is Captain Straehle's call sign, so the star-crossed legend of Vega and Altair still fits.
 */
const NAMES = { vega: "Commander Vega", altair: "Captain “Altair” Straehle" };

/** Longest quoted line from the last debrief in a story hook. */
const MAX_QUOTE_CHARS = 140;

/**
 * The last debrief's headline without its sentences that contain a number: those numbers were
 * about that mission, and the model would otherwise reuse them as if they described this one
 * (e.g. "381 more than your best" turned into "down 381 from your best").
 * @param {string} line
 * @returns {string} Empty when every sentence has a number.
 */
export function quotableLine(line) {
  return line
    .split(/(?<=[.!?。！？])\s*/u)
    .filter((s) => s.trim() && !/\p{Nd}/u.test(s))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @typedef {{ t: number, score: number, survived: number, total: number,
 *   verdict: string|null, top?: number }} MissionLike The fields of a RunEntry used here.
 * @typedef {{ altairMet?: boolean, line?: string, lineBy?: CommanderId }} CastMemory
 *   Stored with the run history: whether Altair has been introduced, and the last debrief
 *   headline and its speaker.
 */

/** @param {unknown} id @returns {id is CommanderId} */
export const isCommander = (id) => id === "vega" || id === "altair";

/**
 * Whether a mission beat the leaderboard's top score (as known when it ended).
 * @param {{ score: number, top?: number }} entry
 */
export const isOverallRecord = (entry) => !!entry.top && entry.top > 0 && entry.score > entry.top;

/**
 * The 7th day of the 7th month, in the Gregorian (Tanabata) or Chinese lunisolar calendar
 * (Chilseok / Qixi): the day the legend lets Vega and Altair meet across the Milky Way.
 * @param {number} t Timestamp (ms).
 * @param {string} [timeZone] Defaults to the device's time zone.
 */
export function isStarCrossedDay(t, timeZone) {
  const monthDay = (/** @type {string} */ calendar) => {
    const parts = new Intl.DateTimeFormat(`en-u-ca-${calendar}`, {
      month: "numeric",
      day: "numeric",
      ...(timeZone ? { timeZone } : {}),
    }).formatToParts(t);
    const part = (/** @type {string} */ type) => parts.find((p) => p.type === type)?.value;
    return `${part("month")}/${part("day")}`;
  };
  try {
    return monthDay("gregory") === "7/7" || monthDay("chinese") === "7/7";
  } catch {
    return false;
  }
}

/**
 * Who debriefs the mission that just ended: Vega when it ended early, Altair when it was full.
 * @param {MissionLike} entry
 * @param {CastMemory} cast
 * @param {boolean} [online] Whether the AI debrief is available; Altair's debut waits for it, so
 *   his introduction is never spent on an offline line.
 * @returns {{ commander: CommanderId, debut: boolean }}
 */
export function pickCommander(entry, cast, online = true) {
  if (entry.survived < entry.total) return { commander: "vega", debut: false };
  return { commander: "altair", debut: !cast.altairMet && online };
}

/**
 * Story hooks about the commanders themselves: Altair's debut and the star-crossed day go first
 * (the debrief reacts to the first hook), the last debrief's line goes last, without its
 * numbers (see {@link quotableLine}).
 * @param {{ commander: CommanderId, debut: boolean }} pick
 * @param {MissionLike} entry
 * @param {CastMemory} cast
 * @returns {{ lead: string[], tail: string[] }}
 */
export function commanderHooks(pick, entry, cast) {
  const lead = [];
  if (pick.debut) {
    lead.push(
      `${NAMES.altair}'s first debrief with this pilot: Commander Vega handed the pilot over to him after their first full ${entry.total}-second mission. Briefly introduce yourself with your rank, name and call sign.`
    );
  }
  if (isStarCrossedDay(entry.t)) {
    const other = pick.commander === "vega" ? NAMES.altair : NAMES.vega;
    lead.push(
      `Today is the 7th day of the 7th month, when the legend lets Vega and Altair meet across the Milky Way once a year. Mention ${other} in a short aside.`
    );
  }
  const tail = [];
  const quoted = cast.line ? quotableLine(cast.line) : "";
  if (quoted && isCommander(cast.lineBy)) {
    const line =
      quoted.length > MAX_QUOTE_CHARS ? `${quoted.slice(0, MAX_QUOTE_CHARS - 1)}…` : quoted;
    tail.push(`Last mission, ${NAMES[cast.lineBy]} told the pilot: "${line}"`);
  }
  return { lead, tail };
}
