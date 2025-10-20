/**
 * AIAnalysisAdapter – provides AI analysis of gameplay runs via REST API or mock fallback.
 * Sends run summaries to POST /leaderboard endpoint and transforms responses into actionable suggestions.
 */
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
          "⏱️ Play full 90 seconds without getting killed by an asteroid. Played: " +
            survivedSeconds +
            " seconds."
        );
      } else {
        bullets.push(
          "⏱️ Great job, you played full 90 seconds without getting killed by an asteroid."
        );
      }
    }
    bullets.push("🎮 Finish strong during double-point finale (last 15 seconds).");
    if (payload.runSummary && payload.runSummary.stats) {
      const bonusAsteroidsKilled = payload.runSummary.stats.bonusAsteroidsKilled ?? 0;
      const bonusAsteroidsSpawned = payload.runSummary.stats.bonusAsteroidsSpawned ?? 0;

      if (bonusAsteroidsKilled < 5) {
        bullets.push(
          "🌑 Destroy all 8 bonus asteroids. Destroyed: " +
            bonusAsteroidsKilled +
            " of " +
            bonusAsteroidsSpawned +
            "."
        );
      } else {
        bullets.push("🌑 Great job, you destroyed all 8 bonus asteroids.");
      }
    }
    if (payload.runSummary && payload.runSummary.stats) {
      const bonusStarsCollected = payload.runSummary.stats.bonusStarsCollected ?? 0;
      const bonusStarsSpawned = payload.runSummary.stats.bonusStarsSpawned ?? 0;
      const bonusStarsCollectedAccuracy = payload.runSummary.stats.bonusStarsCollectedAccuracy ?? 0;

      if (bonusStarsCollected < 5) {
        bullets.push(
          "🌟 Collect more bonus stars. Accuracy: " +
            (bonusStarsCollectedAccuracy * 100).toFixed(0) +
            "% (" +
            bonusStarsCollected +
            " of " +
            bonusStarsSpawned +
            ")."
        );
      } else {
        bullets.push(
          "🌟 Great job, you collected all bonus stars (" +
            bonusStarsCollected +
            " of " +
            bonusStarsSpawned +
            ")."
        );
      }
    }
    if (payload.runSummary && payload.runSummary.stats) {
      const shotsFiredAccuracy = payload.runSummary.stats.shotsFiredAccuracy ?? 0;
      const shotsFiredOnTarget = payload.runSummary.stats.shotsFiredOnTarget ?? 0;
      const shotsFired = payload.runSummary.stats.shotsFired ?? 0;

      if (shotsFiredAccuracy < 1) {
        bullets.push(
          "🎯 Increase shots fired accuracy for end of run bonus (0-100%). Accuracy: " +
            (shotsFiredAccuracy * 100).toFixed(0) +
            "% (" +
            shotsFiredOnTarget +
            " of " +
            shotsFired +
            ")."
        );
      } else {
        bullets.push(
          "🎯 Great job, shots fired accuracy for end of run bonus is 100% (" +
            shotsFiredOnTarget +
            " of " +
            shotsFired +
            ")."
        );
      }
    }
    if (payload.runSummary && payload.runSummary.stats) {
      const hardenedAsteroidsKilledAccuracy =
        payload.runSummary.stats.hardenedAsteroidsKilledAccuracy ?? 0;
      const hardenedAsteroidsKilled = payload.runSummary.stats.hardenedAsteroidsKilled ?? 0;
      const hardenedAsteroidsSpawned = payload.runSummary.stats.hardenedAsteroidsSpawned ?? 0;

      if (hardenedAsteroidsKilledAccuracy < 1) {
        bullets.push(
          "🛡️ Destroy more hardened asteroids. Accuracy: " +
            (hardenedAsteroidsKilledAccuracy * 100).toFixed(0) +
            "% (" +
            hardenedAsteroidsKilled +
            " of " +
            hardenedAsteroidsSpawned +
            ")."
        );
      } else {
        bullets.push(
          "🛡️ Great job, you destroyed all hardened asteroids (" +
            hardenedAsteroidsKilled +
            " of " +
            hardenedAsteroidsSpawned +
            ")."
        );
      }
    }
    if (payload.runSummary && payload.runSummary.stats) {
      const starsCollectedAccuracy = payload.runSummary.stats.starsCollectedAccuracy ?? 0;
      const starsCollected = payload.runSummary.stats.starsCollected ?? 0;
      const starsSpawned = payload.runSummary.stats.starsSpawned ?? 0;

      if (starsCollectedAccuracy < 1) {
        bullets.push(
          "⭐ Collect more regular stars. Accuracy: " +
            (starsCollectedAccuracy * 100).toFixed(0) +
            "% (" +
            starsCollected +
            " of " +
            starsSpawned +
            ")."
        );
      } else {
        bullets.push(
          "⭐ Great job, you collected all regular stars (" +
            starsCollected +
            " of " +
            starsSpawned +
            ")."
        );
      }
    }
    if (payload.runSummary && payload.runSummary.stats) {
      const asteroidsKilledAccuracy = payload.runSummary.stats.asteroidsKilledAccuracy ?? 0;
      const asteroidsKilled = payload.runSummary.stats.asteroidsKilled ?? 0;
      const asteroidsSpawned = payload.runSummary.stats.asteroidsSpawned ?? 0;

      if (asteroidsKilledAccuracy < 1) {
        bullets.push(
          "🪨 Destroy more regular asteroids. Accuracy: " +
            (asteroidsKilledAccuracy * 100).toFixed(0) +
            "% (" +
            asteroidsKilled +
            " of " +
            asteroidsSpawned +
            ")."
        );
      } else {
        bullets.push(
          "🪨 Great job, you destroyed all regular asteroids (" +
            asteroidsKilled +
            " of " +
            asteroidsSpawned +
            ")."
        );
      }
    }
    return {
      title: "How to improve your score",
      bullets,
    };
  }
}
