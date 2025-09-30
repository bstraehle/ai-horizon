import { CONFIG } from "../constants.js";

/**
 * SpriteManager – pre-renders bullet + trail and star variants to offscreen canvases (performance cache).
 * Returns a simple atlas; if context creation fails, canvases remain blank and runtime falls back to entity draws.
 */
export class SpriteManager {
  /**
   * Build sprite atlas (bullet + trail, star, red star). Pure function of CONFIG colors.
   * @returns {import('../types.js').SpriteAtlas}
   */
  static createSprites() {
    const trail = CONFIG.BULLET.TRAIL;
    const bw = CONFIG.BULLET.WIDTH;
    const bh = CONFIG.BULLET.HEIGHT + trail;
    const bulletCanvas = document.createElement("canvas");
    bulletCanvas.width = bw;
    bulletCanvas.height = bh;
    {
      const c = bulletCanvas.getContext("2d");
      if (c) {
        c.save();
        c.shadowColor = CONFIG.COLORS.BULLET.SHADOW;
        c.shadowBlur = 8;
        const grad = c.createLinearGradient(0, 0, 0, CONFIG.BULLET.HEIGHT);
        grad.addColorStop(0, CONFIG.COLORS.BULLET.GRAD_TOP);
        grad.addColorStop(0.5, CONFIG.COLORS.BULLET.GRAD_MID);
        grad.addColorStop(1, CONFIG.COLORS.BULLET.GRAD_BOTTOM);
        c.fillStyle = grad;
        c.fillRect(0, 0, bw, CONFIG.BULLET.HEIGHT);
        c.fillStyle = CONFIG.COLORS.BULLET.TRAIL;
        c.fillRect(0, CONFIG.BULLET.HEIGHT, bw, trail);
        c.restore();
      }
    }

    const starBaseSize = 64;
    const starCanvas = document.createElement("canvas");
    starCanvas.width = starBaseSize;
    starCanvas.height = starBaseSize;
    {
      const c = starCanvas.getContext("2d");
      if (!c) {
        /* intentionally empty */
      } else {
        const cx = starBaseSize / 2;
        const cy = starBaseSize / 2;
        const size = starBaseSize * 0.45;
        const grad = c.createRadialGradient(cx, cy, 0, cx, cy, size);
        grad.addColorStop(0, CONFIG.COLORS.STAR.GRAD_IN);
        grad.addColorStop(0.3, CONFIG.COLORS.STAR.GRAD_MID);
        grad.addColorStop(1, CONFIG.COLORS.STAR.GRAD_OUT);
        c.fillStyle = grad;
        c.beginPath();
        for (let i = 0; i < 5; i++) {
          const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
          const x1 = cx + size * Math.cos(angle);
          const y1 = cy + size * Math.sin(angle);
          if (i === 0) c.moveTo(x1, y1);
          else c.lineTo(x1, y1);
          const innerAngle = angle + Math.PI / 5;
          const x2 = cx + size * 0.4 * Math.cos(innerAngle);
          const y2 = cy + size * 0.4 * Math.sin(innerAngle);
          c.lineTo(x2, y2);
        }
        c.closePath();
        c.fill();
      }
    }

    const starRedCanvas = document.createElement("canvas");
    starRedCanvas.width = starBaseSize;
    starRedCanvas.height = starBaseSize;
    {
      const c = starRedCanvas.getContext("2d");
      if (!c) {
        /* intentionally empty */
      } else {
        const cx = starBaseSize / 2;
        const cy = starBaseSize / 2;
        const size = starBaseSize * 0.45;
        const grad = c.createRadialGradient(cx, cy, 0, cx, cy, size);
        grad.addColorStop(0, CONFIG.COLORS.STAR_RED.GRAD_IN);
        grad.addColorStop(0.3, CONFIG.COLORS.STAR_RED.GRAD_MID);
        grad.addColorStop(1, CONFIG.COLORS.STAR_RED.GRAD_OUT);
        c.fillStyle = grad;
        c.beginPath();
        for (let i = 0; i < 5; i++) {
          const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
          const x1 = cx + size * Math.cos(angle);
          const y1 = cy + size * Math.sin(angle);
          if (i === 0) c.moveTo(x1, y1);
          else c.lineTo(x1, y1);
          const innerAngle = angle + Math.PI / 5;
          const x2 = cx + size * 0.4 * Math.cos(innerAngle);
          const y2 = cy + size * 0.4 * Math.sin(innerAngle);
          c.lineTo(x2, y2);
        }
        c.closePath();
        c.fill();
      }
    }

    return {
      bullet: bulletCanvas,
      bulletTrail: trail,
      star: starCanvas,
      starRed: starRedCanvas,
      starBaseSize,
    };
  }
}
