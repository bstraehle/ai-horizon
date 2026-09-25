/**
 * CollisionManager – spatial hash broad phase + AABB narrow phase for bullets, asteroids, player and stars.
 * Grid rebuilt each frame; arrays used for buckets are pooled to reduce GC churn.
 */
/** @typedef {import('../types.js').Rect} Rect */

/** @type {any[][]} */
const ARR_POOL = [];
const ARR_POOL_MAX = 256;

/** Per-frame marker property names (avoid re-creating string literals in the hot loop). */
const BULLET_FRAME_FLAG = "_cmDeadBulletFrame";
const AST_FRAME_FLAG = "_cmDeadAsteroidFrame";

/**
 * Return a rect view of an entity without allocating when it already carries x/width fields.
 * @param {any} obj
 * @returns {Rect}
 */
function resolveRect(obj) {
  if (obj && typeof obj.x === "number" && typeof obj.width === "number") return obj;
  return obj && typeof obj.getBounds === "function" ? obj.getBounds() : obj;
}

/**
 * Pack a grid cell coordinate into a single integer key.
 * @param {number} cx
 * @param {number} cy
 * @returns {number}
 */
function cellKey(cx, cy) {
  return ((cx & 0xffff) << 16) | (cy & 0xffff);
}

/**
 * Record bullet hits on hardened planets for accuracy statistics.
 * @param {{ hardenedAsteroidHitBullets?: number, bonusAsteroidHitBullets?: number }} game
 * @param {{ isBonus?: boolean }} asteroid
 */
function markHardenedHit(game, asteroid) {
  game.hardenedAsteroidHitBullets = (game.hardenedAsteroidHitBullets || 0) + 1;
  if (asteroid.isBonus) {
    game.bonusAsteroidHitBullets = (game.bonusAsteroidHitBullets || 0) + 1;
  }
}

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
 * @property {number} [bonusAsteroidHitBullets]
 */
/**
 * Centralises collision detection. Stateless aside from internal small array pool.
 */
