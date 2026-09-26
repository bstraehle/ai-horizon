import { CONFIG } from "../constants.js";
import { BackgroundManager } from "./BackgroundManager.js";
import { ScorePopup } from "../entities/ScorePopup.js";
import { shakeOffset } from "../systems/ScreenShake.js";
import { isOnscreen } from "../utils/bounds.js";
import { prefersReducedMotion } from "../utils/motion.js";

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
 * @property {number} [_shakeT] Screen shake remaining seconds (see systems/ScreenShake.js)
 * @property {number} [_shakeDur]
 * @property {number} [_shakeMag]
 * @property {import('../entities/ScorePopup.js').ScorePopupData[]} [scorePopups]
 * @property {()=>void} [drawBackground]
 */
/**
 * RenderManager – stateless helpers enforcing deterministic back→front draw order.
 * Layer order: background, asteroids, bullets, collectible stars, explosions, particles, engine trail, player, score popups.
 * Bullets, explosions and particles are additive ("lighter") passes; the composite mode is set once
 * per pass, never per entity.
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
    const palette = BackgroundManager.getCurrentNebulaPalette();
    // Upgraded bolts take the run's accent colour (red / blue) like the bonus items.
    const sprUpgraded =
      sprites &&
      ((palette === "blue" && /** @type {any} */ (sprites).bulletUpgradedBlue) ||
        /** @type {any} */ (sprites).bulletUpgraded);
    const trail = (sprites && sprites.bulletTrail) || CONFIG.BULLET.TRAIL;
    const pad = (sprites && sprites.bulletPad) || 0;
    if (sprNormal) {
      // Bolts are additive so their glow brightens whatever they pass over.
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < bullets.length; i++) {
        const b = bullets[i];
        if (!isOnscreen(b, viewWidth, viewHeight, trail + pad)) continue;
        const useUp =
          /** @type {any} */ (b).style === "upgraded" && sprUpgraded ? sprUpgraded : sprNormal;
        const y = extrapolateSec > 0 ? b.y - b.speed * extrapolateSec : b.y;
        ctx.drawImage(useUp, b.x - pad, y - pad, b.width + pad * 2, b.height + trail + pad * 2);
      }
      ctx.globalCompositeOperation = "source-over";
    } else {
      for (let i = 0; i < bullets.length; i++) {
        const bullet = bullets[i];
        if (!isOnscreen(bullet, viewWidth, viewHeight, trail || 8)) continue;
        bullet.draw(ctx, extrapolateSec);
      }
    }
  }

  /**
   * Draw collectible stars (sprite or entity fallback). Stars breathe (scale pulse) and bonus
   * stars slowly rotate; both are render-only and skipped under prefers-reduced-motion.
   * @param {CanvasRenderingContext2D} ctx
   * @param {any[]} stars
   * @param {any} sprites
   * @param {number} [extrapolateSec=0]
   * @param {number} [viewWidth=Infinity]
   * @param {number} [viewHeight=Infinity]
   * @param {number} [timeSec=0] Animation clock (seconds) for the pulse / rotation.
   */
  static drawCollectibleStars(
    ctx,
    stars,
    sprites,
    extrapolateSec = 0,
    viewWidth = Infinity,
    viewHeight = Infinity,
    timeSec = 0
  ) {
    const starSpr = sprites && sprites.star;
    const starBlueSpr = sprites && /** @type {any} */ (sprites).starBlue;
    const starRedSpr = sprites && /** @type {any} */ (sprites).starRed;
    const palette = BackgroundManager.getCurrentNebulaPalette();
    const base = sprites && sprites.starBaseSize;
    const drawScale = (sprites && sprites.starDrawScale) || 1;
    const motion = !prefersReducedMotion();
    const t = timeSec + (extrapolateSec > 0 ? extrapolateSec : 0);
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
        const pulse = motion ? 1 + 0.07 * Math.sin(t * 5 + s.x * 0.05) : 1;
        const size = baseSize * drawScale * pulse;
        if (motion && s.isRed) {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(t * 1.1);
          ctx.drawImage(spr, 0, 0, base, base, -size / 2, -size / 2, size, size);
          ctx.restore();
          continue;
        }
        ctx.drawImage(spr, 0, 0, base, base, cx - size / 2, cy - size / 2, size, size);
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
    // Additive pass: overlapping blasts and the shockwave ring bloom rather than occlude.
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < explosions.length; i++) {
      const explosion = explosions[i];
      if (!isOnscreen(explosion, viewWidth, viewHeight, 96)) continue;
      explosion.draw(ctx);
    }
    ctx.globalCompositeOperation = "source-over";
  }

  /**
   * Draw particles (additive sparks) then restore globalAlpha / composite mode.
   * @param {CanvasRenderingContext2D} ctx
   * @param {any[]} particles
   * @param {number} viewWidth
   * @param {number} viewHeight
   * @param {number} [extrapolateSec=0]
   */
  static drawParticles(ctx, particles, viewWidth, viewHeight, extrapolateSec = 0) {
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      if (!isOnscreen(particle, viewWidth, viewHeight, 16)) continue;
      particle.draw(ctx, extrapolateSec);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  /**
   * Composite full frame in fixed order (background→asteroids→bullets→stars→explosions→particles→trail→player→score popups).
   * The engine trail is drawn beneath the ship so the exhaust glow sits behind the hull.
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
    const dtSec = game._frameDtSec || game._lastDtSec || 1 / 60;
    const ctx = game.ctx;

    // Camera jolt applies to the play layers only; the background stays put.
    const shake = shakeOffset(game, dtSec, SHAKE);
    const shaking = shake.x !== 0 || shake.y !== 0;
    if (shaking) {
      ctx.save();
      ctx.translate(shake.x, shake.y);
    }

    RenderManager.drawAsteroids(ctx, game.asteroids, viewWidth, viewHeight, t);
    RenderManager.drawBullets(ctx, game.bullets, game.sprites, viewWidth, viewHeight, t);
    RenderManager.drawCollectibleStars(
      ctx,
      game.stars,
      game.sprites,
      t,
      viewWidth,
      viewHeight,
      typeof game.timeSec === "number" ? game.timeSec : 0
    );
    RenderManager.drawExplosions(ctx, game.explosions, viewWidth, viewHeight);
    RenderManager.drawParticles(ctx, game.particles, viewWidth, viewHeight, t);
    if (game.engineTrail && typeof game.engineTrail.draw === "function") {
      game.engineTrail.draw(ctx, t);
    }
    if (game.player && typeof game.player.draw === "function") {
      game.player.draw(ctx, t, BackgroundManager.getCurrentNebulaPalette());
    }
    if (shaking) ctx.restore();

    if (game.scorePopups && game.scorePopups.length > 0) {
      const dpr = view && typeof view.dpr === "number" && view.dpr > 0 ? view.dpr : 1;
      ScorePopup.drawAll(ctx, game.scorePopups, dtSec, viewWidth, viewHeight, dpr);
    }
  }
}

/** Reused shake offset vector (render thread only). */
const SHAKE = { x: 0, y: 0 };
