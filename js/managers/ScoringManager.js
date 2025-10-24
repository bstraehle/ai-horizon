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
   * Also applies a time-based finale multiplier when within the final N seconds of the timer.
   * @param {{ score:number, timerRemaining?:number, finaleBaseScore?:number, finaleBonus?:number }} game Game-like object exposing mutable numeric 'score'.
   * @param {number} points Base points to add (must be finite & > 0).
   * @returns {{base:number, bonusCount:number, bonusPoints:number, totalAdded:number, newScore:number, appliedMultiplier:number}}
   */
  add(game, points) {
    if (!game || typeof game.score !== "number") {
      return {
        base: 0,
        bonusCount: 0,
        bonusPoints: 0,
        totalAdded: 0,
        newScore: 0,
        appliedMultiplier: 1,
      };
    }
    if (typeof points !== "number" || !Number.isFinite(points) || points <= 0) {
      return {
        base: 0,
        bonusCount: 0,
        bonusPoints: 0,
        totalAdded: 0,
        newScore: game.score,
        appliedMultiplier: 1,
      };
    }
    const finaleWindow = CONFIG.GAME.FINALE_BONUS_WINDOW_SECONDS || 0;
    const finaleMult = CONFIG.GAME.FINALE_BONUS_MULTIPLIER || 1;
    let appliedMultiplier = 1;
    const isInFinale =
      finaleWindow > 0 &&
      finaleMult > 1 &&
      typeof game.timerRemaining === "number" &&
      game.timerRemaining <= finaleWindow &&
      game.timerRemaining > 0;

    if (isInFinale) {
      appliedMultiplier = finaleMult;
    }
    const effectivePoints = points * appliedMultiplier;

    if (isInFinale) {
      if (typeof game.finaleBaseScore === "number") {
        game.finaleBaseScore += points;
      }
      if (typeof game.finaleBonus === "number") {
        game.finaleBonus += points * (appliedMultiplier - 1);
      }
    }

    const threshold = CONFIG.GAME.SCORING_BONUS_THRESHOLD || 0;
    const bonusPer = CONFIG.GAME.SCORING_BONUS_POINTS || 0;
    const before = game.score;
    game.score = before + effectivePoints;
    let bonusCount = 0;
    if (threshold > 0 && bonusPer > 0) {
      const prevBuckets = Math.floor(before / threshold);
      const newBuckets = Math.floor(game.score / threshold);
      bonusCount = newBuckets - prevBuckets;
      if (bonusCount > 0) {
        const bonusTotal = bonusCount * bonusPer;
        game.score += bonusTotal;
        return {
          base: effectivePoints,
          bonusCount,
          bonusPoints: bonusTotal,
          totalAdded: effectivePoints + bonusTotal,
          newScore: game.score,
          appliedMultiplier,
        };
      }
    }
    return {
      base: effectivePoints,
      bonusCount: 0,
      bonusPoints: 0,
      totalAdded: effectivePoints,
      newScore: game.score,
      appliedMultiplier,
    };
  },
  /**
   * Compute and apply an end-of-run accuracy bonus based on hits per shot.
   * Formula: bonus = round(baseScore * accuracy) where accuracy = (regularKills + hardenedBulletHits) / shotsFired.
   * - Regular asteroids count as 1 hit (destroyed on 1 bullet).
   * - Hardened/bonus asteroids contribute raw bullet hits: typically 10 hits (base), 5 hits when upgraded.
   * - Safe to call multiple times; bonus applied at most once (idempotent).
   * - Stores derived values on the game instance for UI / telemetry.
   * @param {{ score:number, shotsFired?:number, regularAsteroidsKilled?:number, hardenedAsteroidsKilled?:number, hardenedAsteroidHitBullets?:number, accuracyBonus?:number, accuracy?:number, _accuracyBonusApplied?:boolean }} game
   * @returns {{ applied:boolean, baseScore:number, accuracy:number, bonus:number, newScore:number }}
   */
  applyAccuracyBonus(game) {
    if (!game || typeof game.score !== "number")
      return { applied: false, baseScore: 0, accuracy: 0, bonus: 0, newScore: 0 };
    if (game._accuracyBonusApplied) {
      const totalHits = (game.regularAsteroidsKilled || 0) + (game.hardenedAsteroidHitBullets || 0);
      const shots = game.shotsFired || 0;
      const acc = shots > 0 ? totalHits / shots : 0;
      return {
        applied: false,
        baseScore: game.score,
        accuracy: acc,
        bonus: game.accuracyBonus || 0,
        newScore: game.score,
      };
    }
    const baseScore = game.score;
    const totalHits = (game.regularAsteroidsKilled || 0) + (game.hardenedAsteroidHitBullets || 0);
    const shots = game.shotsFired || 0;
    const accuracy = shots > 0 ? Math.min(1, totalHits / shots) : 0;
    const bonus = Math.round(baseScore * accuracy);
    if (bonus > 0) {
      game.score += bonus;
    }
    game.accuracy = accuracy;
    game.accuracyBonus = bonus;
    game._accuracyBonusApplied = true;
    return { applied: bonus > 0, baseScore, accuracy, bonus, newScore: game.score };
  },
};

export default ScoringManager;