export class CollisionManager {
  /** @private @type {any[]|undefined} */
  static _deadBullets;
  /** @private @type {any[]|undefined} */
  static _deadAsteroids;
  /** @private @type {number} */
  static _frameId = 0;
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
   * AABB overlap test (strict; touching edges do not overlap).
   * Objects exposing numeric `x`/`width` are read in place without allocating; `getBounds()` is
   * only consulted for objects that lack those fields.
   * @param {Rect | { getBounds: () => Rect }} rect1
   * @param {Rect | { getBounds: () => Rect }} rect2
   * @returns {boolean}
   */
  static intersects(rect1, rect2) {
    const a = resolveRect(rect1);
    const b = resolveRect(rect2);
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
    const frameId = ++this._frameId;
    if (!this._grid) {
      /** @type {Record<number, any[] | undefined>} */
      this._grid = Object.create(null);
      /** @type {number[]} */
      this._touched = [];
    }
    const grid = /** @type {Record<number, any[]|undefined>} */ (this._grid);
    const touched = /** @type {number[]} */ (this._touched);
    let touchedCount = 0;
    const cs = game.cellSize | 0;

    for (let idx = 0; idx < game.asteroids.length; idx++) {
      const a = game.asteroids[idx];
      const minCx = (a.x / cs) | 0;
      const minCy = (a.y / cs) | 0;
      const maxCx = ((a.x + a.width) / cs) | 0;
      const maxCy = ((a.y + a.height) / cs) | 0;
      for (let cy = minCy; cy <= maxCy; cy++) {
        for (let cx = minCx; cx <= maxCx; cx++) {
          const key = cellKey(cx, cy);
          let bucket = grid[key];
          if (!bucket) {
            bucket = CollisionManager._getArr();
            grid[key] = bucket;
            touched[touchedCount++] = key;
          }
          bucket.push(a);
        }
      }
    }

    /** @type {any[]} */
    if (!this._deadBullets) this._deadBullets = [];
    /** @type {any[]} */
    if (!this._deadAsteroids) this._deadAsteroids = [];
    /** @type {any[]} */
    const deadBullets = /** @type {any[]} */ (this._deadBullets);
    /** @type {any[]} */
    const deadAsteroids = /** @type {any[]} */ (this._deadAsteroids);
    deadBullets.length = 0;
    deadAsteroids.length = 0;

    const events = game.events;
    bulletLoop: for (let i = 0; i < game.bullets.length; i++) {
      const b = game.bullets[i];
      if (!b) continue;
      const minCx = (b.x / cs) | 0;
      const minCy = (b.y / cs) | 0;
      const maxCx = ((b.x + b.width) / cs) | 0;
      const maxCy = ((b.y + b.height) / cs) | 0;
      for (let cy = minCy; cy <= maxCy; cy++) {
        for (let cx = minCx; cx <= maxCx; cx++) {
          const bucket = grid[cellKey(cx, cy)];
          if (!bucket) continue;
          for (let k = 0; k < bucket.length; k++) {
            const a = bucket[k];
            if (a && a[AST_FRAME_FLAG] === frameId) continue;
            if (CollisionManager.intersects(b, a)) {
              if (b[BULLET_FRAME_FLAG] !== frameId) {
                b[BULLET_FRAME_FLAG] = frameId;
                deadBullets.push(b);
              }
              try {
                if (a && a.isHardened) {
                  if (typeof a.onBulletHit === "function") {
                    markHardenedHit(game, a);
                    const shouldDestroy = a.onBulletHit(game);
                    if (shouldDestroy && a[AST_FRAME_FLAG] !== frameId) {
                      a[AST_FRAME_FLAG] = frameId;
                      deadAsteroids.push(a);
                      if (events) events.emit("bulletHitAsteroid", { asteroid: a, bullet: b });
                    }
                  } else if (typeof a.onShieldHit === "function") {
                    markHardenedHit(game, a);
                    try {
                      a.onShieldHit();
                    } catch {
                      /* ignore */
                    }
                  }
                } else if (a && a[AST_FRAME_FLAG] !== frameId) {
                  a[AST_FRAME_FLAG] = frameId;
                  deadAsteroids.push(a);
                  if (events) events.emit("bulletHitAsteroid", { asteroid: a, bullet: b });
                }
              } catch {
                /* ignore asteroid collision processing errors */
              }
              continue bulletLoop;
            }
          }
        }
      }
    }

    if (deadBullets.length) {
      const arr = game.bullets;
      let w = 0;
      for (let r = 0, n = arr.length; r < n; r++) {
        const b = arr[r];
        if (b && b[BULLET_FRAME_FLAG] === frameId) {
          if (game.bulletPool) game.bulletPool.release(b);
          continue;
        }
        if (w !== r) arr[w] = b;
        w++;
      }
      if (w !== arr.length) arr.length = w;
      deadBullets.length = 0;
    }
    if (deadAsteroids.length) {
      const arrA = game.asteroids;
      let wA = 0;
      for (let r = 0, n = arrA.length; r < n; r++) {
        const a = arrA[r];
        if (a && a[AST_FRAME_FLAG] === frameId) {
          if (game.asteroidPool) game.asteroidPool.release(a);
          continue;
        }
        if (wA !== r) arrA[wA] = a;
        wA++;
      }
      if (wA !== arrA.length) arrA.length = wA;
      deadAsteroids.length = 0;
    }

    let playerHitAsteroid = null;
    for (let i = game.asteroids.length - 1; i >= 0; i--) {
      const asteroid = game.asteroids[i];
      if (CollisionManager.intersects(game.player, asteroid)) {
        playerHitAsteroid = asteroid;
        break;
      }
    }
    if (!playerHitAsteroid) {
      const stars = game.stars;
      let wS = 0;
      for (let r = 0, n = stars.length; r < n; r++) {
        const star = stars[r];
        if (CollisionManager.intersects(game.player, star)) {
          if (game.starPool) game.starPool.release(star);
          if (game.events) game.events.emit("collectedStar", { star });
          continue;
        }
        if (wS !== r) stars[wS] = star;
        wS++;
      }
      if (wS !== stars.length) stars.length = wS;
    }

    for (let i = 0; i < touchedCount; i++) {
      const key = touched[i];
      const bucket = grid[key];
      if (bucket) CollisionManager._releaseArr(bucket);
      grid[key] = undefined;
    }
    touched.length = 0;

    if (playerHitAsteroid && game.events) {
      game.events.emit("playerHitAsteroid", { asteroid: playerHitAsteroid });
      return;
    }
  }
}
