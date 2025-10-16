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
   * @returns {Promise<{title:string, bullets:string[]}>}
   */
  async analyze(input) {
    /** @type {any} */
    const payload = input || {};

    if (this._remoteAdapter && this._endpoint) {
      try {
        const response = await this._remoteAdapter.postJSON(this._endpoint, payload.runSummary);
        if (response) {
          var transformedResponse = this._transformRemoteResponse(response);
          return transformedResponse;
        }
      } catch {
        // AI analysis failed
      }
    }

    return this._deterministicAnalysis(payload);
  }

  /**
   * Transform the remote API response format to internal format.
   * @param {any} response API response with feedback and specific-tip-* fields
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
      const tipKey = `specific-tip-${i}`;
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
    if (
      payload.runSummary &&
      payload.runSummary.timer &&
      payload.runSummary.timer.toPlaySeconds > 0
    ) {
      bullets.push(
        "⏱️ Play full 60 seconds, played: " + payload.runSummary.timer.killedByAsteroidSeconds + "."
      );
    }
    bullets.push("🎮 Maximize double points in last 10 seconds.");
    if (
      payload.runSummary &&
      payload.runSummary.stats &&
      payload.runSummary.stats.bonusAsteroidsKilled < 5
    ) {
      bullets.push(
        "🪨 Destroy all 5 bonus asteroids, destroyed: " +
          payload.runSummary.stats.bonusAsteroidsKilled +
          "."
      );
    }
    if (
      payload.runSummary &&
      payload.runSummary.stats &&
      payload.runSummary.stats.bonusStarsCollectedAccuracy < 1
    ) {
      bullets.push(
        "⭐ Collect more bonus stars, accuracy: " +
          (payload.runSummary.stats.bonusStarsCollectedAccuracy * 100).toFixed(0) +
          "%."
      );
    }
    if (
      payload.runSummary &&
      payload.runSummary.stats &&
      payload.runSummary.stats.shotsFiredAccuracy < 1
    ) {
      bullets.push(
        "🎯 Increase shot accuracy for end of run bonus, accuracy: " +
          (payload.runSummary.stats.shotsFiredAccuracy * 100).toFixed(0) +
          "%."
      );
    }
    if (
      payload.runSummary &&
      payload.runSummary.stats &&
      payload.runSummary.stats.hardenedAsteroidsKilledAccuracy < 1
    ) {
      bullets.push(
        "🪨 Destroy more hardened asteroids, accuracy: " +
          (payload.runSummary.stats.hardenedAsteroidsKilledAccuracy * 100).toFixed(0) +
          "%."
      );
    }
    if (
      payload.runSummary &&
      payload.runSummary.stats &&
      payload.runSummary.stats.starsCollectedAccuracy < 1
    ) {
      bullets.push(
        "⭐ Collect more stars — aim for clusters, accuracy: " +
          (payload.runSummary.stats.starsCollectedAccuracy * 100).toFixed(0) +
          "%."
      );
    }
    if (
      payload.runSummary &&
      payload.runSummary.stats &&
      payload.runSummary.stats.asteroidsKilledAccuracy < 1
    ) {
      bullets.push(
        "🪨 Destroy more asteroids — aim for clusters, accuracy: " +
          (payload.runSummary.stats.asteroidsKilledAccuracy * 100).toFixed(0) +
          "%."
      );
    }
    return {
      title: "How to improve your score",
      bullets,
    };
  }
}
