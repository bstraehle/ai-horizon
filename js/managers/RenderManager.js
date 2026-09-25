import { CONFIG } from "../constants.js";
import { BackgroundManager } from "./BackgroundManager.js";
import { ScorePopup } from "../entities/ScorePopup.js";
import { isOnscreen } from "../utils/bounds.js";

/**
 * @typedef {Object} RenderGameContext
 * @property {CanvasRenderingContext2D} ctx
 * @property {{ width?:number, height?:number, dpr?:number }} [view] Logical (CSS pixel) viewport used for culling; dpr for crisp text sprites
 * @property {{ drawBackground?:()=>void }} [__bg]
 * @property {any[]} asteroids
 * @property {any[]} bullets
 * @property {any[]} stars
 * @property {any[]} explosions
 * @property {any[]} particles
 * @property {any} player
 * @property {any} engineTrail
 * @property {any} sprites
 * @property {number} timeSec
 * @property {number} [_lastDtSec]
 * @property {number} [_frameDtSec] Real frame delta (seconds) for render-side animations
 * @property {import('../entities/ScorePopup.js').ScorePopupData[]} [scorePopups]
 * @property {()=>void} [drawBackground]
 */
/**
 * RenderManager – stateless helpers enforcing deterministic back→front draw order.
 * Layer order: background, asteroids, bullets, collectible stars, explosions, particles, player, engine trail, score popups.
 *
 * Extrapolation: every entity pass accepts `extrapolateSec` (seconds past the last simulated
 * state, from GameLoop alpha). Linear motion is projected forward by that amount at draw time
 * only; simulation state is never touched, so seeded runs stay deterministic while 120 Hz+
 * displays receive smooth per-frame motion.
 *
 * Culling uses the logical viewport (`game.view`, CSS pixels) because entity coordinates live in
 * that space; the canvas backing store is scaled by DPR and would over-estimate the visible area.
 */
export class RenderManager {
  /**
   * Draw asteroids.
   * @param {CanvasRenderingContext2D} ctx
   * @param {any[]} asteroids
   * @param {number} viewWidth
   * @param {number} viewHeight
   * @param {number} [extrapolateSec=0]
   */
  static drawAsteroids(ctx, asteroids, viewWidth, viewHeight, extrapolateSec = 0) {
    for (let i = 0; i < asteroids.length; i++) {
      const asteroid = asteroids[i];
      if (!isOnscreen(asteroid, viewWidth, viewHeight, 32)) continue;
      asteroid.draw(ctx, extrapolateSec);
    }
  }

  /**
   * Draw bullets (+ trail) via sprite atlas if present; fallback to per-entity draw.
   * @param {CanvasRenderingContext2D} ctx
   * @param {any[]} bullets
   * @param {any} sprites
   * @param {number} viewWidth
   * @param {number} viewHeight
   * @param {number} [extrapolateSec=0]
   */
  static drawBullets(ctx, bullets, sprites, viewWidth, viewHeight, extrapolateSec = 0) {
    const sprNormal = sprites && sprites.bullet;
    const sprUpgraded = sprites && /** @type {any} */ (sprites).bulletUpgraded;
    const trail = (sprites && sprites.bulletTrail) || CONFIG.BULLET.TRAIL;
    if (sprNormal) {
      for (let i = 0; i < bullets.length; i++) {
        const b = bullets[i];
        if (!isOnscreen(b, viewWidth, viewHeight, trail || 8)) continue;
        const dh = b.height + trail;
        const useUp =
          /** @type {any} */ (b).style === "upgraded" && sprUpgraded ? sprUpgraded : sprNormal;
        const sw = useUp.width;
        const sh = useUp.height;
        const y = extrapolateSec > 0 ? b.y - b.speed * extrapolateSec : b.y;
        ctx.drawImage(useUp, 0, 0, sw, sh, b.x, y, b.width, dh);
      }
    } else {
      for (let i = 0; i < bullets.length; i++) {
        const bullet = bullets[i];
        if (!isOnscreen(bullet, viewWidth, viewHeight, trail || 8)) continue;
        bullet.draw(ctx, extrapolateSec);
      }
    }
  }

