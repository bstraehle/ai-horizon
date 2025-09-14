import { CONFIG } from "../constants.js";

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
          const pal = asteroid && asteroid._palette ? asteroid._palette : null;
          const baseColor = (pal && (pal.GRAD_MID || pal.GRAD_IN || pal.CRATER)) || "#ffd700";
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
        // Show a red +50 popup for red bonus stars (styled like indestructible asteroid popup but red)
        if (star && star.isRed && typeof game.createScorePopup === "function") {
          const opts = {
            color: CONFIG.COLORS.STAR_RED.BASE,
            fontSize: 20,
            fontWeight: "700",
            glow: true,
            glowColor: CONFIG.COLORS.STAR_RED.BASE,
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
