// @ts-check
import { describe, it, expect } from "vitest";
import { EventHandlers } from "../js/systems/EventHandlers.js";
import { EventBus } from "../js/core/EventBus.js";
import { CONFIG } from "../js/constants.js";

/**
 * @param {number} timerRemaining
 */
function makeGame(timerRemaining) {
  return {
    score: 0,
    timerRemaining,
    updateScore: () => {},
    events: new EventBus(),
    createExplosion: () => {},
  };
}

describe("Golden asteroid scoring during finale", () => {
  it("doubles golden asteroid points within the finale window", () => {
    const game = makeGame(Math.max(0.1, (CONFIG.GAME.FINALE_BONUS_WINDOW_SECONDS || 5) - 0.1));
    const unsub = EventHandlers.register(game);

    const asteroid = { x: 0, y: 0, width: 10, height: 10, isIndestructible: true, isGolden: true };
    game.events.emit("bulletHitAsteroid", { asteroid });

    expect(game.score).toBe(
      (CONFIG.GAME.ASTEROID_SCORE_GOLDEN || 250) * (CONFIG.GAME.FINALE_BONUS_MULTIPLIER || 2)
    );

    unsub();
  });

  it("does not double golden asteroid points before finale window", () => {
    const windowSeconds = CONFIG.GAME.FINALE_BONUS_WINDOW_SECONDS || 5;
    const game = makeGame(windowSeconds + 1);
    const unsub = EventHandlers.register(game);

    const asteroid = { x: 0, y: 0, width: 10, height: 10, isIndestructible: true, isGolden: true };
    game.events.emit("bulletHitAsteroid", { asteroid });

    expect(game.score).toBe(CONFIG.GAME.ASTEROID_SCORE_GOLDEN || 250);

    unsub();
  });
});
