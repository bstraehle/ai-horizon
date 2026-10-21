import { missionVerdict } from "../adapters/AIAnalysisAdapter.js";
import { CONFIG } from "../constants.js";

/** @typedef {"record"|"ace"|"survived"|"finale"|"down"} HeadlineOutcome */

/**
 * Post-game screen headline per outcome and language, checked in this order:
 * - record: the final score beat the leaderboard's top score;
 * - ace: flew the full mission with a commendation (see `missionVerdict`);
 * - survived: flew the full mission;
 * - finale: went down during the finale;
 * - down: went down before the finale.
 * Plain words, no idioms, in the languages of the debrief below (DEBRIEF_LABELS in
 * adapters/AIAnalysisAdapter.js); other languages use English. French puts a no-break space
 * before "!".
 * @type {Record<string, Record<HeadlineOutcome, string>>}
 */
export const GAME_OVER_HEADLINES = {
  en: {
    record: "New High Score!",
    ace: "Mission Accomplished!",
    survived: "Mission Complete",
    finale: "So Close!",
    down: "Ship Down",
  },
  nl: {
    record: "Nieuwe topscore!",
    ace: "Missie geslaagd!",
    survived: "Missie voltooid",
    finale: "Bijna!",
    down: "Schip vernietigd",
  },
  fr: {
    record: "Nouveau record\u00a0!",
    ace: "Mission accomplie\u00a0!",
    survived: "Mission terminée",
    finale: "Si près du but\u00a0!",
    down: "Vaisseau détruit",
  },
  de: {
    record: "Neuer Highscore!",
    ace: "Mission erfüllt!",
    survived: "Mission abgeschlossen",
    finale: "So knapp!",
    down: "Schiff zerstört",
  },
  it: {
    record: "Nuovo record!",
    ace: "Missione compiuta!",
    survived: "Missione completata",
    finale: "Per un soffio!",
    down: "Nave distrutta",
  },
  ko: {
    record: "신기록!",
    ace: "임무 완수!",
    survived: "임무 완료",
    finale: "아깝습니다!",
    down: "기체 파괴",
  },
  pl: {
    record: "Nowy rekord!",
    ace: "Misja wykonana!",
    survived: "Misja ukończona",
    finale: "Tak blisko!",
    down: "Statek zniszczony",
  },
  pt: {
    record: "Novo recorde!",
    ace: "Missão cumprida!",
    survived: "Missão concluída",
    finale: "Por pouco!",
    down: "Nave destruída",
  },
  es: {
    record: "¡Nuevo récord!",
    ace: "¡Misión cumplida!",
    survived: "Misión completada",
    finale: "¡Casi lo logras!",
    down: "Nave destruida",
  },
};

/** Headline when the run summary is unavailable (understood without translation). */
export const DEFAULT_GAME_OVER_HEADLINE = "Game Over";

/**
 * Outcome of a run for the post-game headline (see {@link GAME_OVER_HEADLINES}).
 * @param {any} runSummary Run summary built by `AIHorizon._logRunSummary`.
 * @returns {HeadlineOutcome|null} null without a survived time.
 */
export function headlineOutcome(runSummary) {
  const timer = runSummary && runSummary.timer;
  const survived = timer && timer.survivedSeconds;
  if (typeof survived !== "number" || !Number.isFinite(survived)) return null;
  const score = (runSummary.score && runSummary.score.playerFinalScore) || 0;
  const best = (runSummary.score && runSummary.score.leaderBoardHighScore) || 0;
  const total = Number.isFinite(timer.totalSeconds)
    ? timer.totalSeconds
    : CONFIG.GAME.TIMER_SECONDS;
  const finaleStart = total - (CONFIG.GAME.FINALE_BONUS_WINDOW_SECONDS || 0);
  if (best > 0 && score > best) return "record";
  if (survived >= total) return missionVerdict(runSummary) === "commendation" ? "ace" : "survived";
  return survived >= finaleStart ? "finale" : "down";
}

/**
 * Post-game headline for a run in the player's language (the run summary's device locale, as
 * for the debrief), with its BCP 47 language for the heading's `lang` attribute.
 * @param {any} runSummary Run summary built by `AIHorizon._logRunSummary`.
 * @returns {{ text: string, lang: string }}
 */
export function gameOverHeadline(runSummary) {
  const outcome = headlineOutcome(runSummary);
  if (!outcome) return { text: DEFAULT_GAME_OVER_HEADLINE, lang: "en" };
  const locale = runSummary.device && runSummary.device.locale;
  const requested = typeof locale === "string" ? locale.split(/[-_]/)[0].toLowerCase() : "";
  const lang = GAME_OVER_HEADLINES[requested] ? requested : "en";
  return { text: GAME_OVER_HEADLINES[lang][outcome], lang };
}
