import { LocalStorageAdapter } from "../adapters/LocalStorageAdapter.js";
import { missionVerdict } from "../adapters/AIAnalysisAdapter.js";
import { CONFIG } from "../constants.js";
import { commanderHooks, isCommander, pickCommander } from "./Commanders.js";

/**
 * @typedef {{ t: number, score: number, survived: number, total: number,
 *   verdict: "commendation"|"satisfactory"|"reprimand"|null, accuracy: number, bonus: number }} RunEntry
 *   One finished mission as remembered on this device.
 * @typedef {import("./Commanders.js").CastMemory} CastMemory
 * @typedef {import("./Commanders.js").CommanderId} CommanderId
 * @typedef {{ count: number, runs: RunEntry[], cast: CastMemory }} RunHistoryData
 *   `count` is every mission recorded; `runs` keeps only the most recent ones; `cast` remembers
 *   the debrief commanders (see Commanders.js).
 * @typedef {{ mission: number, hooks: string[], commander: CommanderId }} DebriefHistory
 *   Sent with the debrief request: the mission's number, its story hooks, and who debriefs it.
 */

/** Most story hooks about the run and the commanders' debut / star-crossed day together. */
const MAX_LEAD_AND_RUN_HOOKS = 3;

/**
 * The parts of a run summary (see `AIHorizon._logRunSummary`) worth remembering.
 * @param {any} summary
 * @param {number} [now] Timestamp (ms).
 * @returns {RunEntry|null} null without a survived time.
 */
export function runEntry(summary, now = Date.now()) {
  const timer = summary && summary.timer;
  if (!timer || !Number.isFinite(timer.survivedSeconds)) return null;
  const stats = summary.stats || {};
  const num = (/** @type {unknown} */ v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    t: now,
    score: num(summary.score && summary.score.playerFinalScore),
    survived: timer.survivedSeconds,
    total: Number.isFinite(timer.totalSeconds) ? timer.totalSeconds : CONFIG.GAME.TIMER_SECONDS,
    verdict: missionVerdict(summary),
    accuracy: num(stats.shotsFiredAccuracy),
    bonus: num(stats.bonusAsteroidsKilled),
  };
}

/** @param {number} n @returns {string} English ordinal, e.g. "2nd", "11th", "23rd". */
export function ordinal(n) {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th");
  return `${n}${suffix}`;
}

/** Mission counts worth a remark. */
const MILESTONES = [10, 25, 50, 100, 200, 500];

/**
 * Story hooks: what changed compared with the pilot's earlier missions, as short English facts
 * for the debrief commander to react to (she words them in the player's language), most
 * interesting first. Exact numbers only; nothing is guessed.
 * @param {RunEntry} entry The mission that just ended.
 * @param {RunEntry[]} previous Earlier missions on this device, oldest first.
 * @param {number} mission This mission's number (1 for the first ever).
 * @param {number} [max] Most hooks returned.
 * @returns {string[]}
 */
export function storyHooks(entry, previous, mission, max = 3) {
  if (!previous.length) return mission <= 1 ? ["This is the pilot's first mission."] : [];
  /** @type {{ rank: number, text: string }[]} */
  const hooks = [];
  const add = (/** @type {number} */ rank, /** @type {string} */ text) =>
    hooks.push({ rank, text });
  const full = (/** @type {RunEntry} */ e) => e.survived >= e.total;
  /** Missions at the end of `previous` that match `test`. */
  const trailing = (/** @type {(e: RunEntry) => boolean} */ test) => {
    let k = 0;
    for (let i = previous.length - 1; i >= 0 && test(previous[i]); i--) k++;
    return k;
  };
  const last = previous[previous.length - 1];
  const pct = (/** @type {number} */ v) => Math.round(v * 100);

  const best = Math.max(...previous.map((e) => e.score));
  if (best > 0 && entry.score > best) {
    add(
      100,
      `New personal best: ${entry.score} points, ${entry.score - best} more than the previous best of ${best}.`
    );
  } else if (best > 0 && entry.score > 0 && entry.score >= best * 0.9) {
    add(60, `Only ${best - entry.score} points short of the personal best of ${best}.`);
  }
  if (full(entry) && !previous.some(full)) {
    add(95, `First time the pilot flew the full ${entry.total} seconds.`);
  }
  if (entry.verdict === "commendation" && !previous.some((e) => e.verdict === "commendation")) {
    add(90, "First commendation for this pilot.");
  }
  const fullStreak = trailing(full);
  if (full(entry) && fullStreak >= 1) {
    add(70, `${ordinal(fullStreak + 1)} full mission in a row.`);
  } else if (!full(entry) && fullStreak >= 3) {
    add(75, `This crash ends a streak of ${fullStreak} full missions.`);
  }
  if (entry.verdict === "reprimand") {
    const crashes = trailing((e) => e.verdict === "reprimand");
    if (crashes >= 2) add(65, `${ordinal(crashes + 1)} early crash in a row.`);
  }
  const bestBonus = Math.max(...previous.map((e) => e.bonus));
  if (entry.bonus >= 3 && entry.bonus > bestBonus) {
    add(58, `Most bonus asteroids ever: ${entry.bonus}, previous best ${bestBonus}.`);
  }
  if (!full(last) && entry.survived - last.survived >= 15) {
    add(
      55,
      `Survived ${entry.survived - last.survived} seconds longer than last mission (${last.survived} seconds).`
    );
  }
  const recent = previous.slice(-5);
  const avg = recent.reduce((sum, e) => sum + e.accuracy, 0) / recent.length;
  if (recent.length >= 2 && entry.accuracy - avg >= 0.1) {
    add(
      50,
      `Accuracy ${pct(entry.accuracy)}%, up from an average of ${pct(avg)}% over the last ${recent.length} missions.`
    );
  }
  const days = Math.floor((entry.t - last.t) / 86_400_000);
  if (days >= 7) add(45, `First mission in ${days} days.`);
  if (MILESTONES.includes(mission)) add(40, `This is the pilot's ${ordinal(mission)} mission.`);

  return hooks
    .sort((a, b) => b.rank - a.rank)
    .slice(0, max)
    .map((h) => h.text);
}

