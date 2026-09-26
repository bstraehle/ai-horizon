import { CONFIG } from "../constants.js";
import { Bullet } from "../entities/Bullet.js";
import { Star } from "../entities/Star.js";
import { Explosion } from "../entities/Explosion.js";
import { EngineTrail } from "../entities/EngineTrail.js";
import { Nebula } from "../entities/Nebula.js";
import { Particle } from "../entities/Particle.js";

/** Transparent margin around the bullet bolt so its soft edge is not clipped. */
const BULLET_PAD = 4;
/** Star atlas canvas size and the star's outer radius inside it (rest is a faint soft edge). */
const STAR_CANVAS = 96;
const STAR_RADIUS = 34;

/**
 * SpriteManager – pre-renders bullet bolts (white; red / blue when upgraded) and collectible star variants to offscreen canvases
 * (performance cache). Returns a simple atlas; if context creation fails, canvases remain blank and
 * runtime falls back to entity draws.
 *
 * Atlas geometry contract (consumed by RenderManager):
 *  - `bullet` / `bulletUpgraded`: (WIDTH + 2·bulletPad) × (HEIGHT + TRAIL + 2·bulletPad); the bolt
 *    core occupies the centre column, the soft edge fills the padding → draw at (x - pad, y - pad).
 *  - `star*`: STAR_CANVAS square whose star spans 2·STAR_RADIUS; `starDrawScale` converts a
 *    star's logical size into the canvas draw size so the glyph matches the hitbox and the glow
 *    keeps a small margin around it.
 */
export class SpriteManager {
  /**
   * Build sprite atlas (bullet + upgraded bullet, gold / red / blue stars). Pure function of CONFIG colors.
   * @returns {import('../types.js').SpriteAtlas}
   */
  static createSprites() {
    const trail = CONFIG.BULLET.TRAIL;
    const bulletCanvas = SpriteManager._renderBullet(CONFIG.COLORS.BULLET, trail);
    const bulletUpCanvas = SpriteManager._renderBullet(
      CONFIG.COLORS.BULLET_UPGRADED || CONFIG.COLORS.BULLET,
      trail
    );
    const bulletUpBlueCanvas = SpriteManager._renderBullet(
      CONFIG.COLORS.BULLET_UPGRADED_BLUE || CONFIG.COLORS.BULLET_UPGRADED || CONFIG.COLORS.BULLET,
      trail
    );
    const starCanvas = SpriteManager._renderStar(CONFIG.COLORS.STAR);
    const starRedCanvas = SpriteManager._renderStar(CONFIG.COLORS.STAR_RED);
    const starBlueCanvas = SpriteManager._renderStar(CONFIG.COLORS.STAR_BLUE);

    const atlas = {
      bullet: bulletCanvas,
      bulletUpgraded: bulletUpCanvas,
      bulletUpgradedBlue: bulletUpBlueCanvas,
      bulletTrail: trail,
      bulletPad: BULLET_PAD,
      star: starCanvas,
      starBlue: starBlueCanvas,
      starRed: starRedCanvas,
      starBaseSize: STAR_CANVAS,
      starDrawScale: STAR_CANVAS / (STAR_RADIUS * 2),
    };

    if (typeof Bullet.preloadSprites === "function") Bullet.preloadSprites();
    if (typeof Star.preloadSprites === "function") Star.preloadSprites([STAR_CANVAS]);
    if (typeof Explosion.preloadSprites === "function") Explosion.preloadSprites();
    if (typeof EngineTrail.preloadSprites === "function") EngineTrail.preloadSprites();
    if (typeof Nebula.preloadSprites === "function") Nebula.preloadSprites();
    if (typeof Particle.preloadSprites === "function") Particle.preloadSprites();

    return atlas;
  }

