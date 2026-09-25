import { CONFIG } from "../constants.js";
import { Bullet } from "../entities/Bullet.js";
import { Star } from "../entities/Star.js";
import { Explosion } from "../entities/Explosion.js";
import { EngineTrail } from "../entities/EngineTrail.js";
import { Nebula } from "../entities/Nebula.js";
import { Particle } from "../entities/Particle.js";

/** Transparent margin around the bullet bolt so its glow is not clipped. */
const BULLET_PAD = 8;
/** Star atlas canvas size and the star's outer radius inside it (rest is glow). */
const STAR_CANVAS = 96;
const STAR_RADIUS = 27;

/**
 * SpriteManager – pre-renders bullet bolts and collectible star variants to offscreen canvases
 * (performance cache). Returns a simple atlas; if context creation fails, canvases remain blank and
 * runtime falls back to entity draws.
 *
 * Atlas geometry contract (consumed by RenderManager):
 *  - `bullet` / `bulletUpgraded`: (WIDTH + 2·bulletPad) × (HEIGHT + TRAIL + 2·bulletPad); the bolt
 *    core occupies the centre column, glow fills the padding → draw at (x - pad, y - pad).
 *  - `star*`: STAR_CANVAS square whose star spans 2·STAR_RADIUS; `starDrawScale` converts a
 *    star's logical size into the canvas draw size so the glyph matches the hitbox and the glow
 *    extends beyond it.
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
    const starCanvas = SpriteManager._renderStar(CONFIG.COLORS.STAR);
    const starRedCanvas = SpriteManager._renderStar(CONFIG.COLORS.STAR_RED);
    const starBlueCanvas = SpriteManager._renderStar(CONFIG.COLORS.STAR_BLUE);

    const atlas = {
      bullet: bulletCanvas,
      bulletUpgraded: bulletUpCanvas,
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
   * Laser bolt: white-hot capsule core with a coloured halo and a fading tail.
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
    const r = bw / 2;
    c.save();
    // Tail: fades out below the core.
    const tail = c.createLinearGradient(0, y + bh * 0.6, 0, y + bh + trail);
    tail.addColorStop(0, palette.TRAIL);
    tail.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = tail;
    c.fillRect(x + bw * 0.2, y + bh * 0.6, bw * 0.6, bh * 0.4 + trail);
    // Core capsule with glow.
    c.shadowColor = palette.SHADOW;
    c.shadowBlur = BULLET_PAD;
    const grad = c.createLinearGradient(0, y, 0, y + bh);
    grad.addColorStop(0, palette.GRAD_TOP);
    grad.addColorStop(0.45, palette.GRAD_MID);
    grad.addColorStop(1, palette.GRAD_BOTTOM);
    c.fillStyle = grad;
    c.beginPath();
    c.moveTo(x, y + r);
    c.arc(x + r, y + r, r, Math.PI, 0);
    c.lineTo(x + bw, y + bh - r);
    c.arc(x + r, y + bh - r, r, 0, Math.PI);
    c.closePath();
    c.fill();
    c.fill();
    // Hot centre line.
    c.shadowBlur = 0;
    c.fillStyle = "rgba(255,255,255,0.9)";
    c.fillRect(x + bw / 2 - 0.5, y + r, 1, bh - r * 2);
    c.restore();
    return canvas;
  }

  /**
   * Collectible star: soft outer glow, gradient body, bright core highlight.
   * @param {{ GRAD_IN:string, GRAD_MID:string, GRAD_OUT:string, GLOW?:string, BASE:string }} palette
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
    // Halo.
    const halo = c.createRadialGradient(cx, cy, size * 0.3, cx, cy, STAR_CANVAS / 2);
    halo.addColorStop(0, glow);
    halo.addColorStop(0.55, glow.replace(/[\d.]+\)$/, "0.14)"));
    halo.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = halo;
    c.fillRect(0, 0, STAR_CANVAS, STAR_CANVAS);
    // Body.
    const grad = c.createRadialGradient(cx, cy, 0, cx, cy, size);
    grad.addColorStop(0, palette.GRAD_IN);
    grad.addColorStop(0.45, palette.GRAD_MID);
    grad.addColorStop(1, palette.GRAD_OUT);
    c.fillStyle = grad;
    c.shadowColor = glow;
    c.shadowBlur = 10;
    SpriteManager._traceStar(c, cx, cy, size, size * 0.46);
    c.fill();
    c.shadowBlur = 0;
    c.lineJoin = "round";
    c.strokeStyle = "rgba(255,255,255,0.55)";
    c.lineWidth = 1.2;
    c.stroke();
    // Core sparkle.
    const core = c.createRadialGradient(cx, cy - size * 0.1, 0, cx, cy - size * 0.1, size * 0.5);
    core.addColorStop(0, "rgba(255,255,255,0.95)");
    core.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = core;
    c.beginPath();
    c.arc(cx, cy - size * 0.1, size * 0.5, 0, Math.PI * 2);
    c.fill();
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
