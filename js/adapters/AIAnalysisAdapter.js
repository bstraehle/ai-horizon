/**
 * AIAnalysisAdapter – provides AI analysis of gameplay runs via REST API or mock fallback.
 * Sends run summaries (with the game's verdict and insights) to the analysis endpoint and
 * transforms responses into a headline plus a strength and ranked improvement tips.
 */
import { CONFIG } from "../constants.js";
const TIMER_SECONDS = CONFIG?.GAME?.TIMER_SECONDS ?? 90;
const FINALE_SECONDS = CONFIG?.GAME?.FINALE_BONUS_WINDOW_SECONDS ?? 15;
const G = CONFIG.GAME;

/** Bonus asteroids a full-length run needs to destroy for a commendation (or see accuracy). */
export const VERDICT_BONUS_ASTEROIDS = 6;
/** Shots fired accuracy (0-1) that earns a full-length run a commendation (or see bonus). */
export const VERDICT_SHOT_ACCURACY = 0.6;

/** @typedef {{ audio: string, voice: string, gender: string }} SpeechClip Base64 MP3 narration. */
/** @typedef {"commendation"|"satisfactory"|"reprimand"} Verdict Tone of the debrief headline. */

/**
 * Decide the tone of the debrief headline from the run itself (not the model), so praise and
 * criticism stay consistent across runs and locales:
 * - "reprimand": ejected before the finale started;
 * - "commendation": flew the full mission and destroyed at least VERDICT_BONUS_ASTEROIDS bonus
 *   asteroids or reached VERDICT_SHOT_ACCURACY shots fired accuracy;
 * - "satisfactory": everything else.
 * @param {any} runSummary Run summary built by `AIHorizon._logRunSummary`.
 * @returns {Verdict|null} null when the summary has no survived time.
 */
export function missionVerdict(runSummary) {
  const timer = runSummary && runSummary.timer;
  const survived = timer ? timer.survivedSeconds : null;
  if (typeof survived !== "number" || !Number.isFinite(survived)) return null;
  const total = Number.isFinite(timer.totalSeconds) ? timer.totalSeconds : TIMER_SECONDS;
  if (survived < total - FINALE_SECONDS) return "reprimand";
  const stats = runSummary.stats || {};
  const strong =
    (stats.bonusAsteroidsKilled ?? 0) >= VERDICT_BONUS_ASTEROIDS ||
    (stats.shotsFiredAccuracy ?? 0) >= VERDICT_SHOT_ACCURACY;
  return survived >= total && strong ? "commendation" : "satisfactory";
}

/** Most weaknesses (improvement tips) a debrief lists. */
export const MAX_WEAKNESSES = 3;
/** Weaknesses with a smaller estimated cost (points) are not worth a tip. */
const MIN_COST = 50;
/** Point rate assumed for seconds never flown when the pilot's own pace is lower (early ejects). */
const MIN_PACE = 30;

/**
 * @typedef {"survival"|"finale"|"redPlanets"|"redStars"|"grayPlanets"|"accuracy"|"whiteStars"|"asteroids"} InsightTopic
 * @typedef {{ topic: InsightTopic, emoji: string, done: number, total: number, points?: number }} Insight
 *   Exact facts only: done/total are seconds flown of the mission (survival), seconds flown of
 *   the finale (finale, with `points` scored in it, already doubled), hits of shots (accuracy),
 *   or destroyed/collected of seen.
 * @typedef {{ strength: Insight|null, weaknesses: Insight[] }} MissionInsights
 */

/**
 * Debrief topics in priority order (ties rank earlier topics first). `par` is the realistic share
 * of a target a strong pilot gets (nobody collects every star), calibrated on top real runs; it
 * only ranks topics and is never shown. Emojis match the game's look: red planets, red stars,
 * gray planets. Offline debrief lines (`tip`, `good`) mirror what the prompt in
 * server/lambda/analysis.js asks for: an exact fact, then a technique.
 * @type {Record<InsightTopic, { emoji: string, par: number, points?: number,
 *   tip: (i: Insight) => string, good: (i: Insight) => string }>}
 */
