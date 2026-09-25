/**
 * Autopilot – opt-in (`?autoplay=1`) scripted pilot for reproducible profiling runs.
 *
 * Contract:
 *  - Reads entity positions and writes ONLY `game.input` (pointer target + fireHeld), exactly like
 *    a human moving the mouse with the button held. Simulation code is untouched, so a run with a
 *    fixed `?seed` is reproducible frame-for-frame while the pilot is deterministic.
 *  - Holds the player's current row, steers toward the nearest collectible star, side-steps
 *    asteroids that will reach the row within `lookaheadSec`, and never routes under a threat on
 *    the way to a target.
 *  - Allocation-free per tick (fixed-size threat buffer) so it does not perturb GC measurements.
 */

/** Maximum simultaneous asteroid threats considered per tick. */
const MAX_THREATS = 64;

export class Autopilot {
  /**
   * @param {{ lookaheadSec?: number, marginFactor?: number }} [opts]
   *  lookaheadSec: asteroids reaching the player's row sooner than this are treated as threats.
   *  marginFactor: lateral safety margin around a threat, as a multiple of player width.
   */
  constructor(opts = {}) {
    this._lookaheadSec = typeof opts.lookaheadSec === "number" ? opts.lookaheadSec : 1.4;
    this._marginFactor = typeof opts.marginFactor === "number" ? opts.marginFactor : 0.9;
    /** @private Blocked x-intervals as [left0, right0, left1, right1, ...]. */
    this._blocked = new Float64Array(MAX_THREATS * 2);
  }

  /**
   * Drive input for one simulation tick. No-op unless the game is running.
   * @param {{ state:{ isRunning:()=>boolean }, player:{x:number,y:number,width:number,height:number}, view:{width:number,height:number}, asteroids:{x:number,y:number,width:number,height:number,speed:number}[], stars:{x:number,y:number,width:number,height:number}[], input:{ mouse:{x:number,y:number}, fireHeld:boolean } }} game
   */
  step(game) {
    if (!game.state || !game.state.isRunning()) return;
    const player = game.player;
    const halfW = player.width / 2;
    const centerX = player.x + halfW;
    const rowTop = player.y;
    const rowBottom = player.y + player.height;
    const margin = player.width * this._marginFactor;

    const threats = this._collectThreats(game.asteroids, rowTop, rowBottom, margin);
    const minX = halfW;
    const maxX = Math.max(minX, game.view.width - halfW);
    let target = clamp(this._nearestStarX(game.stars, rowBottom, centerX), minX, maxX);
    if (this._isBlocked(centerX, threats) || this._isBlocked(target, threats)) {
      target = this._nearestSafeX(centerX, threats, minX, maxX);
    } else {
      target = this._clampPath(centerX, target, threats);
    }

    game.input.mouse.x = Math.max(1, target);
    game.input.mouse.y = Math.max(1, rowTop + player.height / 2);
    game.input.fireHeld = true;
  }

  /**
   * Fill the blocked-interval buffer with asteroids that overlap or will soon reach the row.
   * @param {{x:number,y:number,width:number,height:number,speed:number}[]} asteroids
   * @param {number} rowTop
   * @param {number} rowBottom
   * @param {number} margin
   * @returns {number} Number of threats written.
   * @private
   */
  _collectThreats(asteroids, rowTop, rowBottom, margin) {
    const blocked = this._blocked;
    let n = 0;
    for (let i = 0; i < asteroids.length && n < MAX_THREATS; i++) {
      const a = asteroids[i];
      if (a.y > rowBottom) continue;
      const gap = rowTop - (a.y + a.height);
      const speed = a.speed > 0 ? a.speed : 1;
      if (gap > 0 && gap / speed > this._lookaheadSec) continue;
      blocked[n * 2] = a.x - margin;
      blocked[n * 2 + 1] = a.x + a.width + margin;
      n++;
    }
    return n;
  }

  /**
   * Center x of the star closest (vertically) above the row, or the fallback when none.
   * @param {{x:number,y:number,width:number,height:number}[]} stars
   * @param {number} rowBottom
   * @param {number} fallbackX
   * @returns {number}
   * @private
   */
  _nearestStarX(stars, rowBottom, fallbackX) {
    let bestGap = Infinity;
    let x = fallbackX;
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const bottom = s.y + s.height;
      if (bottom > rowBottom) continue;
      const gap = rowBottom - bottom;
      if (gap < bestGap) {
        bestGap = gap;
        x = s.x + s.width / 2;
      }
    }
    return x;
  }

  /**
   * @param {number} x
   * @param {number} threats
   * @returns {boolean}
   * @private
   */
  _isBlocked(x, threats) {
    const blocked = this._blocked;
    for (let i = 0; i < threats; i++) {
      if (x >= blocked[i * 2] && x <= blocked[i * 2 + 1]) return true;
    }
    return false;
  }

  /**
   * Shorten a move so the path from `fromX` to `target` never crosses a blocked interval: the
   * pilot stops just outside the first threat it would otherwise pass under.
   * @param {number} fromX
   * @param {number} target
   * @param {number} threats
   * @returns {number}
   * @private
   */
  _clampPath(fromX, target, threats) {
    const blocked = this._blocked;
    let limit = target;
    for (let i = 0; i < threats; i++) {
      const left = blocked[i * 2];
      const right = blocked[i * 2 + 1];
      if (target > fromX && left > fromX && left < limit) limit = left - 1;
      else if (target < fromX && right < fromX && right > limit) limit = right + 1;
    }
    return limit;
  }

  /**
   * Closest unblocked x to `fromX` among interval edges and view bounds; `fromX` when none exists.
   * @param {number} fromX
   * @param {number} threats
   * @param {number} minX
   * @param {number} maxX
   * @returns {number}
   * @private
   */
  _nearestSafeX(fromX, threats, minX, maxX) {
    const blocked = this._blocked;
    let best = fromX;
    let bestDist = Infinity;
    const candidates = threats * 2 + 2;
    for (let k = 0; k < candidates; k++) {
      let c;
      if (k === 0) c = minX;
      else if (k === 1) c = maxX;
      else {
        const idx = k - 2;
        c = idx % 2 === 0 ? blocked[idx] - 1 : blocked[idx] + 1;
      }
      if (c < minX || c > maxX || this._isBlocked(c, threats)) continue;
      const d = Math.abs(c - fromX);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return best;
  }
}

/** @param {number} v @param {number} min @param {number} max */
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
