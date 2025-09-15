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
   * @param {CanvasRenderingContext2D} ctx
   * @param {any[]} asteroids
   */
  static drawAsteroids(ctx, asteroids) {
    for (let i = 0; i < asteroids.length; i++) {
      asteroids[i].draw(ctx);
    }
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {any[]} bullets
   * @param {any} sprites
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
   * @param {CanvasRenderingContext2D} ctx
   * @param {any[]} stars
   * @param {any} sprites
   * @param {number} [timeSec]
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
        if (CONFIG.STAR.PULSE) {
          const amp = CONFIG.STAR.PULSE_AMPLITUDE;
          const speedHz = CONFIG.STAR.PULSE_SPEED;
          const pulse = Math.sin(timeSec * speedHz * CONFIG.TWO_PI) * amp + (1 - amp);
          dw = baseSize * pulse;
          dh = baseSize * pulse;
        }
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
   * @param {CanvasRenderingContext2D} ctx
   * @param {any[]} explosions
   */
  static drawExplosions(ctx, explosions) {
    for (let i = 0; i < explosions.length; i++) {
      explosions[i].draw(ctx);
    }
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {any[]} particles
   */
  static drawParticles(ctx, particles) {
    for (let i = 0; i < particles.length; i++) {
      particles[i].draw(ctx);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Draw the entire game frame in the correct order.
   * @param {any} game
   */
  static draw(game) {
    // Background
    if (typeof game.drawBackground === "function") {
      game.drawBackground();
    }
    // Entities
    RenderManager.drawAsteroids(game.ctx, game.asteroids);
    RenderManager.drawBullets(game.ctx, game.bullets, game.sprites);
    RenderManager.drawCollectibleStars(game.ctx, game.stars, game.sprites, game.timeSec);
    RenderManager.drawExplosions(game.ctx, game.explosions);
    RenderManager.drawParticles(game.ctx, game.particles);
    // Player + engine trail
    if (game.player && typeof game.player.draw === "function") {
      game.player.draw(game.ctx);
    }
    if (game.engineTrail && typeof game.engineTrail.draw === "function") {
      game.engineTrail.draw(game.ctx);
    }
    // Score popups (transient text)
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
