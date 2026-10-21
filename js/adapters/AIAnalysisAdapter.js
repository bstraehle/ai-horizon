/**
 * AIAnalysisAdapter – provides AI analysis of gameplay runs via REST API or mock fallback.
 * Sends run summaries (with the game's verdict and insights) to the analysis endpoint and
 * builds a headline plus Well done / Next mission sections from the response and exact facts.
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

/** Most weaknesses (Next mission items) a debrief lists. */
export const MAX_WEAKNESSES = 3;
/** Weaknesses with a smaller estimated cost (points) are not worth an item. */
const MIN_COST = 50;
/** Point rate assumed for seconds never flown when the pilot's own pace is lower (early ejects). */
const MIN_PACE = 30;

/**
 * @typedef {"survival"|"finale"|"bonusAsteroids"|"bonusStars"|"hardenedAsteroids"|"accuracy"|"stars"|"asteroids"} InsightTopic
 * @typedef {{ topic: InsightTopic, done: number, total: number, points?: number }} Insight
 *   Exact facts only: done/total are seconds flown of the mission (survival), seconds flown of
 *   the finale (finale, with `points` scored in it, already doubled), hits of shots (accuracy),
 *   or destroyed/collected of seen.
 * @typedef {{ strength: Insight|null, weaknesses: Insight[] }} MissionInsights
 * @typedef {{ kind: "done"|"next", heading: string, items: string[] }} DebriefSection
 *   "done": the Well done section (the strength); "next": the Next mission section.
 */

/**
 * Debrief topics in priority order (ties rank earlier topics first). `par` is the realistic share
 * of a target a strong pilot gets (nobody collects every star), calibrated on top real runs; it
 * only ranks topics and is never shown. `technique` is the offline (English) advice; the prompt in
 * server/lambda/analysis.js lists the same techniques for the model.
 * @type {Record<InsightTopic, { par: number, points?: number, technique: string }>}
 */
const TOPICS = {
  survival: { par: 1, technique: "Dodge first, shoot second." },
  finale: { par: 1, technique: "Points count double: push hardest then." },
  bonusAsteroids: {
    par: 1,
    points: G.ASTEROID_SCORE_BONUS,
    technique: `One appears every ${G.BONUS_INTERVAL_SECONDS} seconds; hit each one at once.`,
  },
  bonusStars: {
    par: 0.75,
    points: G.STAR_SCORE_BONUS,
    technique: "Steer through them; they pay double.",
  },
  hardenedAsteroids: {
    par: 0.5,
    points: G.ASTEROID_SCORE_HARDENED,
    technique: `Reach ${G.BULLET_UPGRADE_SCORE} points early to upgrade your bullets.`,
  },
  accuracy: { par: 0.75, technique: "Fire short bursts at targets." },
  stars: { par: 0.35, points: G.STAR_SCORE, technique: "Grab stars between attacks." },
  asteroids: { par: 0.2, points: G.ASTEROID_SCORE, technique: "Shoot the asteroids in your path." },
};

/**
 * @typedef {{ wellDone: string, nextMission: string, transmission: string, commander: string,
 *   seconds: (done: number, total: number) => string, points: (n: number) => string,
 *   topics: Record<InsightTopic, string> }} DebriefLabels
 *   `transmission` / `commander` label the "incoming transmission" while the debrief loads and
 *   name its sender, Commander Vega (the persona in server/lambda/analysis.js).
 */

/**
 * Section headings and topic names per language (the languages with a narrator voice in
 * server/lambda/analysis.js); topic names follow the About page and scoring rules, never colours
 * (bonus items are red or blue depending on the run). Other languages use English.
 * @type {Record<string, DebriefLabels>}
 */
