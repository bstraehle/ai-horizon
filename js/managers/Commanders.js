/**
 * The two debrief commanders and who radios the pilot after a mission.
 *
 * Commander Vega (she/her) is the gruff veteran mentor; Captain Altair (he/him) is the hotshot
 * ace (their personas live in server/lambda/analysis.js, their voices and radio tones in
 * CONFIG.AUDIO.COMMANDERS). Vega debriefs alone until the pilot's first full mission, which is
 * Altair's debut; from then on they take turns, except that a new personal best always goes to
 * Altair and a third early crash in a row always goes to Vega. Languages without a male Polly
 * voice keep Vega, so a character never switches voice.
 */

/** @typedef {"vega"|"altair"} CommanderId */

/** Display names in the English story hooks (the commanders word them in the player's language). */
const NAMES = { vega: "Commander Vega", altair: "Captain Altair" };

/** Debrief languages without a male Polly voice (see GENERATIVE_VOICES in analysis.js). */
const VEGA_ONLY_LANGUAGES = ["nl", "pl"];

/** Longest quoted line from the last debrief in a story hook. */
const MAX_QUOTE_CHARS = 140;

/**
 * @typedef {{ t: number, score: number, survived: number, total: number,
 *   verdict: string|null }} MissionLike The fields of a RunEntry used here.
 * @typedef {{ last?: CommanderId, altairMet?: boolean, line?: string, lineBy?: CommanderId }} CastMemory
 *   Stored with the run history: who spoke last, whether Altair has been introduced, and the
 *   last debrief headline and its speaker.
 */

/** @param {unknown} id @returns {id is CommanderId} */
export const isCommander = (id) => id === "vega" || id === "altair";

/**
 * Whether the locale's language has a male narrator voice (otherwise only Vega speaks).
 * @param {string|null|undefined} locale
 */
export function altairCanSpeak(locale) {
  const lang = String(locale || "en")
    .split(/[-_]/)[0]
    .toLowerCase();
  return !VEGA_ONLY_LANGUAGES.includes(lang);
}

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
 * Who debriefs the mission that just ended.
 * @param {MissionLike} entry
 * @param {MissionLike[]} previous Earlier missions on this device, oldest first.
 * @param {CastMemory} cast
 * @param {string|null|undefined} locale
 * @param {number} [allTimeBest] Best score before this mission (defaults to the best in
 *   `previous`, which only holds the most recent missions).
 * @returns {{ commander: CommanderId, debut: boolean }}
 */
export function pickCommander(entry, previous, cast, locale, allTimeBest) {
  const vega = { commander: /** @type {CommanderId} */ ("vega"), debut: false };
  const altair = { commander: /** @type {CommanderId} */ ("altair"), debut: false };
  if (!altairCanSpeak(locale)) return vega;
  if (!cast.altairMet) return entry.survived >= entry.total ? { ...altair, debut: true } : vega;
  const best = allTimeBest ?? previous.reduce((b, e) => Math.max(b, e.score), 0);
  if (best > 0 && entry.score > best) return altair;
  let crashes = 0;
  for (let i = previous.length - 1; i >= 0 && previous[i].verdict === "reprimand"; i--) crashes++;
  if (entry.verdict === "reprimand" && crashes >= 2) return vega;
  return cast.last === "vega" ? altair : vega;
}

/**
 * Story hooks about the commanders themselves: Altair's debut and the star-crossed day go first
 * (the debrief reacts to the first hook), the last debrief's line goes last.
 * @param {{ commander: CommanderId, debut: boolean }} pick
 * @param {MissionLike} entry
 * @param {CastMemory} cast
 * @returns {{ lead: string[], tail: string[] }}
 */
export function commanderHooks(pick, entry, cast) {
  const lead = [];
  if (pick.debut) {
    lead.push(
      `Captain Altair's first debrief with this pilot: Commander Vega handed the pilot over to him after their first full ${entry.total}-second mission. Briefly introduce yourself.`
    );
  }
  if (isStarCrossedDay(entry.t)) {
    const other = pick.commander === "vega" ? NAMES.altair : NAMES.vega;
    lead.push(
      `Today is the 7th day of the 7th month, when the legend lets Vega and Altair meet across the Milky Way once a year. Mention ${other} in a short aside.`
    );
  }
  const tail = [];
  if (cast.line && isCommander(cast.lineBy)) {
    const line =
      cast.line.length > MAX_QUOTE_CHARS
        ? `${cast.line.slice(0, MAX_QUOTE_CHARS - 1)}…`
        : cast.line;
    tail.push(`Last mission, ${NAMES[cast.lineBy]} told the pilot: "${line}"`);
  }
  return { lead, tail };
}
