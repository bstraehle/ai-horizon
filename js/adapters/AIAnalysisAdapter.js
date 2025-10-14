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
    bullets.push("Collect more stars and destroy more asteroids");
    bullets.push("Increase your accuracy");
    bullets.push("Maximize double points in the last 10 seconds");
    return {
      title: "✨ AI analysis is coming soon",
      bullets,
    };
  }
}