export const DEBRIEF_LABELS = {
  en: {
    wellDone: "Well done",
    nextMission: "Next mission",
    transmission: "Incoming transmission",
    commander: "Commander Vega",
    seconds: (d, t) => `${d} / ${t} s`,
    points: (n) => `${n} points`,
    topics: {
      survival: "Survival",
      finale: "Finale",
      bonusAsteroids: "Bonus asteroids",
      bonusStars: "Bonus stars",
      hardenedAsteroids: "Hardened asteroids",
      accuracy: "Accuracy",
      stars: "Stars",
      asteroids: "Asteroids",
    },
  },
  nl: {
    wellDone: "Goed gedaan",
    nextMission: "Volgende missie",
    transmission: "Inkomende transmissie",
    commander: "Commandant Vega",
    seconds: (d, t) => `${d} / ${t} s`,
    points: (n) => `${n} punten`,
    topics: {
      survival: "Overleven",
      finale: "Finale",
      bonusAsteroids: "Bonusasteroïden",
      bonusStars: "Bonussterren",
      hardenedAsteroids: "Geharde asteroïden",
      accuracy: "Nauwkeurigheid",
      stars: "Sterren",
      asteroids: "Asteroïden",
    },
  },
  fr: {
    wellDone: "Bien joué",
    nextMission: "Prochaine mission",
    transmission: "Transmission entrante",
    commander: "Commandante Vega",
    seconds: (d, t) => `${d} / ${t} s`,
    points: (n) => `${n} points`,
    topics: {
      survival: "Survie",
      finale: "Finale",
      bonusAsteroids: "Astéroïdes bonus",
      bonusStars: "Étoiles bonus",
      hardenedAsteroids: "Astéroïdes renforcés",
      accuracy: "Précision",
      stars: "Étoiles",
      asteroids: "Astéroïdes",
    },
  },
  de: {
    wellDone: "Gut gemacht",
    nextMission: "Nächste Mission",
    transmission: "Eingehende Übertragung",
    commander: "Kommandantin Vega",
    seconds: (d, t) => `${d} / ${t} s`,
    points: (n) => `${n} Punkte`,
    topics: {
      survival: "Überleben",
      finale: "Finale",
      bonusAsteroids: "Bonus-Asteroiden",
      bonusStars: "Bonus-Sterne",
      hardenedAsteroids: "Gehärtete Asteroiden",
      accuracy: "Treffsicherheit",
      stars: "Sterne",
      asteroids: "Asteroiden",
    },
  },
  it: {
    wellDone: "Ben fatto",
    nextMission: "Prossima missione",
    transmission: "Trasmissione in arrivo",
    commander: "Comandante Vega",
    seconds: (d, t) => `${d} / ${t} s`,
    points: (n) => `${n} punti`,
    topics: {
      survival: "Sopravvivenza",
      finale: "Finale",
      bonusAsteroids: "Asteroidi bonus",
      bonusStars: "Stelle bonus",
      hardenedAsteroids: "Asteroidi corazzati",
      accuracy: "Precisione",
      stars: "Stelle",
      asteroids: "Asteroidi",
    },
  },
  ko: {
    wellDone: "잘한 점",
    nextMission: "다음 임무",
    transmission: "교신 수신 중",
    commander: "베가 사령관",
    seconds: (d, t) => `${d} / ${t}초`,
    points: (n) => `${n}점`,
    topics: {
      survival: "생존",
      finale: "피날레",
      bonusAsteroids: "보너스 소행성",
      bonusStars: "보너스 별",
      hardenedAsteroids: "강화 소행성",
      accuracy: "명중률",
      stars: "별",
      asteroids: "소행성",
    },
  },
  pl: {
    wellDone: "Dobra robota",
    nextMission: "Następna misja",
    transmission: "Transmisja przychodząca",
    commander: "Komandor Vega",
    seconds: (d, t) => `${d} / ${t} s`,
    points: (n) => `${n} pkt`,
    topics: {
      survival: "Przetrwanie",
      finale: "Finał",
      bonusAsteroids: "Asteroidy bonusowe",
      bonusStars: "Gwiazdy bonusowe",
      hardenedAsteroids: "Utwardzone asteroidy",
      accuracy: "Celność",
      stars: "Gwiazdy",
      asteroids: "Asteroidy",
    },
  },
  pt: {
    wellDone: "Muito bem",
    nextMission: "Próxima missão",
    transmission: "Recebendo transmissão",
    commander: "Comandante Vega",
    seconds: (d, t) => `${d} / ${t} s`,
    points: (n) => `${n} pontos`,
    topics: {
      survival: "Sobrevivência",
      finale: "Final",
      bonusAsteroids: "Asteroides bônus",
      bonusStars: "Estrelas bônus",
      hardenedAsteroids: "Asteroides reforçados",
      accuracy: "Precisão",
      stars: "Estrelas",
      asteroids: "Asteroides",
    },
  },
  es: {
    wellDone: "Bien hecho",
    nextMission: "Próxima misión",
    transmission: "Transmisión entrante",
    commander: "Comandante Vega",
    seconds: (d, t) => `${d} / ${t} s`,
    points: (n) => `${n} puntos`,
    topics: {
      survival: "Supervivencia",
      finale: "Final",
      bonusAsteroids: "Asteroides bonus",
      bonusStars: "Estrellas bonus",
      hardenedAsteroids: "Asteroides reforzados",
      accuracy: "Precisión",
      stars: "Estrellas",
      asteroids: "Asteroides",
    },
  },
};

