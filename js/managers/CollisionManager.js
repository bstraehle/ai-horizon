/**
 * CollisionManager – spatial hash broad phase + AABB narrow phase for bullets, asteroids, player and stars.
 * Grid rebuilt each frame; arrays used for buckets are pooled to reduce GC churn.
 */
/** @typedef {import('../types.js').Rect} Rect */

/** @type {any[][]} */
const ARR_POOL = [];
const ARR_POOL_MAX = 256;

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
 * @typedef {Object} CollisionEvents
 * @property {(event:string,payload:any)=>void} emit
 */
/**
 * @typedef {Object} CollisionPools
 * @property {{ release:(o:any)=>void }} [bulletPool]
 * @property {{ release:(o:any)=>void }} [asteroidPool]
 * @property {{ release:(o:any)=>void }} [starPool]
 */
/**
 * @typedef {Object} CollisionGameSlice
 * @property {number} cellSize
 * @property {any[]} bullets
 * @property {any[]} asteroids
 * @property {any[]} stars
 * @property {any} player
 * @property {CollisionEvents} [events]
 * @property {CollisionPools['bulletPool']} [bulletPool]
 * @property {CollisionPools['asteroidPool']} [asteroidPool]
 * @property {CollisionPools['starPool']} [starPool]
 * @property {number} [hardenedAsteroidHitBullets]
 */
/**
 * Centralises collision detection. Stateless aside from internal small array pool.
 */
export class CollisionManager {
  /**
   * Borrow an empty pooled array (length reset); caller must release via _releaseArr.
   * @returns {any[]}
   * @private
   */
  static _getArr() {
    const arr = ARR_POOL.length > 0 ? ARR_POOL.pop() : undefined;
    return arr !== undefined ? arr : [];
  }

  /**
   * Return pooled array (cleared). Silently drops if capacity reached.
   * @param {any[]} arr
   * @private
   */
  static _releaseArr(arr) {
    arr.length = 0;
    if (ARR_POOL.length < ARR_POOL_MAX) {
      ARR_POOL.push(arr);
    }
  }
  /**
   * AABB overlap test; supports objects with getBounds().
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
   * Run collision pipeline for current frame. Emits events (if present):
   *  - bulletHitAsteroid { asteroid, bullet }
   *  - playerHitAsteroid { asteroid }
   *  - collectedStar { star }
   * Early exit after player hit. Cleans up and returns pooled arrays.
   * @param {CollisionGameSlice} game
   */
  static check(game) {
    /** @type {Map<string, any[]>} */
    const grid = new Map();
    const cs = game.cellSize | 0;
    /** @param {number} ax @param {number} ay @param {any} a */
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

    /** @param {number} x @param {number} y @param {number} w @param {number} h @returns {any[][]} */
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

    /** @param {any} a @param {any} b */
    const emitBulletHit = (a, b) => {
      if (game.events) game.events.emit("bulletHitAsteroid", { asteroid: a, bullet: b });
    };

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
            try {
              if (a && a.isIndestructible) {
                if (typeof a.onBulletHit === "function") {
                  try {
                    game.hardenedAsteroidHitBullets = (game.hardenedAsteroidHitBullets || 0) + 1;
                  } catch {
                    /* ignore stat update errors */
                  }
                  const shouldDestroy = a.onBulletHit(game);
                  if (shouldDestroy) {
                    toRemoveAsteroids.add(a);
                    emitBulletHit(a, b);
                  }
                } else if (typeof a.onShieldHit === "function") {
                  try {
                    game.hardenedAsteroidHitBullets = (game.hardenedAsteroidHitBullets || 0) + 1;
                  } catch {
                    /* ignore stat update errors */
                  }
                  try {
                    a.onShieldHit();
                  } catch {
                    /* ignore shield side-effect errors */
                  }
                }
              } else {
                toRemoveAsteroids.add(a);
                emitBulletHit(a, b);
              }
            } catch {
              /* ignore asteroid collision processing errors to avoid breaking loop */
            }
            hit = true;
            break;
          }
        }
      }
      CollisionManager._releaseArr(groups);
    }

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

    for (let i = game.asteroids.length - 1; i >= 0; i--) {
      const asteroid = game.asteroids[i];
      if (CollisionManager.intersects(game.player, asteroid)) {
        if (game.events) game.events.emit("playerHitAsteroid", { asteroid });
        return;
      }
    }

    for (let i = game.stars.length - 1; i >= 0; i--) {
      const star = game.stars[i];
      if (CollisionManager.intersects(game.player, star)) {
        const s = game.stars.splice(i, 1)[0];
        if (game.starPool) game.starPool.release(s);
        if (game.events) game.events.emit("collectedStar", { star });
      }
    }

    if (grid.size > 0) {
      for (const arr of grid.values()) CollisionManager._releaseArr(arr);
      grid.clear();
    }
  }
}
