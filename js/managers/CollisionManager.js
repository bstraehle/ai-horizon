/** @typedef {import('../types.js').Rect} Rect */

// Module-scoped array pool to reduce GC churn for spatial grid buckets
/** @type {any[][]} */
const ARR_POOL = [];

/**
 * @typedef {Object} BulletHitAsteroidPayload
 * @property {{ x:number,y:number,width:number,height:number, getBounds?:()=>Rect }} asteroid
 * @property {{ x:number,y:number,width:number,height:number, getBounds?:()=>Rect }} bullet
 */

/**
 * @typedef {Object} PlayerHitAsteroidPayload
 * @property {{ x:number,y:number,width:number,height:number, getBounds?:()=>Rect }} asteroid
 */

/**
 * @typedef {Object} CollectedStarPayload
 * @property {{ x:number,y:number,width:number,height:number, getBounds?:()=>Rect }} star
 */

/**
 * CollisionManager centralizes all collision detection and resolution.
 * It operates on the passed `game` instance to avoid broad refactors.
 */
export class CollisionManager {
  /** Get an empty array from the pool (or a new one).
   * @returns {any[]}
   * @private
   */
  static _getArr() {
    return ARR_POOL.length > 0 ? ARR_POOL.pop() : [];
  }

  /** Return an array to the pool after clearing it.
   * @param {any[]} arr
   * @returns {void}
   * @private
   */
  static _releaseArr(arr) {
    arr.length = 0;
    ARR_POOL.push(arr);
  }
  /**
   * Axis-aligned bounding box collision detection (strict AABB).
   * Accepts either raw rects or objects exposing getBounds().
   * @param {Rect | { getBounds: () => Rect }} rect1
   * @param {Rect | { getBounds: () => Rect }} rect2
   * @returns {boolean}
   */
  static intersects(rect1, rect2) {
    /** @type {Rect} */
    const a = /** @type {any} */ (
      rect1 &&
      typeof rect1 === "object" &&
      "getBounds" in rect1 &&
      typeof (/** @type {any} */ (rect1).getBounds) === "function"
        ? /** @type {any} */ (/** @type {any} */ (rect1).getBounds())
        : rect1
    );
    /** @type {Rect} */
    const b = /** @type {any} */ (
      rect2 &&
      typeof rect2 === "object" &&
      "getBounds" in rect2 &&
      typeof (/** @type {any} */ (rect2).getBounds) === "function"
        ? /** @type {any} */ (/** @type {any} */ (rect2).getBounds())
        : rect2
    );
    return (
      a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
    );
  }

  /**
   * Perform all collision checks and trigger events/removals.
   * @param {import('../types.js').CollisionGameSlice} game - The game instance slice.
   * @returns {void}
   */
  static check(game) {
    // Spatial hash grid maps cell keys ("cx,cy") to arrays of asteroids for fast neighborhood queries.
    /** @type {Map<string, any[]>} */
    const grid = new Map();
    const cs = game.cellSize | 0;
    /** Put an asteroid into the grid cell (cx, cy). */
    const put = (ax, ay, a) => {
      const key = ax + "," + ay;
      let arr = grid.get(key);
      if (!arr) {
        arr = CollisionManager._getArr();
        grid.set(key, arr);
      }
      arr.push(a);
    };

    for (let idx = 0; idx < game.asteroids.length; idx++) {
      const a = game.asteroids[idx];
      const minCx = Math.floor(a.x / cs);
      const minCy = Math.floor(a.y / cs);
      const maxCx = Math.floor((a.x + a.width) / cs);
      const maxCy = Math.floor((a.y + a.height) / cs);
      for (let cy = minCy; cy <= maxCy; cy++) {
        for (let cx = minCx; cx <= maxCx; cx++) {
          put(cx, cy, a);
        }
      }
    }

    /** @type {Set<any>} */
    const toRemoveBullets = new Set();
    /** @type {Set<any>} */
    const toRemoveAsteroids = new Set();

    /**
     * Collect grid buckets overlapping the query rect and return them as an array of arrays.
     * The returned outer array is pooled; call _releaseArr on it when done.
     * @param {number} x
     * @param {number} y
     * @param {number} w
     * @param {number} h
     * @returns {any[][]}
     */
    const neighbors = (x, y, w, h) => {
      /** @type {any[]} */
      const res = CollisionManager._getArr();
      const minCx = Math.floor(x / cs);
      const minCy = Math.floor(y / cs);
      const maxCx = Math.floor((x + w) / cs);
      const maxCy = Math.floor((y + h) / cs);
      for (let cy = minCy; cy <= maxCy; cy++) {
        for (let cx = minCx; cx <= maxCx; cx++) {
          const key = cx + "," + cy;
          const arr = grid.get(key);
          if (arr) res.push(arr);
        }
      }
      return res;
    };

    // Bullet vs Asteroid collisions via grid
    for (let i = 0; i < game.bullets.length; i++) {
      const b = game.bullets[i];
      if (!b) continue;
      const groups = neighbors(b.x, b.y, b.width, b.height);
      let hit = false;
      for (let g = 0; g < groups.length && !hit; g++) {
        const group = groups[g];
        for (let k = 0; k < group.length; k++) {
          const a = group[k];
          if (toRemoveAsteroids.has(a)) continue;
          if (CollisionManager.intersects(b, a)) {
            toRemoveBullets.add(b);
            toRemoveAsteroids.add(a);
            if (game.events) game.events.emit("bulletHitAsteroid", { asteroid: a, bullet: b });
            hit = true;
            break;
          }
        }
      }
      // release temporary neighbors array container
      CollisionManager._releaseArr(groups);
    }

    // Remove marked bullets and asteroids
    if (toRemoveBullets.size > 0) {
      for (let i = game.bullets.length - 1; i >= 0; i--) {
        const b = game.bullets[i];
        if (toRemoveBullets.has(b)) {
          game.bullets.splice(i, 1);
          if (game.bulletPool) game.bulletPool.release(b);
        }
      }
    }
    if (toRemoveAsteroids.size > 0) {
      for (let i = game.asteroids.length - 1; i >= 0; i--) {
        if (toRemoveAsteroids.has(game.asteroids[i])) {
          const a = game.asteroids.splice(i, 1)[0];
          if (game.asteroidPool) game.asteroidPool.release(a);
        }
      }
    }

    // Player vs Asteroid collisions
    for (let i = game.asteroids.length - 1; i >= 0; i--) {
      const asteroid = game.asteroids[i];
      if (CollisionManager.intersects(game.player, asteroid)) {
        if (game.events) game.events.emit("playerHitAsteroid", { asteroid });
        return;
      }
    }

    // Player vs Star collisions
    for (let i = game.stars.length - 1; i >= 0; i--) {
      const star = game.stars[i];
      if (CollisionManager.intersects(game.player, star)) {
        const s = game.stars.splice(i, 1)[0];
        if (game.starPool) game.starPool.release(s);
        if (game.events) game.events.emit("collectedStar", { star });
      }
    }

    // Score UI updates are handled by EventBus subscribers

    // Release all grid arrays back into the pool
    if (grid.size > 0) {
      for (const arr of grid.values()) CollisionManager._releaseArr(arr);
      grid.clear();
    }
  }
}