const TOPICS = {
  survival: {
    emoji: "🚀",
    par: 1,
    tip: (i) => `You ejected after ${i.done} of ${i.total} seconds. Dodge first, shoot second.`,
    good: (i) =>
      i.done >= i.total
        ? `Full ${i.total} seconds flown, no ejection.`
        : `${i.done} of ${i.total} seconds flown.`,
  },
  finale: {
    emoji: "🔥",
    par: 1,
    tip: (i) =>
      `${i.points} points in the ${i.total}-second finale. Points count double: push hardest then.`,
    good: (i) => `Strong finale: ${i.points} points in the last ${i.total} seconds.`,
  },
  redPlanets: {
    emoji: "🔴",
    par: 1,
    points: G.ASTEROID_SCORE_BONUS,
    tip: (i) =>
      `${i.done} of ${i.total} red planets destroyed. One appears every ${G.BONUS_INTERVAL_SECONDS} seconds: hit it at once.`,
    good: (i) => `${i.done} of ${i.total} red planets destroyed.`,
  },
  redStars: {
    emoji: "🌟",
    par: 0.75,
    points: G.STAR_SCORE_BONUS,
    tip: (i) => `${i.done} of ${i.total} red stars collected. Steer through them, they pay double.`,
    good: (i) => `${i.done} of ${i.total} red stars collected.`,
  },
  grayPlanets: {
    emoji: "🪐",
    par: 0.5,
    points: G.ASTEROID_SCORE_HARDENED,
    tip: (i) =>
      `${i.done} of ${i.total} gray planets destroyed. Reach ${G.BULLET_UPGRADE_SCORE} points early: they take half the hits.`,
    good: (i) => `${i.done} of ${i.total} gray planets destroyed.`,
  },
  accuracy: {
    emoji: "🎯",
    par: 0.75,
    tip: (i) => `${i.done} of ${i.total} shots hit. Fire short bursts at targets.`,
    good: (i) => `${Math.round((100 * i.done) / i.total)}% of shots on target.`,
  },
  whiteStars: {
    emoji: "⭐",
    par: 0.35,
    points: G.STAR_SCORE,
    tip: (i) => `${i.done} of ${i.total} stars collected. Grab stars between attacks.`,
    good: (i) => `${i.done} of ${i.total} stars collected.`,
  },
  asteroids: {
    emoji: "☄️",
    par: 0.2,
    points: G.ASTEROID_SCORE,
    tip: (i) => `${i.done} of ${i.total} asteroids destroyed. Shoot the rocks in your path.`,
    good: (i) => `${i.done} of ${i.total} asteroids destroyed.`,
  },
};

/**
 * Pick what this mission did well and its biggest levers, so tips focus on what matters most
 * instead of listing every stat. Topics are ranked by an internal cost estimate in points that is
 * never shown (only exact facts are returned):
 * - survival: seconds never flown (mission length minus seconds survived) at the pilot's
 *   item-point pace (at least MIN_PACE), the missed finale seconds counted twice;
 * - finale: shortfall of finale points against the pre-finale pace, doubled;
 * - targets: shortfall against the topic's `par` share times its points;
 * - accuracy: base score times the shortfall against par accuracy (the accuracy bonus).
 * Counters in the summary include their variants (stars include red stars, asteroids include
 * planets, hardened include red planets), so each topic counts only its own kind.
 * @param {any} runSummary Run summary built by `AIHorizon._logRunSummary`.
 * @returns {MissionInsights|null} null without timer or stats. The strength is the topic most
 *   above par that is not a weakness; weaknesses (at most MAX_WEAKNESSES, highest cost first)
 *   cost at least MIN_COST.
 */
