/**
 * Story hooks about the pilot's day (see RunHistory.js): a recap of the last session on the
 * first mission of a new day, so the commander remembers where the pilot left off, and the
 * rough local time of day to allude to. Computed on the device; only these coarse English facts
 * go out with the debrief request (never a clock time).
 */

const DAY_MS = 86_400_000;

/**
 * @typedef {{ date: string, missions: number, best: number }} DaySummary
 *   Missions flown on one local calendar day (`YYYY-MM-DD`) and their best score, stored with
 *   the run history so the recap does not depend on the most recent missions alone.
 * @typedef {{ t: number, score: number, survived: number, total: number }} MissionLike
 */

/**
 * Local calendar date, hour and weekday of a timestamp.
 * @param {number} t Timestamp (ms).
 * @param {string} [timeZone] Defaults to the device's time zone.
 * @returns {{ date: string, hour: number, weekday: string }}
 */
export function localTime(t, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    hourCycle: "h23",
    weekday: "long",
    ...(timeZone ? { timeZone } : {}),
  }).formatToParts(t);
  const part = (/** @type {string} */ type) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    hour: Number(part("hour")) % 24,
    weekday: part("weekday"),
  };
}

/**
 * Part of the day for a local hour.
 * @param {number} hour 0-23
 */
export function partOfDay(hour) {
  if (hour < 5) return "late night";
  if (hour < 8) return "early morning";
  if (hour < 11) return "morning";
  if (hour < 14) return "lunchtime";
  if (hour < 18) return "afternoon";
  if (hour < 22) return "evening";
  return "late night";
}

/** "late night" → "late at night", for "yesterday …". */
const AT = {
  "late night": "late at night",
  "early morning": "early in the morning",
  morning: "in the morning",
  lunchtime: "at lunchtime",
  afternoon: "in the afternoon",
  evening: "in the evening",
};

/**
 * Missions on the current local day including this one, and the stored day summary to keep.
 * @param {MissionLike} entry
 * @param {DaySummary|null} day Stored summary (any day).
 * @param {string} [timeZone]
 * @returns {DaySummary}
 */
export function nextDay(entry, day, timeZone) {
  const { date } = localTime(entry.t, timeZone);
  return day && day.date === date
    ? { date, missions: day.missions + 1, best: Math.max(day.best, entry.score) }
    : { date, missions: 1, best: entry.score };
}

/**
 * On the first mission of a new local day, a recap of the pilot's last session (the last day
 * they flew): when, how many missions, the best score, and how the last mission ended; null
 * otherwise. Uses the stored day summary when it covers that day, else the remembered missions.
 * @param {MissionLike} entry
 * @param {MissionLike[]} previous Earlier missions on this device, oldest first.
 * @param {DaySummary|null} day
 * @param {string} [timeZone]
 * @returns {string|null}
 */
export function sessionRecap(entry, previous, day, timeZone) {
  const last = previous[previous.length - 1];
  if (!last) return null;
  const now = localTime(entry.t, timeZone);
  const then = localTime(last.t, timeZone);
  if (now.date === then.date) return null;
  const days = Math.round((Date.parse(now.date) - Date.parse(then.date)) / DAY_MS);
  const at = AT[/** @type {keyof typeof AT} */ (partOfDay(then.hour))];
  const when = days === 1 ? `yesterday ${at}` : `${days} days ago, on ${then.weekday} ${at}`;
  const sameDay = previous.filter((e) => localTime(e.t, timeZone).date === then.date);
  const session =
    day && day.date === then.date
      ? day
      : { missions: sameDay.length, best: Math.max(...sameDay.map((e) => e.score)) };
  const ended =
    last.survived >= last.total
      ? `a full ${last.total}-second mission`
      : `a crash after ${last.survived} seconds`;
  const missions = `${session.missions} mission${session.missions === 1 ? "" : "s"}`;
  return `First mission today. The pilot's last session was ${when}: ${missions}, best ${session.best} points, ending with ${ended}.`;
}

/**
 * The pilot's rough local time of day and weekday (no clock time), plus how many missions they
 * have flown today from the 3rd on.
 * @param {MissionLike} entry
 * @param {number} missionsToday Including this one.
 * @param {string} [timeZone]
 * @returns {string}
 */
export function timeOfDayHook(entry, missionsToday, timeZone) {
  const { hour, weekday } = localTime(entry.t, timeZone);
  const count = missionsToday >= 3 ? ` This is mission ${missionsToday} today.` : "";
  return `The pilot's local time: ${weekday}, ${partOfDay(hour)}; allude to it lightly, never as a clock time.${count}`;
}