  /**
   * Draw collectible stars (sprite or entity fallback).
   * @param {CanvasRenderingContext2D} ctx
   * @param {any[]} stars
   * @param {any} sprites
   * @param {number} [extrapolateSec=0]
   * @param {number} [viewWidth=Infinity]
   * @param {number} [viewHeight=Infinity]
   */
  static drawCollectibleStars(
    ctx,
    stars,
    sprites,
    extrapolateSec = 0,
    viewWidth = Infinity,
    viewHeight = Infinity
  ) {
    const starSpr = sprites && sprites.star;
    const starBlueSpr = sprites && /** @type {any} */ (sprites).starBlue;
    const starRedSpr = sprites && /** @type {any} */ (sprites).starRed;
    const palette = BackgroundManager.getCurrentNebulaPalette();
    const base = sprites && sprites.starBaseSize;
    if (starSpr && base) {
      for (let i = 0; i < stars.length; i++) {
        const s = /** @type {any} */ (stars[i]);
        if (!isOnscreen(s, viewWidth, viewHeight, base || 0)) continue;
        const baseSize = Math.max(1, Math.min(s.width, s.height));
        const cx = s.x + s.width / 2;
        const cy = s.y + s.height / 2 + (extrapolateSec > 0 ? s.speed * extrapolateSec : 0);
        let spr = starSpr;
        if (s.isRed) {
          if (palette === "blue" && starBlueSpr) spr = starBlueSpr;
          else if (starRedSpr) spr = starRedSpr;
        }
        ctx.drawImage(
          spr,
          0,
          0,
          base,
          base,
          cx - baseSize / 2,
          cy - baseSize / 2,
          baseSize,
          baseSize
        );
      }
    } else {
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        if (!isOnscreen(star, viewWidth, viewHeight, 24)) continue;
        star.draw(ctx, extrapolateSec);
      }
    }
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {any[]} explosions
   * @param {number} viewWidth
   * @param {number} viewHeight
   */
  static drawExplosions(ctx, explosions, viewWidth, viewHeight) {
    for (let i = 0; i < explosions.length; i++) {
      const explosion = explosions[i];
      if (!isOnscreen(explosion, viewWidth, viewHeight, 48)) continue;
      explosion.draw(ctx);
    }
  }

  /**
   * Draw particles then restore globalAlpha.
   * @param {CanvasRenderingContext2D} ctx
   * @param {any[]} particles
   * @param {number} viewWidth
   * @param {number} viewHeight
   * @param {number} [extrapolateSec=0]
   */
  static drawParticles(ctx, particles, viewWidth, viewHeight, extrapolateSec = 0) {
    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      if (!isOnscreen(particle, viewWidth, viewHeight, 16)) continue;
      particle.draw(ctx, extrapolateSec);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Composite full frame in fixed order (background→asteroids→bullets→stars→explosions→particles→player→trail→score popups).
   * Score popups are advanced, culled and drawn by ScorePopup.drawAll (pre-rendered text sprites).
   * @param {RenderGameContext} game
   * @param {number} [extrapolateSec=0] Seconds past the last simulated state to project linear motion.
   */
  static draw(game, extrapolateSec = 0) {
    if (typeof game.drawBackground === "function") {
      game.drawBackground();
    }
    const view = game.view;
    const viewWidth =
      view && typeof view.width === "number" && view.width > 0 ? view.width : Infinity;
    const viewHeight =
      view && typeof view.height === "number" && view.height > 0 ? view.height : Infinity;
    const t = extrapolateSec > 0 ? extrapolateSec : 0;

    RenderManager.drawAsteroids(game.ctx, game.asteroids, viewWidth, viewHeight, t);
    RenderManager.drawBullets(game.ctx, game.bullets, game.sprites, viewWidth, viewHeight, t);
    RenderManager.drawCollectibleStars(
      game.ctx,
      game.stars,
      game.sprites,
      t,
      viewWidth,
      viewHeight
    );
    RenderManager.drawExplosions(game.ctx, game.explosions, viewWidth, viewHeight);
    RenderManager.drawParticles(game.ctx, game.particles, viewWidth, viewHeight, t);
    if (game.player && typeof game.player.draw === "function") {
      game.player.draw(game.ctx, t);
    }
    if (game.engineTrail && typeof game.engineTrail.draw === "function") {
      game.engineTrail.draw(game.ctx, t);
    }
    if (game.scorePopups && game.scorePopups.length > 0) {
      const dtSec = game._frameDtSec || game._lastDtSec || 1 / 60;
      const dpr = view && typeof view.dpr === "number" && view.dpr > 0 ? view.dpr : 1;
      ScorePopup.drawAll(game.ctx, game.scorePopups, dtSec, viewWidth, viewHeight, dpr);
    }
  }
}
