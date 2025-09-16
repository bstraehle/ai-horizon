import { CONFIG } from "../constants.js";

/**
 * RenderManager – orchestrates draw ordering for all visible game elements.
 *
 * Responsibilities:
 * - Provide stateless static helpers for drawing grouped entity categories (asteroids, bullets, stars, explosions, particles).
 * - Apply sprite optimizations (use pre-rendered atlas when available, fall back to entity draw methods otherwise).
 * - Maintain a deterministic layering order so visual composition is predictable and easy to tweak.
 *
 * Layer order (back → front):
 *   1. Background (delegated to game.drawBackground())
 *   2. Asteroids
 *   3. Bullets (with trail) / collectible stars
 *   4. Explosions
 *   5. Particles / transient effects
 *   6. Player ship
 *   7. Engine trail (drawn after player for glow overlap)
 *   8. Score popups (text overlay, fade + rise)
 *
 * Design notes:
 * - Static methods keep this module side-effect free and easy to unit test.
 * - Avoids per-frame allocations by using simple for loops (hot paths).
 */
export class RenderManager {
  /**
   * Draw all asteroids in their deterministic order.
   *
   * Performance:
   * - Hot path: simple for loop avoids iterator overhead.
   * - Assumes each asteroid exposes a zero‑alloc draw(ctx) method.
   *
   * @param {CanvasRenderingContext2D} ctx Target 2D context.
   * @param {any[]} asteroids Asteroid entity list.
   */
  static drawAsteroids(ctx, asteroids) {
    for (let i = 0; i < asteroids.length; i++) {
      asteroids[i].draw(ctx);
    }
  }

  /**
   * Draw bullets (and their trail) using sprite atlas when available; fallback to per‑bullet draw.
   *
   * Behavior:
   * - When a pre‑rendered bullet sprite exists, draws a single atlas slice scaling height to include trail region.
   * - Otherwise delegates to bullet.draw for compatibility / test environments (no DOM / offscreen failure).
   *
   * @param {CanvasRenderingContext2D} ctx Target 2D context.
   * @param {any[]} bullets Bullet list.
   * @param {any} sprites Optional sprite atlas object (from SpriteManager.createSprites()).
   */
  static drawBullets(ctx, bullets, sprites) {
    const spr = sprites && sprites.bullet;
    const trail = (sprites && sprites.bulletTrail) || CONFIG.BULLET.TRAIL;
    if (spr) {
      const sw = spr.width,
        sh = spr.height;
      for (let i = 0; i < bullets.length; i++) {
        const b = bullets[i];
        const dh = b.height + trail;
        ctx.drawImage(spr, 0, 0, sw, sh, b.x, b.y, b.width, dh);
      }
    } else {
      for (let i = 0; i < bullets.length; i++) {
        bullets[i].draw(ctx);
      }
    }
  }

  /**
   * Draw collectible (foreground) stars with pulse animation & red variant support.
   *
   * Behavior:
   * - Uses pre‑rendered star or red star sprite if available, scaling with optional pulse modulation.
   * - Falls back to entity draw when sprites missing (test / minimal mode).
   *
   * @param {CanvasRenderingContext2D} ctx Target 2D context.
   * @param {any[]} stars Star entities.
   * @param {any} sprites Optional sprite atlas (may contain star/starRed).
   * @param {number} [timeSec] Absolute time (seconds) used for pulse phase.
   */
  static drawCollectibleStars(ctx, stars, sprites, timeSec = 0) {
    const starSpr = sprites && sprites.star;
    const starRedSpr = sprites && /** @type {any} */ (sprites).starRed;
    const base = sprites && sprites.starBaseSize;
    if (starSpr && base) {
      for (let i = 0; i < stars.length; i++) {
        const s = /** @type {any} */ (stars[i]);
        const baseSize = Math.max(1, Math.min(s.width, s.height));
        let dw = baseSize,
          dh = baseSize;
        const cx = s.x + s.width / 2;
        const cy = s.y + s.height / 2;
        const spr = s.isRed && starRedSpr ? starRedSpr : starSpr;
        ctx.drawImage(spr, 0, 0, base, base, cx - dw / 2, cy - dh / 2, dw, dh);
      }
    } else {
      for (let i = 0; i < stars.length; i++) {
        stars[i].draw(ctx, timeSec);
      }
    }
  }

  /**
   * Draw active explosion animations.
   * @param {CanvasRenderingContext2D} ctx 2D context.
   * @param {any[]} explosions Explosion entities.
   */
  static drawExplosions(ctx, explosions) {
    for (let i = 0; i < explosions.length; i++) {
      explosions[i].draw(ctx);
    }
  }

  /**
   * Draw transient particle effects (engine sparks, debris, etc.).
   *
   * State Reset:
   * - Ensures ctx.globalAlpha restored to 1 after iteration because particles may modify it.
   *
   * @param {CanvasRenderingContext2D} ctx 2D context.
   * @param {any[]} particles Particle entities.
   */
  static drawParticles(ctx, particles) {
    for (let i = 0; i < particles.length; i++) {
      particles[i].draw(ctx);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Composite the full frame respecting deterministic layering.
   *
   * Layer Order:
   *  1. Background (via game.drawBackground())
   *  2. Asteroids
   *  3. Bullets + collectible stars
   *  4. Explosions
   *  5. Particles
   *  6. Player ship
   *  7. Engine trail (after ship for glow overlap)
   *  8. Score popups (text overlays)
   *
   * Safety:
   * - Guards optional drawBackground / engineTrail presence.
   * - Removes expired score popups in-place (reverse iteration) to avoid skipping elements.
   *
   * @param {any} game Aggregate game object exposing ctx + entity arrays.
   */
  static draw(game) {
    if (typeof game.drawBackground === "function") {
      game.drawBackground();
    }
    RenderManager.drawAsteroids(game.ctx, game.asteroids);
    RenderManager.drawBullets(game.ctx, game.bullets, game.sprites);
    RenderManager.drawCollectibleStars(game.ctx, game.stars, game.sprites, game.timeSec);
    RenderManager.drawExplosions(game.ctx, game.explosions);
    RenderManager.drawParticles(game.ctx, game.particles);
    if (game.player && typeof game.player.draw === "function") {
      game.player.draw(game.ctx);
    }
    if (game.engineTrail && typeof game.engineTrail.draw === "function") {
      game.engineTrail.draw(game.ctx);
    }
    if (game.scorePopups && game.scorePopups.length > 0) {
      const ctx = game.ctx;
      for (let i = game.scorePopups.length - 1; i >= 0; i--) {
        const p = game.scorePopups[i];
        p.life += game._lastDtSec || 1 / 60;
        const t = p.life / p.maxLife;
        if (p.life >= p.maxLife) {
          game.scorePopups.splice(i, 1);
          continue;
        }
        ctx.save();
        const fontSize = p.fontSize || 18;
        const fontWeight = p.fontWeight || "700";
        ctx.font = `${fontWeight} ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const rise = -20 * t;
        ctx.globalAlpha = 1 - t;
        if (p.glow) {
          ctx.shadowColor = p.glowColor || p.color || "#fff";
          ctx.shadowBlur = p.glowBlur || 12;
        }
        if (p.stroke) {
          ctx.strokeStyle = p.stroke;
          ctx.lineWidth = Math.max(1, (fontSize / 14) | (0 + 1));
          ctx.strokeText(p.text, p.x, p.y + rise);
        }
        ctx.fillStyle = p.color || "#fff";
        ctx.fillText(p.text, p.x, p.y + rise);
        ctx.restore();
      }
    }
  }
}
