import { CONFIG } from "../constants.js";

/**
 * SpriteManager – pre-renders frequently used vector effects to offscreen canvases.
 *
 * Goals / Benefits:
 * - Reduce per-frame draw cost by caching complex gradients & paths (bullet + trail, stars, red stars).
 * - Avoid redundant path construction & gradient setup inside tight render loops.
 * - Provide a simple atlas object consumed by `RenderManager` for conditional sprite usage.
 *
 * Fallback Behavior:
 * - In non-DOM or test environments where 2D context creation fails, methods silently skip drawing
 *   and the caller will fall back to entity-level draw routines.
 */
export class SpriteManager {
  /**
   * Pre-render frequently used sprites to offscreen canvases to reduce per-frame draw cost.
   * @returns {import('../types.js').SpriteAtlas}
   */
  static createSprites() {
    // Bullet sprite (includes trail)
    const trail = CONFIG.BULLET.TRAIL;
    const bw = CONFIG.BULLET.WIDTH;
    const bh = CONFIG.BULLET.HEIGHT + trail;
    const bulletCanvas = document.createElement("canvas");
    bulletCanvas.width = bw;
    bulletCanvas.height = bh;
    {
      const c = bulletCanvas.getContext("2d");
      if (c) {
        // Glow shadow
        c.save();
        c.shadowColor = CONFIG.COLORS.BULLET.SHADOW;
        c.shadowBlur = 8;
        // Main bullet body gradient
        const grad = c.createLinearGradient(0, 0, 0, CONFIG.BULLET.HEIGHT);
        grad.addColorStop(0, CONFIG.COLORS.BULLET.GRAD_TOP);
        grad.addColorStop(0.5, CONFIG.COLORS.BULLET.GRAD_MID);
        grad.addColorStop(1, CONFIG.COLORS.BULLET.GRAD_BOTTOM);
        c.fillStyle = grad;
        c.fillRect(0, 0, bw, CONFIG.BULLET.HEIGHT);
        // Trail
        c.fillStyle = CONFIG.COLORS.BULLET.TRAIL;
        c.fillRect(0, CONFIG.BULLET.HEIGHT, bw, trail);
        c.restore();
      }
    }

    // Star sprite (square) - yellow
    const starBaseSize = 64;
    const starCanvas = document.createElement("canvas");
    starCanvas.width = starBaseSize;
    starCanvas.height = starBaseSize;
    {
      const c = starCanvas.getContext("2d");
      if (!c) {
        // If context unavailable (e.g., non-DOM test env), skip drawing
      } else {
        const cx = starBaseSize / 2;
        const cy = starBaseSize / 2;
        const size = starBaseSize * 0.45;
        // Outer glow via radial gradient
        const grad = c.createRadialGradient(cx, cy, 0, cx, cy, size);
        grad.addColorStop(0, CONFIG.COLORS.STAR.GRAD_IN);
        grad.addColorStop(0.3, CONFIG.COLORS.STAR.GRAD_MID);
        grad.addColorStop(1, CONFIG.COLORS.STAR.GRAD_OUT);
        c.fillStyle = grad;
        // Draw 5-point star path
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

    // Red star sprite
    const starRedCanvas = document.createElement("canvas");
    starRedCanvas.width = starBaseSize;
    starRedCanvas.height = starBaseSize;
    {
      const c = starRedCanvas.getContext("2d");
      if (!c) {
        // skip if no ctx
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
