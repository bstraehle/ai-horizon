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
          return { ...transformedResponse, isRemote: true, rawResponse: response };
        }
      } catch {
        // AI analysis failed
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
      if (payload.runSummary.timer.survivedSeconds > 0) {
        bullets.push(
          "⏱️ Play full 90 seconds without getting killed by an asteroid. Played: " +
            payload.runSummary.timer.survivedSeconds +
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
      if (payload.runSummary.stats.bonusAsteroidsKilled < 5) {
        bullets.push(
          "🌑 Destroy all 8 bonus asteroids. Destroyed: " +
            payload.runSummary.stats.bonusAsteroidsKilled +
            " of " +
            payload.runSummary.stats.bonusAsteroidsSpawned +
            "."
        );
      } else {
        bullets.push("🌑 Great job, you destroyed all 8 bonus asteroids.");
      }
    }
    if (payload.runSummary && payload.runSummary.stats) {
      if (payload.runSummary.stats.bonusStarsCollected < 5) {
        bullets.push(
          "🌟 Collect more bonus stars. Accuracy: " +
            (payload.runSummary.stats.bonusStarsCollectedAccuracy * 100).toFixed(0) +
            "% (" +
            payload.runSummary.stats.bonusStarsCollected +
            " of " +
            payload.runSummary.stats.bonusStarsSpawned +
            ")."
        );
      } else {
        bullets.push(
          "🌟 Great job, you collected all bonus stars (" +
            payload.runSummary.stats.bonusStarsCollected +
            " of " +
            payload.runSummary.stats.bonusStarsSpawned +
            ")."
        );
      }
    }
    if (payload.runSummary && payload.runSummary.stats) {
      if (payload.runSummary.stats.shotsFiredAccuracy < 1) {
        bullets.push(
          "🎯 Increase shots fired accuracy for end of run bonus (0-100%). Accuracy: " +
            (payload.runSummary.stats.shotsFiredAccuracy * 100).toFixed(0) +
            "% (" +
            payload.runSummary.stats.shotsFiredOnTarget +
            " of " +
            payload.runSummary.stats.shotsFired +
            ")."
        );
      } else {
        bullets.push(
          "🎯 Great job, shots fired accuracy for end of run bonus is 100% (" +
            payload.runSummary.stats.shotsFiredOnTarget +
            " of " +
            payload.runSummary.stats.shotsFired +
            ")."
        );
      }
    }
    if (payload.runSummary && payload.runSummary.stats) {
      if (payload.runSummary.stats.hardenedAsteroidsKilledAccuracy < 1) {
        bullets.push(
          "🛡️ Destroy more hardened asteroids. Accuracy: " +
            (payload.runSummary.stats.hardenedAsteroidsKilledAccuracy * 100).toFixed(0) +
            "% (" +
            payload.runSummary.stats.hardenedAsteroidsKilled +
            " of " +
            payload.runSummary.stats.hardenedAsteroidsSpawned +
            ")."
        );
      } else {
        bullets.push(
          "🛡️ Great job, you destroyed all hardened asteroids (" +
            payload.runSummary.stats.hardenedAsteroidsKilled +
            " of " +
            payload.runSummary.stats.hardenedAsteroidsSpawned +
            ")."
        );
      }
    }
    if (payload.runSummary && payload.runSummary.stats) {
      if (payload.runSummary.stats.starsCollectedAccuracy < 1) {
        bullets.push(
          "⭐ Collect more regular stars. Accuracy: " +
            (payload.runSummary.stats.starsCollectedAccuracy * 100).toFixed(0) +
            "% (" +
            payload.runSummary.stats.starsCollected +
            " of " +
            payload.runSummary.stats.starsSpawned +
            ")."
        );
      } else {
        bullets.push(
          "⭐ Great job, you collected all regular stars (" +
            payload.runSummary.stats.starsCollected +
            " of " +
            payload.runSummary.stats.starsSpawned +
            ")."
        );
      }
    }
    if (payload.runSummary && payload.runSummary.stats) {
      if (payload.runSummary.stats.asteroidsKilledAccuracy < 1) {
        bullets.push(
          "🪨 Destroy more regular asteroids. Accuracy: " +
            (payload.runSummary.stats.asteroidsKilledAccuracy * 100).toFixed(0) +
            "% (" +
            payload.runSummary.stats.asteroidsKilled +
            " of " +
            payload.runSummary.stats.asteroidsSpawned +
            ")."
        );
      } else {
        bullets.push(
          "🪨 Great job, you destroyed all regular asteroids (" +
            payload.runSummary.stats.asteroidsKilled +
            " of " +
            payload.runSummary.stats.asteroidsSpawned +
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
