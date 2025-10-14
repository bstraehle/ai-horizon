/**
 * AIAnalysisAdapter – mock implementation that generates simple suggestions
 * based on end-of-run stats. Later we can swap this with a real REST-backed adapter.
 */
export class AIAnalysisAdapter {
  /**
   * Analyze a run and return actionable suggestions.
   * Accepts either a plain stats object or a payload { stats, runSummary }.
   * @param {object} input
   * @returns {Promise<{title:string, bullets:string[]}>}
   */
  async analyze(input) {
    // Simulate slight network latency to align with future REST behavior
    await new Promise((r) => setTimeout(r, 60));
    /** @type {any} */
    const payload = input || {};
    console.log("AI analysis payload:", payload);
    /** @type {any} */
    //const runSummary = payload && payload.runSummary ? payload.runSummary : null;
    /** @type {any} */
    //let stats = payload && payload.stats ? payload.stats : payload;

    // NOTE: In a real REST integration, we'd send `runSummary` as the request body and
    // possibly include derived scalar features from `stats`.
    const bullets = [];
    if (
      payload.runSummary &&
      payload.runSummary.timer &&
      payload.runSummary.timer.remainingSeconds > 0
    ) {
      bullets.push("Play full 60 seconds");
    }
    if (
      payload.runSummary &&
      payload.runSummary.stats &&
      payload.runSummary.stats.starsCollectedAccuracy < 1
    ) {
      bullets.push("Collect more stars");
    }
    if (
      payload.runSummary &&
      payload.runSummary.stats &&
      payload.runSummary.stats.bonusStarsCollectedAccuracy < 1
    ) {
      bullets.push("Collect more bonus stars");
    }
    if (
      payload.runSummary &&
      payload.runSummary.stats &&
      payload.runSummary.stats.asteroidsKilledAccuracy < 1
    ) {
      bullets.push("Destroy more asteroids");
    }
    if (
      payload.runSummary &&
      payload.runSummary.stats &&
      payload.runSummary.stats.hardenedAsteroidsKilledAccuracy < 1
    ) {
      bullets.push("Destroy more hardened asteroids");
    }
    if (
      payload.runSummary &&
      payload.runSummary.stats &&
      payload.runSummary.stats.bonusAsteroidsKilledAccuracy < 1
    ) {
      bullets.push("Destroy all 5 bonus asteroids");
    }
    if (
      payload.runSummary &&
      payload.runSummary.stats &&
      payload.runSummary.stats.shotsFiredAccuracy < 1
    ) {
      bullets.push("Increase shot accuracy with short bursts");
    }
    bullets.push("Maximize double points in last 10 seconds");
    return {
      title: "✨ AI analysis is not available",
      bullets,
    };
  }
}