export function missionInsights(runSummary) {
  const timer = runSummary && runSummary.timer;
  const s = runSummary && runSummary.stats;
  if (!timer || !s || !Number.isFinite(timer.survivedSeconds)) return null;
  const n = (/** @type {unknown} */ v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const score = runSummary.score || {};
  const survived = n(timer.survivedSeconds);
  const total = Number.isFinite(timer.totalSeconds) ? timer.totalSeconds : TIMER_SECONDS;
  const finaleSurvived = n(timer.survivedSecondsFinale);
  const finaleBase = n(score.playerBaseScoreFinale);

  /** @type {Record<"redPlanets"|"redStars"|"grayPlanets"|"whiteStars"|"asteroids", [number, number]>} */
  const targets = {
    redPlanets: [n(s.bonusAsteroidsKilled), n(s.bonusAsteroidsEncountered)],
    redStars: [n(s.bonusStarsCollected), n(s.bonusStarsEncountered)],
    grayPlanets: [
      n(s.hardenedAsteroidsKilled) - n(s.bonusAsteroidsKilled),
      n(s.hardenedAsteroidsEncountered) - n(s.bonusAsteroidsEncountered),
    ],
    whiteStars: [
      n(s.regularStarsCollected) - n(s.bonusStarsCollected),
      n(s.regularStarsEncountered) - n(s.bonusStarsEncountered),
    ],
    asteroids: [
      n(s.regularAsteroidsKilled),
      n(s.regularAsteroidsEncountered) - n(s.hardenedAsteroidsEncountered),
    ],
  };
  const itemPoints = Object.entries(targets).reduce(
    (sum, [topic, [done]]) => sum + done * n(TOPICS[/** @type {InsightTopic} */ (topic)].points),
    0
  );

  /** @type {{ insight: Insight, cost: number, ratio: number }[]} Ratio: share of par reached. */
  const all = [];
  /**
   * @param {Insight} insight
   * @param {number} cost
   * @param {number} [ratio]
   */
  const add = (insight, cost, ratio = insight.done / insight.total / TOPICS[insight.topic].par) => {
    if (insight.total > 0) all.push({ insight, cost: Math.max(0, cost), ratio });
  };
  /** @param {InsightTopic} topic @param {number} done @param {number} of */
  const fact = (topic, done, of) => ({ topic, emoji: TOPICS[topic].emoji, done, total: of });

  const pace = Math.max(MIN_PACE, itemPoints / Math.max(1, survived));
  const missed = Math.max(0, total - survived);
  add(fact("survival", survived, total), pace * (missed + Math.min(FINALE_SECONDS, missed)));
  if (finaleSurvived > 0) {
    const preFinalePace = (itemPoints - finaleBase) / Math.max(1, survived - finaleSurvived);
    const expected = preFinalePace * finaleSurvived;
    add(
      { ...fact("finale", finaleSurvived, FINALE_SECONDS), points: 2 * finaleBase },
      2 * (expected - finaleBase),
      expected > 0 ? finaleBase / expected : 1
    );
  }
  for (const [key, [done, seen]] of Object.entries(targets)) {
    const topic = /** @type {InsightTopic} */ (key);
    add(fact(topic, done, seen), (TOPICS[topic].par * seen - done) * n(TOPICS[topic].points));
  }
  const shots = n(s.shotsFiredTotal);
  const hits = Math.min(shots, n(s.shotsFiredHitTarget));
  if (shots > 0) {
    add(
      fact("accuracy", hits, shots),
      n(score.playerBaseScore) * (TOPICS.accuracy.par - hits / shots)
    );
  }

  const order = Object.keys(TOPICS);
  all.sort((a, b) => order.indexOf(a.insight.topic) - order.indexOf(b.insight.topic));
  const weak = all
    .filter((e) => e.cost >= MIN_COST)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, MAX_WEAKNESSES);
  const strength = all
    .filter((e) => !weak.includes(e) && e.insight.done > 0)
    .reduce(
      (/** @type {typeof all[number]|null} */ best, e) =>
        !best || e.ratio > best.ratio ? e : best,
      null
    );
  return { strength: strength ? strength.insight : null, weaknesses: weak.map((e) => e.insight) };
}

export class AIAnalysisAdapter {
  /**
   * Create an AIAnalysisAdapter.
   * @param {{ remoteAdapter?: import('./RemoteStorageAdapter.js').RemoteStorageAdapter, endpoint?: string }} [opts]
   *  - remoteAdapter: Optional RemoteStorageAdapter for API calls (if omitted, uses mock mode).
   *  - endpoint: API endpoint URL (default: empty, uses mock mode).
   */
  constructor(opts = {}) {
    this._remoteAdapter = opts.remoteAdapter || null;
    this._endpoint = opts.endpoint || "";
  }

