import { CONFIG } from "../constants.js";
import { ScoringManager } from "../managers/ScoringManager.js";
import { BackgroundManager } from "../managers/BackgroundManager.js";

/**
 * EventHandlers – centralized wiring of EventBus driven gameplay side‑effects.
 *
 * Purpose
 * -------
 * Provide one auditable location where score mutations, VFX (explosions / particles), UI popups
 * and terminal state transitions (game over) are bound to domain events. This keeps `game.js`
 * slim and makes it easy to reason about all non‑pure reactions the game performs each frame.
 *
 * Behavior & Covered Events
 * -------------------------
 * - bulletHitAsteroid: Awards score (different value for hardened asteroids), spawns an
 *   explosion entity and optionally a score popup.
 * - playerHitAsteroid: Triggers the game over sequence exactly once per emission chain.
 * - collectedStar (score path): Awards score (bonus for red stars) and shows a popup for red stars.
 * - collectedStar (particle path): Emits a deterministic radial particle burst whose velocity
 *   magnitudes incorporate RNG variance for visual variety while keeping angle distribution stable.
 *
 * Determinism
 * -----------
 * Deterministic outcomes rely on the caller providing a seeded RNG (`game.rng`). Angle placement of
 * the star particle burst is fixed; only speed variance is randomized, preserving reproducible tests
 * when the RNG seed is controlled.
 *
 * Performance
 * -----------
 * Handlers avoid heap allocations except when pushing pooled entities / particles. Loops are tight
 * and short due to bounded burst counts (`CONFIG.STAR.PARTICLE_BURST`). Popup option objects are
 * small literals created only for qualifying events (rare vs per‑frame). All other work defers to
 * existing pooled systems (`particlePool`, `createExplosion`).
 *
 * Side Effects
 * ------------
 * Mutates: `game.score`, `game.particles[]`, popup/UI layers, and may transition game state via
 * `game.gameOver()`. Calls rendering / audio hooks indirectly through `createExplosion` & popups.
 *
 * Failure Modes / Defensive Notes
 * -------------------------------
 * - Missing properties on payload objects are gracefully ignored (guards check existence).
 * - If popup helpers are absent, scoring still proceeds without throwing.
 * - Hardened asteroid handling defaults to a dedicated score constant.
 *
 * Testing
 * -------
 * The returned aggregated unsubscribe function enables isolated unit tests: register → emit events
 * → assert game state → teardown (unsubscribe) to prevent test cross‑pollination.
 */
