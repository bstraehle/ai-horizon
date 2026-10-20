import { missionVerdict } from "../adapters/AIAnalysisAdapter.js";
import { CONFIG } from "../constants.js";

/**
 * Post-game screen headlines by outcome, checked in this order:
 * - record: the final score beat the leaderboard's top score;
 * - ace: flew the full mission with a commendation (see `missionVerdict`);
 * - survived: flew the full mission;
 * - finale: went down during the finale;
 * - down: went down before the finale.
 * Several lines per outcome keep repeat runs fresh; the debrief below carries the details.
 */
export const GAME_OVER_HEADLINES = {
  record: ["New High Score!", "Top of the Board!", "Record Broken!"],
  ace: ["Mission Accomplished!", "Ace Pilot!", "Outstanding Flight!"],
  survived: ["Mission Complete", "You Made It!", "Survived the Storm"],
  finale: ["So Close!", "Down in the Finale", "Seconds from Glory"],
  down: ["Ship Down", "Hull Breach", "Asteroid Impact"],
};

/** Headline when the run summary is unavailable. */
export const DEFAULT_GAME_OVER_HEADLINE = "Game Over";

/**
 * Pick the post-game headline for a run. The line within an outcome is chosen from the final
 * score, so it varies between runs yet stays the same for a replayed (seeded) run, e.g. in the
 * recorded store video.
 * @param {any} runSummary Run summary built by `AIHorizon._logRunSummary`.
 * @returns {string}
 */
export function gameOverHeadline(runSummary) {
  const timer = runSummary && runSummary.timer;
  const survived = timer && timer.survivedSeconds;
  if (typeof survived !== "number" || !Number.isFinite(survived)) return DEFAULT_GAME_OVER_HEADLINE;
  const score = (runSummary.score && runSummary.score.playerFinalScore) || 0;
  const best = (runSummary.score && runSummary.score.leaderBoardHighScore) || 0;
  const total = Number.isFinite(timer.totalSeconds)
    ? timer.totalSeconds
    : CONFIG.GAME.TIMER_SECONDS;
  const finaleStart = total - (CONFIG.GAME.FINALE_BONUS_WINDOW_SECONDS || 0);
  /** @type {keyof typeof GAME_OVER_HEADLINES} */
  let outcome = "down";
  if (best > 0 && score > best) outcome = "record";
  else if (survived >= total)
    outcome = missionVerdict(runSummary) === "commendation" ? "ace" : "survived";
  else if (survived >= finaleStart) outcome = "finale";
  const lines = GAME_OVER_HEADLINES[outcome];
  return lines[Math.abs(Math.trunc(score)) % lines.length];
}
