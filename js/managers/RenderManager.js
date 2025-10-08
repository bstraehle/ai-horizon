import { CONFIG } from "../constants.js";

/**
 * @typedef {Object} RenderGameContext
 * @property {CanvasRenderingContext2D} ctx
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
 * @property {{text:string,x:number,y:number,life:number,maxLife:number,fontSize?:number,fontWeight?:string,glow?:boolean,glowColor?:string,glowBlur?:number,color?:string,stroke?:string}[]} [scorePopups]
 * @property {()=>void} [drawBackground]
 */
/**
 * RenderManager – stateless helpers enforcing deterministic back→front draw order.
 * Layer order: background, asteroids, bullets, collectible stars, explosions, particles, player, engine trail, score popups.
 */
export class RenderManager {
  /**
   * Draw asteroids.
   * @param {CanvasRenderingContext2D} ctx
   * @param {any[]} asteroids
   */
  static drawAsteroids(ctx, asteroids) {
    for (let i = 0; i < asteroids.length; i++) {
      asteroids[i].draw(ctx);
    }
  }

  /**
   * Draw bullets (+ trail) via sprite atlas if present; fallback to per-entity draw.
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
   * Draw collectible stars (sprite or entity fallback).
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

  /** Draw explosions. @param {CanvasRenderingContext2D} ctx @param {any[]} explosions */
  static drawExplosions(ctx, explosions) {
    for (let i = 0; i < explosions.length; i++) {
      explosions[i].draw(ctx);
    }
  }

  /**
   * Draw particles then restore globalAlpha.
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
   * Composite full frame in fixed order (background→asteroids→bullets→stars→explosions→particles→player→trail→score popups).
   * Removes expired score popups in-place.
   * @param {RenderGameContext} game
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
      const arr = game.scorePopups;
      const ctx = game.ctx;
      const dtSec = game._lastDtSec || 1 / 60;
      let w = 0;
      for (let r = 0, n = arr.length; r < n; r++) {
        const p = arr[r];
        p.life += dtSec;
        if (p.life >= p.maxLife) {
          continue;
        }
        const t = p.life / p.maxLife;
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
        arr[w++] = p;
      }
      if (w !== arr.length) arr.length = w;
    }
  }
}