export const EventHandlers = {
  /**
   * Register all event handlers against the supplied game instance.
   *
   * Contract
   * --------
   * Input: A mutable `game` object exposing: `events`, `score`, `rng`, pools (particlePool,
   * explosionPool), collections (particles), creation helpers (`createExplosion`,
   * `createScorePopup`), scoring updater (`updateScore`), and terminal method (`gameOver`).
   * Output: A single function that when invoked unsubscribes every registered handler exactly once.
   *
   * Ordering & Idempotency
   * ----------------------
   * Order of handler registration matches declaration order; no reliance on inter‑handler ordering
   * currently exists. Calling `register` multiple times without invoking prior unsubscribe will
   * duplicate listeners—callers should treat this as a one‑shot setup per game lifecycle.
   *
   * Error Handling
   * --------------
   * Handlers are resilient to partial payloads and will early return or branch safely when optional
   * helpers are missing (e.g., `createScorePopup`).
   *
   * @param {any} game Mutable game instance (loosely typed to avoid circular imports in JSDoc)
   * @returns {() => void} Unsubscribe all registered event listeners.
   */
  register(game) {
    const { events } = game;
    /** @type {Array<() => void>} */
    const unsubs = [];

    unsubs.push(
      // @ts-ignore
      /**
       * bulletHitAsteroid handler
       
       * Payload Shape: { asteroid: { x:number, y:number, width:number, height:number, isHardened?:boolean } }
       * Effects: Mutates score, triggers explosion entity creation, optional score popup (+100) when
       *           asteroid is hardened, then invokes score UI refresh.
       * Determinism: Explosion position derived from asteroid center (pure). Score constant selection
       *              is branch‑based (no randomness). Popup styling fixed.
       * Failure Modes: If asteroid missing, handler becomes a no‑op except safe `updateScore` call.
       * @param {any} payload
       */
      events.on("bulletHitAsteroid", function (/** @type {{ asteroid:any }} */ payload) {
        const { asteroid } = payload;
        let add = CONFIG.GAME.ASTEROID_SCORE;
        if (asteroid && asteroid.isHardened) {
          add = asteroid.isBonus
            ? CONFIG.GAME.ASTEROID_SCORE_BONUS
            : CONFIG.GAME.ASTEROID_SCORE_HARDENED;
        }
        const r = ScoringManager.add(game, add);
        if (asteroid) {
          if (asteroid.isHardened) {
            game.hardenedAsteroidKills = (game.hardenedAsteroidKills || 0) + 1;
            if (asteroid.isBonus) {
              game.bonusAsteroidKills = (game.bonusAsteroidKills || 0) + 1;
            }
          } else {
            game.asteroidKills = (game.asteroidKills || 0) + 1;
          }
        }
        game.createExplosion(asteroid.x + asteroid.width / 2, asteroid.y + asteroid.height / 2);
        if (asteroid && asteroid.isHardened && typeof game.createScorePopup === "function") {
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
            r && typeof r.base === "number" ? r.base : add,
            opts
          );
        }
        game.updateScore();
      })
    );

    unsubs.push(
      events.on("playerHitAsteroid", () => {
        game.gameOver();
      })
    );

    unsubs.push(
      // @ts-ignore
      /**
       * collectedStar (score branch)
       *
       * Payload Shape: { star: { x:number, y:number, width:number, height:number, isRed?:boolean } }
       * Effects: Adds base or red‑bonus score, updates UI score, optionally spawns +50 popup (red only).
       * Determinism: Score increment is branch‑based; popup styling fixed.
       * Failure Modes: Missing star payload yields guarded no‑op aside from safe UI refresh attempt.
       * @param {any} payload
       */
      events.on("collectedStar", function (/** @type {{ star:any }} */ payload) {
        const { star } = payload;
        const add = star && star.isRed ? CONFIG.GAME.STAR_SCORE_BONUS : CONFIG.GAME.STAR_SCORE;
        const r = ScoringManager.add(game, add);
        try {
          game.starsCollected = (game.starsCollected || 0) + 1;
          if (star && star.isRed) {
            game.bonusStarsCollected = (game.bonusStarsCollected || 0) + 1;
          }
        } catch {
          /* stat increments optional */
        }
        game.updateScore();
        if (star && star.isRed && typeof game.createScorePopup === "function") {
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
            star.x + star.width / 2,
            star.y + star.height / 2,
            r && typeof r.base === "number" ? r.base : add,
            opts
          );
        }
      })
    );

    unsubs.push(
      // @ts-ignore
      /**
       * collectedStar (particle burst branch)
       *
       * Payload Shape: same as score branch.
       * Effects: Allocates (via pool) N radial particles whose base angles are evenly distributed.
       * Performance: O(N) where N = CONFIG.STAR.PARTICLE_BURST (small constant). Single push per particle.
       * Determinism: Angle distribution stable; speed variance depends on seeded RNG for reproducibility.
       * Failure Modes: Missing star payload short‑circuits loop. Pool acquire errors propagate (none expected).
       * @param {any} payload
       */
      events.on("collectedStar", function (/** @type {{ star:any }} */ payload) {
        const { star } = payload;
        const rng = game.rng;
        const particleMult =
          typeof game._performanceParticleMultiplier === "number"
            ? Math.max(0.1, Math.min(1, game._performanceParticleMultiplier))
            : 1;
        const burstCount = Math.max(1, Math.round(CONFIG.STAR.PARTICLE_BURST * particleMult));
        const budget = Number.isFinite(game._particleBudget)
          ? game._particleBudget
          : Number.POSITIVE_INFINITY;
        for (let p = 0; p < burstCount; p++) {
          if (game.particles.length >= budget) break;
          game.particles.push(
            game.particlePool.acquire(
              star.x + star.width / 2,
              star.y + star.height / 2,
              Math.cos((CONFIG.TWO_PI * p) / burstCount) *
                (rng.range(0, CONFIG.STAR.PARTICLE_BURST_SPEED_VAR) +
                  CONFIG.STAR.PARTICLE_BURST_SPEED_MIN),
              Math.sin((CONFIG.TWO_PI * p) / burstCount) *
                (rng.range(0, CONFIG.STAR.PARTICLE_BURST_SPEED_VAR) +
                  CONFIG.STAR.PARTICLE_BURST_SPEED_MIN),
              CONFIG.STAR.PARTICLE_LIFE,
              CONFIG.STAR.PARTICLE_LIFE,
              rng.range(0, CONFIG.STAR.PARTICLE_SIZE_VARIATION) + CONFIG.STAR.PARTICLE_SIZE_MIN,
              (function () {
                const isRed = star && star.isRed;
                if (!isRed) return CONFIG.COLORS.STAR.BASE;
                const palette = BackgroundManager.getCurrentNebulaPalette();
                if (palette === "blue" && CONFIG.COLORS.STAR_BLUE)
                  return CONFIG.COLORS.STAR_BLUE.BASE;
                return CONFIG.COLORS.STAR_RED.BASE;
              })()
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