/**
 * Labels for a BCP 47 locale's language, English when missing or unsupported.
 * @param {unknown} locale
 * @returns {DebriefLabels}
 */
export function debriefLabels(locale) {
  const lang = typeof locale === "string" ? locale.split(/[-_]/)[0].toLowerCase() : "";
  return DEBRIEF_LABELS[lang] || DEBRIEF_LABELS.en;
}

/**
 * The exact fact shown for an insight, e.g. "Bonus asteroids: 1 / 8" or "Accuracy: 40% (173 / 434)".
 * @param {Insight} insight
 * @param {DebriefLabels} labels
 * @returns {string}
 */
export function insightFact(insight, labels) {
  const { topic, done, total } = insight;
  const name = labels.topics[topic];
  if (topic === "survival") return `${name}: ${labels.seconds(done, total)}`;
  if (topic === "finale") return `${name}: ${labels.points(insight.points ?? 0)}`;
  if (topic === "accuracy")
    return `${name}: ${Math.round((100 * done) / total)}% (${done} / ${total})`;
  return `${name}: ${done} / ${total}`;
}

/**
 * Well done / Next mission sections: the strength as a fact, then each weakness as its fact
 * followed by its technique (`techniques[i]` for weakness i; omitted when missing), normalised to
 * a sentence (leading emoji dropped, capitalised, ending punctuation added).
 * @param {MissionInsights} insights
 * @param {DebriefLabels} labels
 * @param {(string|undefined)[]} techniques
 * @returns {DebriefSection[]} Only sections that have items.
 */
export function debriefSections(insights, labels, techniques) {
  /** @type {DebriefSection[]} */
  const sections = [];
  if (insights.strength) {
    sections.push({
      kind: "done",
      heading: labels.wellDone,
      items: [insightFact(insights.strength, labels)],
    });
  }
  const next = insights.weaknesses.map((w, i) => {
    const text = String(techniques[i] ?? "")
      .replace(/^(?:\p{Extended_Pictographic}|\u200d|\uFE0F|\s)+/u, "")
      .trim();
    if (!text) return insightFact(w, labels);
    const sentence = text.charAt(0).toLocaleUpperCase() + text.slice(1);
    return `${insightFact(w, labels)}. ${sentence}${/[.!?。！？]$/u.test(sentence) ? "" : "."}`;
  });
  if (next.length) sections.push({ kind: "next", heading: labels.nextMission, items: next });
  return sections;
}