/** @param {any} e @returns {e is RunEntry} */
const isEntry = (e) =>
  !!e && typeof e === "object" && [e.t, e.score, e.survived, e.total].every(Number.isFinite);

/** @param {any} cast @returns {CastMemory} The valid parts of a stored cast memory. */
function readCast(cast) {
  if (!cast || typeof cast !== "object") return {};
  return {
    ...(isCommander(cast.last) ? { last: cast.last } : {}),
    ...(cast.altairMet === true ? { altairMet: true } : {}),
    ...(typeof cast.line === "string" && isCommander(cast.lineBy)
      ? { line: cast.line, lineBy: cast.lineBy }
      : {}),
  };
}

/**
 * RunHistory – the pilot's recent missions on this device (localStorage only), so the debrief
 * commanders can remember them: personal bests, streaks, improvements, and what was said last
 * time. Never sent anywhere as a whole; only the derived story hooks go out with a debrief
 * request.
 */
export class RunHistory {
  /**
   * @param {{ storage?: LocalStorageAdapter, key?: string, max?: number }} [opts]
   */
  constructor(opts = {}) {
    this.storage = opts.storage || new LocalStorageAdapter();
    this.key = opts.key || CONFIG.HISTORY.STORAGE_KEY;
    this.max = opts.max || CONFIG.HISTORY.MAX_RUNS;
  }

  /** @returns {RunHistoryData} Stored history; empty when missing or corrupt. */
  read() {
    const data = /** @type {any} */ (this.storage.getJSON(this.key, null));
    const runs = data && Array.isArray(data.runs) ? data.runs.filter(isEntry) : [];
    const count =
      data && Number.isFinite(data.count) ? Math.max(data.count, runs.length) : runs.length;
    return { count, runs, cast: readCast(data && data.cast) };
  }

  /**
   * Debrief history for a mission that just ended (compared with the stored missions) and the
   * commander who debriefs it (see Commanders.js), then remember both unless `record` is false
   * (e.g. autopilot runs).
   * @param {RunEntry} entry
   * @param {{ record?: boolean, locale?: string|null }} [opts]
   * @returns {DebriefHistory}
   */
  debrief(entry, { record = true, locale = null } = {}) {
    const { count, runs, cast } = this.read();
    const mission = count + 1;
    const pick = pickCommander(entry, runs, cast, locale);
    const { lead, tail } = commanderHooks(pick, entry, cast);
    const hooks = [...lead, ...storyHooks(entry, runs, mission)]
      .slice(0, MAX_LEAD_AND_RUN_HOOKS)
      .concat(tail);
    if (record) {
      // The quoted line belongs to the mission before; rememberDebrief() stores this one's.
      const altairMet = cast.altairMet || pick.debut;
      this.storage.setJSON(this.key, {
        count: mission,
        runs: [...runs, entry].slice(-this.max),
        cast: { last: pick.commander, ...(altairMet ? { altairMet: true } : {}) },
      });
    }
    return { mission, hooks, commander: pick.commander };
  }

  /**
   * Remember the headline a commander just radioed, so the next debrief can refer back to it.
   * @param {CommanderId} commander
   * @param {string} line
   */
  rememberDebrief(commander, line) {
    const text = typeof line === "string" ? line.trim() : "";
    if (!isCommander(commander) || !text) return;
    const data = /** @type {any} */ (this.storage.getJSON(this.key, null));
    if (!data || typeof data !== "object") return;
    const cast = { ...readCast(data.cast), line: text, lineBy: commander };
    this.storage.setJSON(this.key, { ...data, cast });
  }
}
