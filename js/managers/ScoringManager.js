import { CONFIG } from "../constants.js";

/**
 * ScoringManager – centralised score mutation + milestone bonus awarding.
 *
 * Responsibilities:
 *  - Apply base score increments from gameplay events.
 *  - Detect threshold crossings (every N points) and award configured bonus M points per threshold.
 *  - Support multiple threshold crossings in a single large increment.
 *
 * Configuration (via CONFIG.GAME):
 *  - SCORING_BONUS_THRESHOLD: N (e.g., 1000)
 *  - SCORING_BONUS_POINTS: M (e.g., 250)
 *
 * Contract:
 *  add(game, points) ⇒ { base, bonusCount, bonusPoints, totalAdded, newScore }
 *    - 'points' must be a finite positive number; non‑positive values are ignored (returns zeroed result).
 *    - Awards zero or more milestone bonuses depending on how many thresholds were crossed.
 *    - Mutates game.score in place.
 *
 * Edge Cases:
 *  - Negative / NaN / Infinity points: ignored safely.
 *  - Threshold or bonus disabled (<=0): behaves as simple adder.
 *  - Large increments (e.g., powerups) may cross multiple thresholds; all are awarded.
 */
export const ScoringManager = {
  /**
   * Add base points and apply milestone bonuses.
   * @param {{ score:number }} game Game-like object exposing mutable numeric 'score'.
   * @param {number} points Base points to add (must be finite & > 0).
   * @returns {{base:number, bonusCount:number, bonusPoints:number, totalAdded:number, newScore:number}}
   */
  add(game, points) {
    if (!game || typeof game.score !== "number") {
      return { base: 0, bonusCount: 0, bonusPoints: 0, totalAdded: 0, newScore: 0 };
    }
    if (typeof points !== "number" || !Number.isFinite(points) || points <= 0) {
      return { base: 0, bonusCount: 0, bonusPoints: 0, totalAdded: 0, newScore: game.score };
    }
    const threshold = CONFIG.GAME.SCORING_BONUS_THRESHOLD || 0;
    const bonusPer = CONFIG.GAME.SCORING_BONUS_POINTS || 0;
    const before = game.score;
    game.score = before + points;
    let bonusCount = 0;
    if (threshold > 0 && bonusPer > 0) {
      const prevBuckets = Math.floor(before / threshold);
      const newBuckets = Math.floor(game.score / threshold);
      bonusCount = newBuckets - prevBuckets;
      if (bonusCount > 0) {
        const bonusTotal = bonusCount * bonusPer;
        game.score += bonusTotal;
        return {
          base: points,
          bonusCount,
          bonusPoints: bonusTotal,
          totalAdded: points + bonusTotal,
          newScore: game.score,
        };
      }
    }
    return {
      base: points,
      bonusCount: 0,
      bonusPoints: 0,
      totalAdded: points,
      newScore: game.score,
    };
  },
};

export default ScoringManager;