/**
 * Pick what this mission did well and its biggest levers, so the debrief focuses on what matters
 * most instead of listing every stat. Topics are ranked by an internal cost estimate in points
 * that is never shown (only exact facts are returned):
 * - survival: seconds never flown (mission length minus seconds survived) at the pilot's
 *   item-point pace (at least MIN_PACE), the missed finale seconds counted twice;
 * - finale: shortfall of finale points against the pre-finale pace, doubled;
 * - targets: shortfall against the topic's `par` share times its points;
 * - accuracy: base score times the shortfall against par accuracy (the accuracy bonus).
 * Counters in the summary include their variants (stars include bonus stars, asteroids include
 * hardened ones, hardened include bonus asteroids), so each topic counts only its own kind.
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

  /** @type {Record<"bonusAsteroids"|"bonusStars"|"hardenedAsteroids"|"stars"|"asteroids", [number, number]>} */
  const targets = {
    bonusAsteroids: [n(s.bonusAsteroidsKilled), n(s.bonusAsteroidsEncountered)],
    bonusStars: [n(s.bonusStarsCollected), n(s.bonusStarsEncountered)],
    hardenedAsteroids: [
      n(s.hardenedAsteroidsKilled) - n(s.bonusAsteroidsKilled),
      n(s.hardenedAsteroidsEncountered) - n(s.bonusAsteroidsEncountered),
    ],
    stars: [
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

  const pace = Math.max(MIN_PACE, itemPoints / Math.max(1, survived));
  const missed = Math.max(0, total - survived);
  add(
    { topic: "survival", done: survived, total },
    pace * (missed + Math.min(FINALE_SECONDS, missed))
  );
  if (finaleSurvived > 0) {
    const preFinalePace = (itemPoints - finaleBase) / Math.max(1, survived - finaleSurvived);
    const expected = preFinalePace * finaleSurvived;
    add(
      { topic: "finale", done: finaleSurvived, total: FINALE_SECONDS, points: 2 * finaleBase },
      2 * (expected - finaleBase),
      expected > 0 ? finaleBase / expected : 1
    );
  }
  for (const [key, [done, seen]] of Object.entries(targets)) {
    const topic = /** @type {InsightTopic} */ (key);
    add({ topic, done, total: seen }, (TOPICS[topic].par * seen - done) * n(TOPICS[topic].points));
  }
  const shots = n(s.shotsFiredTotal);
  const hits = Math.min(shots, n(s.shotsFiredHitTarget));
  if (shots > 0) {
    add(
      { topic: "accuracy", done: hits, total: shots },
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
   * Analyze a run and return the debrief: a headline plus Well done / Next mission sections.
   * Accepts either a plain stats object or a payload { stats, runSummary, speech, history }.
   * The run summary is sent with its {@link missionVerdict} as `verdict`, which sets the tone of
   * the headline, its {@link missionInsights} as `insights`, and the device's `history`
   * (mission number and story hooks, see managers/RunHistory.js) when given; the model returns the headline
   * and one technique per weakness, and the sections are built here from the insights' exact
   * facts with {@link debriefLabels} for the player's locale. When `speech: { voice }` is given,
   * it is sent too so the server can return the headline spoken by Amazon Polly. The audio is
   * returned as `speech` and removed from `rawResponse`, which is persisted with leaderboard
   * entries.
   * @param {object} input
   * @returns {Promise<{title:string, sections:DebriefSection[], isRemote:boolean, rawResponse?:any, speech?:SpeechClip}>}
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
              ...(payload.history ? { history: payload.history } : {}),
              ...(payload.speech ? { speech: payload.speech } : {}),
            }
          : summary;
        const response = await this._remoteAdapter.postJSON(this._endpoint, body);
        if (response && insights) {
          const { analysis, speech } = this._extractSpeech(response);
          const labels = debriefLabels(summary && summary.device && summary.device.locale);
          const transformed = this._transformRemoteResponse(analysis, insights, labels);
          if (transformed.title && transformed.sections.length > 0) {
            return {
              ...transformed,
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
   * Build the debrief from the remote response: its `feedback` headline, and sections from the
   * insights that were sent, with `technique-N` as the advice for weakness N.
   * @param {any} response API response (JSON string or object) with feedback and technique-* fields
   * @param {MissionInsights} insights
   * @param {DebriefLabels} labels
   * @returns {{title:string, sections:DebriefSection[]}}
   */
  _transformRemoteResponse(response, insights, labels) {
    let parsed = response;
    if (typeof response === "string") {
      try {
        parsed = JSON.parse(response);
      } catch {
        parsed = {};
      }
    }
    const techniques = insights.weaknesses.map((_, i) => parsed && parsed[`technique-${i + 1}`]);
    return {
      title: parsed && parsed.feedback,
      sections: debriefSections(insights, labels, techniques),
    };
  }

  /**
   * Offline (English) debrief from the run's {@link missionInsights}, laid out like the remote one.
   * @param {any} payload
   * @returns {{title:string, sections:DebriefSection[]}}
   */
  _deterministicAnalysis(payload) {
    const insights = missionInsights(payload.runSummary);
    const labels = DEBRIEF_LABELS.en;
    const sections = insights
      ? debriefSections(
          insights,
          labels,
          insights.weaknesses.map((w) => TOPICS[w.topic].technique)
        )
      : [
          {
            kind: /** @type {const} */ ("next"),
            heading: labels.nextMission,
            items: [
              `Fly the full ${TIMER_SECONDS} seconds: one asteroid collision ends the run.`,
              `Points count double in the last ${FINALE_SECONDS} seconds.`,
            ],
          },
        ];
    return { title: this._verdictTitle(payload.runSummary), sections };
  }

  /**
   * Offline headline in the tone of the run's {@link missionVerdict}; see {@link verdictLines}.
   * @param {any} runSummary
   * @returns {string}
   */
  _verdictTitle(runSummary) {
    const verdict = missionVerdict(runSummary);
    if (!verdict) return "Mission debrief protocol concluded. Here are your performance insights:";
    const lines = verdictLines(verdict, runSummary);
    const timer = runSummary.timer;
    const score = (runSummary.score && runSummary.score.playerFinalScore) || 0;
    const pick = Math.abs(Math.trunc(timer.survivedSeconds + score)) % lines.length;
    return `👨‍🚀 ${VERDICT_RATINGS_EN[verdict]} ${lines[pick]}`;
  }
}

/** English ratings; the Lambda's VERDICT_RATINGS put the same words in front of the AI headline. */
const VERDICT_RATINGS_EN = {
  commendation: "Commendation, pilot.",
  satisfactory: "Satisfactory, pilot.",
  reprimand: "Reprimand, pilot.",
};

/**
 * Offline headline lines (after the rating) for a verdict, each built on the run's key fact:
 * seconds survived for a reprimand, the seconds left for a finale ejection, the full mission for
 * a satisfactory full run, and bonus asteroids or accuracy for a commendation. The caller picks
 * one from the run's numbers, so repeat runs read differently while a replayed (seeded) run
 * stays identical.
 * @param {Verdict} verdict
 * @param {any} runSummary
 * @returns {string[]}
 */
export function verdictLines(verdict, runSummary) {
  const timer = runSummary.timer;
  const stats = runSummary.stats || {};
  const total = Number.isFinite(timer.totalSeconds) ? timer.totalSeconds : TIMER_SECONDS;
  const s = timer.survivedSeconds;
  const secs = (/** @type {number} */ n) => `${n} ${n === 1 ? "second" : "seconds"}`;
  if (verdict === "reprimand") {
    return [
      `Down after ${secs(s)}. The asteroid field wants a rematch.`,
      `${secs(s)} in the cockpit. Dodge first, glory second.`,
      `You ejected after ${secs(s)}. That sky is still yours to take.`,
      `Only ${secs(s)} flown, ${secs(total - s)} left unclaimed. Get back up there.`,
    ];
  }
  if (verdict === "satisfactory") {
    if (s < total) {
      const left = secs(total - s);
      return [
        `Down with ${left} to go. Finish the job next time.`,
        `You reached the finale and fell ${left} short. Hold the line.`,
        `${left} from the finish line. Next time, bring it home.`,
      ];
    }
    return [
      `Full ${total} seconds flown. Now go hunting bonus asteroids.`,
      `You went the distance. Next time, bring the fireworks.`,
      `${total} seconds and still flying. Make every shot count next.`,
    ];
  }
  const bonus = stats.bonusAsteroidsKilled ?? 0;
  if (bonus >= VERDICT_BONUS_ASTEROIDS) {
    return [
      `${bonus} bonus asteroids vaporized. The whole fleet saw that.`,
      `${bonus} bonus asteroids down. That is how legends fly.`,
      `Full mission and ${bonus} bonus asteroids. Hangar bay is buzzing.`,
    ];
  }
  const pct = Math.round(100 * (stats.shotsFiredAccuracy ?? 0));
  return [
    `${pct}% of your shots hit. Precision like that wins wars.`,
    `${pct}% accuracy over the full mission. Textbook flying.`,
    `Full mission at ${pct}% accuracy. Every shot had a target.`,
  ];
}