  /**
   * Analyze a run and return actionable suggestions.
   * Accepts either a plain stats object or a payload { stats, runSummary, speech }.
   * The run summary is sent with its {@link missionVerdict} as `verdict`, which sets the tone of
   * the headline, and its {@link missionInsights} as `insights`, which the tips are written from.
   * When `speech: { voice }` is given, it is sent too so the server can return the headline
   * spoken by Amazon Polly. The audio is returned as `speech` and removed from `rawResponse`,
   * which is persisted with leaderboard entries.
   * @param {object} input
   * @returns {Promise<{title:string, bullets:string[], isRemote:boolean, rawResponse?:any, speech?:SpeechClip}>}
   */
  async analyze(input) {
    /** @type {any} */
    const payload = input || {};

    if (this._remoteAdapter && this._endpoint) {
      try {
        const summary = payload.runSummary;
        const verdict = missionVerdict(summary);
        const insights = missionInsights(summary);
        const body = summary
          ? {
              ...summary,
              ...(verdict ? { verdict } : {}),
              ...(insights ? { insights } : {}),
              ...(payload.speech ? { speech: payload.speech } : {}),
            }
          : summary;
        const response = await this._remoteAdapter.postJSON(this._endpoint, body);
        if (response) {
          const { analysis, speech } = this._extractSpeech(response);
          var transformedResponse = this._transformRemoteResponse(analysis);
          if (
            transformedResponse.title &&
            transformedResponse.bullets &&
            transformedResponse.bullets.length > 0
          ) {
            return {
              ...transformedResponse,
              isRemote: true,
              rawResponse: analysis,
              ...(speech ? { speech } : {}),
            };
          }
        }
      } catch {
        // AI analysis failed, will fall back to local analysis
      }
    }

    return { ...this._deterministicAnalysis(payload), isRemote: false };
  }

  /**
   * Split the optional `speech` clip from a remote response.
   * @param {any} response Parsed JSON or a JSON string from the analysis endpoint.
   * @returns {{ analysis: any, speech: SpeechClip|null }} `analysis` without `speech`.
   */
  _extractSpeech(response) {
    let parsed = response;
    if (typeof response === "string") {
      try {
        parsed = JSON.parse(response);
      } catch {
        return { analysis: response, speech: null };
      }
    }
    if (!parsed || typeof parsed !== "object" || !("speech" in parsed)) {
      return { analysis: response, speech: null };
    }
    const { speech, ...analysis } = parsed;
    const clip =
      speech && typeof speech.audio === "string" && speech.audio
        ? {
            audio: speech.audio,
            voice: String(speech.voice || ""),
            gender: String(speech.gender || ""),
          }
        : null;
    return { analysis, speech: clip };
  }

  /**
   * Transform the remote API response format to internal format: the `strength` line first,
   * then the `improvement-tip-*` lines in order.
   * @param {any} response API response with feedback, strength and improvement-tip-* fields
   * @returns {{title:string, bullets:string[]}}
   */
  _transformRemoteResponse(response) {
    let parsedResponse = response;

    if (typeof response === "string") {
      try {
        parsedResponse = JSON.parse(response);
      } catch {
        parsedResponse = response;
      }
    }

    const bullets = [];
    const keys = ["strength", ...Array.from({ length: 8 }, (_, i) => `improvement-tip-${i + 1}`)];

    for (const key of keys) {
      const value = parsedResponse[key];

      if (value && String(value).trim() !== "") {
        bullets.push(String(value));
      }
    }

    return {
      title: parsedResponse.feedback,
      bullets,
    };
  }

  /**
   * Offline debrief from the run's {@link missionInsights}: the strength line, then one tip per
   * weakness (biggest points lost first), in the same style the prompt asks the model for.
   * @param {any} payload
   * @returns {{title:string, bullets:string[]}}
   */
  _deterministicAnalysis(payload) {
    const insights = missionInsights(payload.runSummary);
    const bullets = insights
      ? [
          ...(insights.strength
            ? [`✅ ${TOPICS[insights.strength.topic].good(insights.strength)}`]
            : []),
          ...insights.weaknesses.map((i) => `${i.emoji} ${TOPICS[i.topic].tip(i)}`),
        ]
      : [
          `🚀 Fly the full ${TIMER_SECONDS} seconds: one asteroid collision ends the run.`,
          `🔥 Points count double in the last ${FINALE_SECONDS} seconds.`,
        ];
    return { title: this._verdictTitle(payload.runSummary), bullets };
  }

  /**
   * Offline headline in the tone of the run's {@link missionVerdict}.
   * @param {any} runSummary
   * @returns {string}
   */
  _verdictTitle(runSummary) {
    switch (missionVerdict(runSummary)) {
      case "commendation":
        return "👨‍🚀 Commendation, pilot. Full mission flown. Outstanding work.";
      case "satisfactory":
        return "👨‍🚀 Satisfactory, pilot. Solid flight. Push harder next time.";
      case "reprimand":
        return `👨‍🚀 Reprimand, pilot. You ejected after ${runSummary.timer.survivedSeconds} seconds. Stay in the fight.`;
      default:
        return "Mission debrief protocol concluded. Here are your performance insights:";
    }
  }
}