  /**
   * Laser bolt: a thin flat capsule with a short fading tail.
   * @param {{ GRAD_TOP:string, GRAD_MID:string, GRAD_BOTTOM:string, SHADOW:string, TRAIL:string }} palette
   * @param {number} trail Tail length (px).
   * @returns {HTMLCanvasElement}
   * @private
   */
  static _renderBullet(palette, trail) {
    const bw = CONFIG.BULLET.WIDTH;
    const bh = CONFIG.BULLET.HEIGHT;
    const canvas = document.createElement("canvas");
    canvas.width = bw + BULLET_PAD * 2;
    canvas.height = bh + trail + BULLET_PAD * 2;
    const c = canvas.getContext("2d");
    if (!c) return canvas;
    const x = BULLET_PAD;
    const y = BULLET_PAD;
    const coreW = Math.max(2, bw * 0.5);
    const cx = x + bw / 2;
    c.save();
    // Tail: a thinner line fading out below the core.
    const tail = c.createLinearGradient(0, y + bh * 0.7, 0, y + bh + trail);
    tail.addColorStop(0, palette.TRAIL);
    tail.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = tail;
    c.fillRect(cx - coreW * 0.35, y + bh * 0.7, coreW * 0.7, bh * 0.3 + trail);
    // Core: crisp thin capsule with a barely-there soft edge.
    c.shadowColor = palette.SHADOW;
    c.shadowBlur = 3;
    c.fillStyle = palette.GRAD_MID;
    c.beginPath();
    c.moveTo(cx - coreW / 2, y + coreW / 2);
    c.arc(cx, y + coreW / 2, coreW / 2, Math.PI, 0);
    c.lineTo(cx + coreW / 2, y + bh - coreW / 2);
    c.arc(cx, y + bh - coreW / 2, coreW / 2, 0, Math.PI);
    c.closePath();
    c.fill();
    c.restore();
    return canvas;
  }

  /**
   * Collectible star: flat two-tone body with a thin outline and a faint soft edge.
   * @param {{ GRAD_IN:string, GRAD_MID:string, GRAD_OUT:string, GLOW?:string, BASE:string, OUTLINE?:string }} palette
   * @returns {HTMLCanvasElement}
   * @private
   */
  static _renderStar(palette) {
    const canvas = document.createElement("canvas");
    canvas.width = STAR_CANVAS;
    canvas.height = STAR_CANVAS;
    const c = canvas.getContext("2d");
    if (!c) return canvas;
    const cx = STAR_CANVAS / 2;
    const cy = STAR_CANVAS / 2;
    const size = STAR_RADIUS;
    const glow = palette.GLOW || palette.BASE;
    c.save();
    // Flat body with a faint soft edge so the pickup still separates from dark backgrounds.
    c.shadowColor = glow;
    c.shadowBlur = 8;
    c.fillStyle = palette.GRAD_MID || palette.BASE;
    SpriteManager._traceStar(c, cx, cy, size, size * 0.45);
    c.fill();
    c.shadowBlur = 0;
    // Hard shadow facet on the right half (two-tone), then a thin dark outline.
    c.save();
    c.clip();
    c.fillStyle = palette.GRAD_OUT;
    c.fillRect(cx + size * 0.04, 0, STAR_CANVAS, STAR_CANVAS);
    c.restore();
    c.lineJoin = "round";
    c.strokeStyle = palette.OUTLINE || "rgba(0,0,0,0.85)";
    c.lineWidth = 2;
    SpriteManager._traceStar(c, cx, cy, size, size * 0.45);
    c.stroke();
    c.restore();
    return canvas;
  }

  /**
   * Begin a five-point star path centred on (cx, cy).
   * @param {CanvasRenderingContext2D} c
   * @param {number} cx
   * @param {number} cy
   * @param {number} outer
   * @param {number} inner
   * @private
   */
  static _traceStar(c, cx, cy, outer, inner) {
    c.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
      const x1 = cx + outer * Math.cos(angle);
      const y1 = cy + outer * Math.sin(angle);
      if (i === 0) c.moveTo(x1, y1);
      else c.lineTo(x1, y1);
      const innerAngle = angle + Math.PI / 5;
      c.lineTo(cx + inner * Math.cos(innerAngle), cy + inner * Math.sin(innerAngle));
    }
    c.closePath();
  }
}
