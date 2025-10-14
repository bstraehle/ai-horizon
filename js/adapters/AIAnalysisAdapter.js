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
    /** @type {any} */
    const runSummary = payload && payload.runSummary ? payload.runSummary : null;
    /** @type {any} */
    let stats = payload && payload.stats ? payload.stats : payload;

    // If only runSummary was provided, derive a minimal stats object
    if ((!stats || typeof stats !== "object") && runSummary && typeof runSummary === "object") {
      try {
        stats = {
          score: runSummary?.score?.finalScore ?? 0,
          accuracy:
            runSummary?.score?.shotsFiredAccuracy ?? runSummary?.stats?.shotsFiredAccuracy ?? 0,
          shotsFired: runSummary?.stats?.shotsFired ?? 0,
          asteroidsKilled: runSummary?.stats?.asteroidsKilled ?? 0,
          hardenedAsteroidsKilled: runSummary?.stats?.hardenedAsteroidsKilled ?? 0,
          bonusAsteroidsKilled: runSummary?.stats?.bonusAsteroidsKilled ?? 0,
          starsCollected: runSummary?.stats?.starsCollected ?? 0,
          bonusStarsCollected: runSummary?.stats?.bonusStarsCollected ?? 0,
          timerSeconds: runSummary?.timer?.totalSeconds ?? 60,
          timerRemaining: runSummary?.timer?.remainingSeconds ?? 0,
        };
      } catch {
        stats = {};
      }
    }

    // NOTE: In a real REST integration, we'd send `runSummary` as the request body and
    // possibly include derived scalar features from `stats`.
    const bullets = [];
    const accPct = Math.round((Number(stats?.accuracy) || 0) * 100);

    if (
      (stats?.bonusStarsCollected || 0) < Math.max(3, Math.floor((stats?.timerSeconds || 60) / 20))
    ) {
      bullets.push("Collect more bonus stars");
    }
    if (
      (stats?.bonusAsteroidsKilled || 0) <
      Math.max(2, Math.floor((stats?.asteroidsKilled || 0) * 0.15))
    ) {
      bullets.push("Destroy more bonus asteroids");
    }
    if (accPct < 55) {
      bullets.push("Improve shot accuracy with shorter bursts");
    } else if (accPct < 75) {
      bullets.push("Keep accuracy up—aim before firing");
    }
    if ((stats?.shotsFired || 0) > Math.max(120, (stats?.timerSeconds || 60) * 3)) {
      bullets.push("Avoid overfiring—conserve shots for higher accuracy");
    }

    const finaleWindow = 10;
    const elapsed = Math.max(0, (stats?.timerSeconds || 60) - (stats?.timerRemaining || 0));
    if (elapsed >= (stats?.timerSeconds || 60) - finaleWindow) {
      bullets.push("Maximize points in the last 10 seconds");
    }

    if (bullets.length === 0) {
      bullets.push("Nice run—try chaining bonus pickups for multipliers");
    }

    return {
      title: "✨ AI analysis coming soon...",
      bullets,
    };
  }
}
