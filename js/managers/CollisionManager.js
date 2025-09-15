/**
 * CollisionManager – spatial hashing + narrow‑phase resolution for arcade entities.
 *
 * Responsibilities:
 * - Maintain an ephemeral uniform grid (built each tick) to reduce bullet→asteroid checks.
 * - Perform bullet↔asteroid, player↔asteroid, and player↔star collision tests.
 * - Emit typed EventBus events instead of performing score / FX side effects inline.
 * - Recycle small arrays via a capped pool to minimize transient GC pressure.
 *
 * Performance & algorithmic notes:
 * - Broad phase complexity: O(A * C) where C is average covered cells (typically 1–4 given asteroid sizes).
 * - Narrow phase for bullets: only tests buckets intersecting bullet bounds vs naive O(B*A).
 * - Degenerate case (all asteroids in one cell) collapses to O(B*A) but remains correct.
 * - Early abort after player–asteroid hit (game over path) avoids wasted work during lethal frames.
 *
 * Design trade‑offs:
 * - Chose a uniform grid over quad/oct trees: simpler implementation, good cache locality at current entity counts.
 * - Duck typed `intersects` accepts either raw rects or objects exposing `getBounds()` to avoid per-frame boxing.
 * - Array pooling bounded by ARR_POOL_MAX to prevent unbounded memory growth during stress cases.
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
 * CollisionManager centralizes all collision detection and resolution.
 * It operates on the passed `game` instance to avoid broad refactors.
 */
export class CollisionManager {
  /**
   * Acquire an empty array from the module‑scoped pool (or create a new one).
   *
   * Rationale:
   * - Spatial hash construction and neighborhood queries allocate many short‑lived arrays per frame.
   * - Pooling avoids GC churn / minor collection pauses at high bullet + asteroid counts.
   *
   * Contract:
   * - Returned array MUST be released via `_releaseArr` after use.
   * - Contents are unspecified (array is always length=0 on return).
   *
   * @returns {any[]} Reusable empty array.
   * @private
   */
  static _getArr() {
    const arr = ARR_POOL.length > 0 ? ARR_POOL.pop() : undefined;
    return arr !== undefined ? arr : [];
  }

  /**
   * Return an array to the pool after clearing it (length reset only – elements eligible for GC).
   *
   * Pool Limits:
   * - Pool is capped at ARR_POOL_MAX to prevent unbounded memory growth during stress tests.
   *
   * Safety:
   * - Idempotent for arrays already length=0.
   * - Caller MUST NOT use the array after release (treated as borrowed resource).
   *
   * @param {any[]} arr Borrowed array previously obtained via `_getArr`.
   * @returns {void}
   * @private
   */
  static _releaseArr(arr) {
    arr.length = 0;
    if (ARR_POOL.length < ARR_POOL_MAX) {
      ARR_POOL.push(arr);
    }
  }
  /**
   * Axis‑aligned bounding box intersection test (strict AABB) with duck typing.
   *
   * Behavior:
   * - If an object exposes `getBounds():Rect`, that value is used; otherwise the object itself is assumed Rect‑like.
   * - No allocations: all work is scalar comparisons.
   *
   * @param {Rect | { getBounds: () => Rect }} rect1 First rectangle or bounds provider.
   * @param {Rect | { getBounds: () => Rect }} rect2 Second rectangle or bounds provider.
   * @returns {boolean} True if rectangles overlap (non‑separated on both axes).
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
   * Perform all collision detection phases for the current frame.
   *
   * Phases:
   * 1. Build spatial hash grid of asteroids (broad phase acceleration structure).
   * 2. Bullet→Asteroid tests using neighborhood lookup via grid buckets.
   * 3. Player→Asteroid early‑exit lethal check.
   * 4. Player→Star collection pass.
   * 5. Cleanup: recycle temporary arrays / grid buckets back into pool.
   *
   * Events Emitted (if game.events present):
   * - 'bulletHitAsteroid' { asteroid, bullet }
   * - 'playerHitAsteroid' { asteroid }
   * - 'collectedStar' { star }
   *
   * Object Pool Interactions:
   * - Releases consumed bullets/asteroids/stars back into their respective pools when removed.
   *
   * Complexity:
   * - Building grid: O(A * C) where C is average cell coverage (1–4 typical).
   * - Bullet queries: O(B * (C + M)) where M is avg asteroids in queried buckets (small under uniform distribution).
   * - Worst case (all in one cell): O(B*A) but rare and still fast at tested scales.
   *
   * Safety / Edge Cases:
   * - Guards against null bullet entries.
   * - Indestructible asteroids may invoke custom onBulletHit/onShieldHit handlers controlling destruction.
   * - Early return after player death prevents unnecessary star checks.
   *
   * @param {import('../types.js').CollisionGameSlice} game Game slice containing entities & pools.
   * @returns {void}
   */
  static check(game) {
    /** @type {Map<string, any[]>} */
    const grid = new Map();
    const cs = game.cellSize | 0;
    /**
     * Put an asteroid into the grid cell (cx, cy).
     * @param {number} ax
     * @param {number} ay
     * @param {any} a
     */
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

    /**
     * Emit bulletHitAsteroid event.
     * @param {{ x:number,y:number,width:number,height:number,isIndestructible?:boolean,onBulletHit?:(game:any)=>boolean,onShieldHit?:()=>void }} a
     * @param {{ x:number,y:number,width:number,height:number }} b
     */
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
                  const shouldDestroy = a.onBulletHit(game);
                  if (shouldDestroy) {
                    toRemoveAsteroids.add(a);
                    emitBulletHit(a, b);
                  }
                } else if (typeof a.onShieldHit === "function") {
                  try {
                    a.onShieldHit();
                  } catch {
                    /* intentionally empty */
                  }
                } else {
                  /* intentionally empty */
                }
              } else {
                toRemoveAsteroids.add(a);
                emitBulletHit(a, b);
              }
            } catch {
              /* intentionally empty */
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
