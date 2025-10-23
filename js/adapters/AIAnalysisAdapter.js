/**
 * AIAnalysisAdapter – provides AI analysis of gameplay runs via REST API or mock fallback.
 * Sends run summaries to POST /leaderboard endpoint and transforms responses into actionable suggestions.
 */
import { CONFIG } from "../constants.js";
const TIMER_SECONDS = CONFIG?.GAME?.TIMER_SECONDS ?? 90;
const FINALE_SECONDS = CONFIG?.GAME?.FINALE_BONUS_WINDOW_SECONDS ?? 15;
const BONUS_ASTEROID_COUNT = CONFIG?.GAME?.BONUS_ASTEROID_COUNT ?? 8;

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
   * Accepts either a plain stats object or a payload { stats, runSummary }.
   * @param {object} input
   * @returns {Promise<{title:string, bullets:string[], isRemote:boolean, rawResponse?:any}>}
   */
  async analyze(input) {
    /** @type {any} */
    const payload = input || {};

    if (this._remoteAdapter && this._endpoint) {
      try {
        const response = await this._remoteAdapter.postJSON(this._endpoint, payload.runSummary);
        if (response) {
          var transformedResponse = this._transformRemoteResponse(response);
          if (
            transformedResponse.title &&
            transformedResponse.bullets &&
            transformedResponse.bullets.length > 0
          ) {
            return { ...transformedResponse, isRemote: true, rawResponse: response };
          }
        }
      } catch {
        // AI analysis failed, will fall back to local analysis
      }
    }

    return { ...this._deterministicAnalysis(payload), isRemote: false };
  }

  /**
   * Transform the remote API response format to internal format.
   * @param {any} response API response with feedback and improvement-tip-* fields
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

    for (let i = 1; i <= 8; i++) {
      const tipKey = `improvement-tip-${i}`;
      const value = parsedResponse[tipKey];

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
   * Generate deterministic analysis based on run statistics.
   * @param {any} payload
   * @returns {{title:string, bullets:string[]}}
   */
  _deterministicAnalysis(payload) {
    const bullets = [];
    if (payload.runSummary && payload.runSummary.timer) {
      const survivedSeconds = payload.runSummary.timer.survivedSeconds ?? 0;

      if (survivedSeconds > 0) {
        bullets.push(
          "🚀 Don't get hit by an asteroid, fly the full " +
            TIMER_SECONDS +
            " seconds. You flew " +
            survivedSeconds +
            " seconds."
        );
      } else {
        bullets.push(
          "🚀 Great job, you didn't get hit by an asteroid, flew the full " +
            TIMER_SECONDS +
            " seconds."
        );
      }
    }
    bullets.push(
      "🔥 Finish strong during the double-point finale (last " + FINALE_SECONDS + " seconds)."
    );
    if (payload.runSummary && payload.runSummary.stats) {
      const bonusAsteroidsKilled = payload.runSummary.stats.bonusAsteroidsKilled ?? 0;
      const bonusAsteroidsEncountered = payload.runSummary.stats.bonusAsteroidsEncountered ?? 0;

      if (bonusAsteroidsKilled < BONUS_ASTEROID_COUNT) {
        bullets.push(
          "🪨💎 Destroy all " +
            BONUS_ASTEROID_COUNT +
            " bonus asteroids. You destroyed " +
            bonusAsteroidsKilled +
            " of " +
            bonusAsteroidsEncountered +
            "."
        );
      } else {
        bullets.push(
          "🪨💎 Great job, you destroyed all " + BONUS_ASTEROID_COUNT + " bonus asteroids."
        );
      }
    }
    if (payload.runSummary && payload.runSummary.stats) {
      const bonusStarsCollected = payload.runSummary.stats.bonusStarsCollected ?? 0;
      const bonusStarsEncountered = payload.runSummary.stats.bonusStarsEncountered ?? 0;
      const bonusStarsCollectedAccuracy = payload.runSummary.stats.bonusStarsCollectedAccuracy ?? 0;

      if (bonusStarsCollectedAccuracy < 1) {
        bullets.push(
          "⭐💎 Collect more bonus stars. Your accuracy is " +
            (bonusStarsCollectedAccuracy * 100).toFixed(0) +
            "% (" +
            bonusStarsCollected +
            " of " +
            bonusStarsEncountered +
            ")."
        );
      } else {
        bullets.push(
          "⭐💎 Great job, you collected all bonus stars (" +
            bonusStarsCollected +
            " of " +
            bonusStarsEncountered +
            ")."
        );
      }
    }
    if (payload.runSummary && payload.runSummary.stats) {
      const hardenedAsteroidsKilledAccuracy =
        payload.runSummary.stats.hardenedAsteroidsKilledAccuracy ?? 0;
      const hardenedAsteroidsKilled = payload.runSummary.stats.hardenedAsteroidsKilled ?? 0;
      const hardenedAsteroidsEncountered =
        payload.runSummary.stats.hardenedAsteroidsEncountered ?? 0;

      if (hardenedAsteroidsKilledAccuracy < 1) {
        bullets.push(
          "🪨🛡️ Destroy more hardened asteroids. Your accuracy is " +
            (hardenedAsteroidsKilledAccuracy * 100).toFixed(0) +
            "% (" +
            hardenedAsteroidsKilled +
            " of " +
            hardenedAsteroidsEncountered +
            ")."
        );
      } else {
        bullets.push(
          "🪨🛡️ Great job, you destroyed all hardened asteroids (" +
            hardenedAsteroidsKilled +
            " of " +
            hardenedAsteroidsEncountered +
            ")."
        );
      }
    }
    if (payload.runSummary && payload.runSummary.stats) {
      const shotsFiredAccuracy = payload.runSummary.stats.shotsFiredAccuracy ?? 0;
      const shotsFiredOnTarget = payload.runSummary.stats.shotsFiredHitTarget ?? 0;
      const shotsFired = payload.runSummary.stats.shotsFiredTotal ?? 0;

      if (shotsFiredAccuracy < 1) {
        bullets.push(
          "🔫🎯 Increase shots fired accuracy for end of run bonus (0-100%). Your accuracy is " +
            (shotsFiredAccuracy * 100).toFixed(0) +
            "% (" +
            shotsFiredOnTarget +
            " of " +
            shotsFired +
            ")."
        );
      } else {
        bullets.push(
          "🔫🎯 Great job, your shots fired accuracy for end of run bonus is 100% (" +
            shotsFiredOnTarget +
            " of " +
            shotsFired +
            ")."
        );
      }
    }
    if (payload.runSummary && payload.runSummary.stats) {
      const starsCollectedAccuracy = payload.runSummary.stats.regularStarsCollectedAccuracy ?? 0;
      const starsCollected = payload.runSummary.stats.regularStarsCollected ?? 0;
      const starsEncountered = payload.runSummary.stats.regularStarsEncountered ?? 0;

      if (starsCollectedAccuracy < 1) {
        bullets.push(
          "⭐ Collect more regular stars. Your accuracy is " +
            (starsCollectedAccuracy * 100).toFixed(0) +
            "% (" +
            starsCollected +
            " of " +
            starsEncountered +
            ")."
        );
      } else {
        bullets.push(
          "⭐ Great job, you collected all regular stars (" +
            starsCollected +
            " of " +
            starsEncountered +
            ")."
        );
      }
    }
    if (payload.runSummary && payload.runSummary.stats) {
      const asteroidsKilledAccuracy = payload.runSummary.stats.regularAsteroidsKilledAccuracy ?? 0;
      const asteroidsKilled = payload.runSummary.stats.regularAsteroidsKilled ?? 0;
      const asteroidsEncountered = payload.runSummary.stats.regularAsteroidsEncountered ?? 0;

      if (asteroidsKilledAccuracy < 1) {
        bullets.push(
          "🪨 Destroy more regular asteroids. Your accuracy is " +
            (asteroidsKilledAccuracy * 100).toFixed(0) +
            "% (" +
            asteroidsKilled +
            " of " +
            asteroidsEncountered +
            ")."
        );
      } else {
        bullets.push(
          "🪨 Great job, you destroyed all regular asteroids (" +
            asteroidsKilled +
            " of " +
            asteroidsEncountered +
            ")."
        );
      }
    }
    return {
      title: "Mission debrief protocol concluded. Here are your performance insights:",
      bullets,
    };
  }
}
