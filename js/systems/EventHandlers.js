import { CONFIG } from "../constants.js";

/**
 * EventHandlers – centralized registration of EventBus side effects.
 *
 * Purpose:
 * - Isolate cross‑cutting reactions (scoring, particle spawning, explosions, game over) from core logic.
 * - Keep `game.js` lean while maintaining a single file to audit gameplay side effects.
 * - Provide a single unsubscribe function for cleanup in tests or hot reload scenarios.
 *
 * Notes:
 * - Handlers are intentionally small and defer complex logic to game instance helper methods.
 * - Duplicate event subscriptions are avoided by storing and invoking returned unsubscribe callbacks.
 */
/** Centralized EventBus subscriptions and side-effects. */
export const EventHandlers = {
  /**
   * Wire up event handlers for the given game instance.
   * Returns an unsubscribe function to remove all handlers if needed.
   * @param {any} game
   * @returns {()=>void}
   */
  register(game) {
    const { events } = game;
    /** @type {Array<() => void>} */
    const unsubs = [];

    // bulletHitAsteroid → score, explosion, optional popup
    unsubs.push(
      // @ts-ignore
      /** @param {any} payload */
      events.on("bulletHitAsteroid", function (/** @type {{ asteroid:any }} */ payload) {
        const { asteroid } = payload;
        // Award points (special-case indestructible asteroids)
        const add =
          asteroid && asteroid.isIndestructible
            ? CONFIG.GAME.ASTEROID_SCORE_INDESTRUCTIBLE
            : CONFIG.GAME.ASTEROID_SCORE;
        game.score += add;
        // Create explosion and a colored score popup
        game.createExplosion(asteroid.x + asteroid.width / 2, asteroid.y + asteroid.height / 2);
        // Only show a score popup for indestructible asteroids
        if (asteroid && asteroid.isIndestructible && typeof game.createScorePopup === "function") {
          // Dramatic +100 popup: use asteroid's palette color when available (keeps theme consistent),
          // otherwise fall back to gold. Prefer a mid gradient color for good contrast.
          // Unified danger red color for +100 popup
          const baseColor = CONFIG.COLORS.SCORE.DANGER_RED;
          const opts = {
            color: baseColor,
            fontSize: 20,
            fontWeight: "700",
            glow: true,
            glowColor: baseColor,
            glowBlur: 12,
            stroke: "rgba(0,0,0,0.85)",
            maxLife: 1.2,
          };
          game.createScorePopup(
            asteroid.x + asteroid.width / 2,
            asteroid.y + asteroid.height / 2,
            add,
            opts
          );
        }
        game.updateScore();
      })
    );

    // playerHitAsteroid → game over
    unsubs.push(
      events.on("playerHitAsteroid", () => {
        game.gameOver();
      })
    );

    // collectedStar → score + optional popup
    unsubs.push(
      // @ts-ignore
      /** @param {any} payload */
      events.on("collectedStar", function (/** @type {{ star:any }} */ payload) {
        const { star } = payload;
        const add = star && star.isRed ? CONFIG.GAME.STAR_SCORE_RED : CONFIG.GAME.STAR_SCORE;
        game.score += add;
        game.updateScore();
        // Show a +50 popup for red bonus stars using the SAME styling logic as +100 (indestructible asteroid)
        // for visual consistency. We reuse the dynamic palette extraction, falling back to neutral star base.
        if (star && star.isRed && typeof game.createScorePopup === "function") {
          // Use the same visual tone as +100: prefer mid tone from MONO_DARK asteroid palette for consistency.
          // Fallback chain mirrors +100 logic (mid -> in -> crater -> neutral star base).
          // Use unified danger red color for +50 popup
          const baseColor = CONFIG.COLORS.SCORE.DANGER_RED;
          const opts = {
            color: baseColor,
            fontSize: 20,
            fontWeight: "700",
            glow: true,
            glowColor: baseColor,
            glowBlur: 12,
            stroke: "rgba(0,0,0,0.85)",
            maxLife: 1.2,
          };
          game.createScorePopup(star.x + star.width / 2, star.y + star.height / 2, add, opts);
        }
      })
    );

    // collectedStar → particle burst
    unsubs.push(
      // @ts-ignore
      /** @param {any} payload */
      events.on("collectedStar", function (/** @type {{ star:any }} */ payload) {
        const { star } = payload;
        const rng = game.rng;
        for (let p = 0; p < CONFIG.STAR.PARTICLE_BURST; p++) {
          game.particles.push(
            game.particlePool.acquire(
              star.x + star.width / 2,
              star.y + star.height / 2,
              Math.cos((CONFIG.TWO_PI * p) / CONFIG.STAR.PARTICLE_BURST) *
                (rng.range(0, CONFIG.STAR.PARTICLE_BURST_SPEED_VAR) +
                  CONFIG.STAR.PARTICLE_BURST_SPEED_MIN),
              Math.sin((CONFIG.TWO_PI * p) / CONFIG.STAR.PARTICLE_BURST) *
                (rng.range(0, CONFIG.STAR.PARTICLE_BURST_SPEED_VAR) +
                  CONFIG.STAR.PARTICLE_BURST_SPEED_MIN),
              CONFIG.STAR.PARTICLE_LIFE,
              CONFIG.STAR.PARTICLE_LIFE,
              rng.range(0, CONFIG.STAR.PARTICLE_SIZE_VARIATION) + CONFIG.STAR.PARTICLE_SIZE_MIN,
              star && star.isRed ? CONFIG.COLORS.STAR_RED.BASE : CONFIG.COLORS.STAR.BASE
            )
          );
        }
      })
    );

    return () => {
      for (const off of unsubs) off();
    };
  },
};
