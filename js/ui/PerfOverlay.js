import { CONFIG } from "../constants.js";
import { Bullet } from "../entities/Bullet.js";
import { EngineTrail } from "../entities/EngineTrail.js";
import { Explosion } from "../entities/Explosion.js";
import { Nebula } from "../entities/Nebula.js";
import { Particle } from "../entities/Particle.js";
import { Player } from "../entities/Player.js";
import { Star } from "../entities/Star.js";
import { StarField } from "../entities/StarField.js";

/**
 * @typedef {Object} PerfOverlayMetrics
 * @property {number} frameDt Raw RAF delta (ms)
 * @property {number} updateMs Time spent in fixed updates (ms)
 * @property {number} drawMs Time spent in draw (ms)
 * @property {number} now RAF timestamp (ms)
 */

/**
 * @typedef {Object} PerfSummary
 * @property {number} frames Frames recorded this session
 * @property {number} seconds Wall-clock seconds covered by the recorded frames
 * @property {number} fps Average frames per second over the session
 * @property {{ avg:number, p95:number, max:number }} frameMs Frame-to-frame delta statistics
 * @property {{ avg:number, p95:number, max:number }} updateMs Fixed-update CPU statistics
 * @property {{ avg:number, p95:number, max:number }} drawMs Draw CPU statistics
 * @property {number} hitches Frames whose delta exceeded 1.5x the fixed step
 * @property {number} overBudget Frames whose update+draw CPU time exceeded the fixed step
 * @property {Record<string, number>} spriteCaches Static sprite cache sizes by entity
 * @property {number|null} heapMB Chrome-only JS heap usage (null elsewhere)
 */

/** Maximum frames retained for whole-session percentile statistics (~5.5 min at 60 Hz). */
const SESSION_CAP = 20000;

/**
 * PerfOverlay – opt-in (`?debug=perf`) frame diagnostics for profiling sessions.
 *
 * Responsibilities:
 *  - Record per-frame GameLoop metrics (frame delta, update CPU ms, draw CPU ms) in O(1).
 *  - Show a low-frequency DOM readout (default 4 Hz) of rolling averages / p95s, entity and pool
 *    counts, sprite cache sizes, adaptive performance level, and backing-store resolution.
 *  - Produce a whole-session summary (`summary()` / `logSummary()`) for before/after comparisons.
 *
 * Design notes:
 *  - Readout is a DOM element rather than canvas text so the overlay does not inflate `drawMs`.
 *  - Only `textContent` is written (CSP `require-trusted-types-for 'script'` safe).
 *  - Draw timings cover main-thread work only; GPU rasterization is asynchronous and not captured.
 *  - Never constructed unless the URL flag is present, so production sessions pay nothing.
 */
export class PerfOverlay {
  /**
   * @param {any} game Game instance (read-only access to collections, pools, view, level).
   * @param {{ element?: { textContent: string }, refreshMs?: number, windowSize?: number, stepMs?: number, now?: () => number }} [opts]
   *  element: injectable readout target (tests); created and appended to body when omitted.
   */
  constructor(game, opts = {}) {
    this._game = game;
    this._stepMs = opts.stepMs || CONFIG.TIME.STEP_MS;
    this._refreshMs = opts.refreshMs || 250;
    const windowSize = Math.max(8, opts.windowSize || 120);
    /** @private */ this._frame = new Float32Array(windowSize);
    /** @private */ this._update = new Float32Array(windowSize);
    /** @private */ this._draw = new Float32Array(windowSize);
    /** @private */ this._scratch = new Float32Array(windowSize);
    /** @private */ this._w = 0;
    /** @private */ this._count = 0;

    /** @private */ this._sessionFrame = new Float32Array(SESSION_CAP);
    /** @private */ this._sessionUpdate = new Float32Array(SESSION_CAP);
    /** @private */ this._sessionDraw = new Float32Array(SESSION_CAP);
    /** @private */ this._frames = 0;
    /** @private */ this._hitches = 0;
    /** @private */ this._overBudget = 0;
    /** @private */ this._firstNow = 0;
    /** @private */ this._lastNow = 0;
    /** @private */ this._lastRefresh = 0;

    /** @private */ this._el = opts.element || PerfOverlay._createElement();
  }

  /**
   * Record one frame. O(1); safe to call from the GameLoop metrics hook every frame.
   * Triggers a readout refresh at most once per `refreshMs`.
   * @param {PerfOverlayMetrics} m
   */
  record(m) {
    if (!m || !Number.isFinite(m.frameDt) || m.frameDt <= 0) return;
    const i = this._w;
    this._frame[i] = m.frameDt;
    this._update[i] = m.updateMs;
    this._draw[i] = m.drawMs;
    this._w = (i + 1) % this._frame.length;
    if (this._count < this._frame.length) this._count++;

    if (this._frames < SESSION_CAP) {
      this._sessionFrame[this._frames] = m.frameDt;
      this._sessionUpdate[this._frames] = m.updateMs;
      this._sessionDraw[this._frames] = m.drawMs;
    }
    if (this._frames === 0) this._firstNow = m.now;
    this._lastNow = m.now;
    this._frames++;
    if (m.frameDt > this._stepMs * 1.5) this._hitches++;
    if (m.updateMs + m.drawMs > this._stepMs) this._overBudget++;

    if (m.now - this._lastRefresh >= this._refreshMs) {
      this._lastRefresh = m.now;
      this.refresh();
    }
  }

  /** Rebuild the readout text from the rolling window and current game state. */
  refresh() {
    const n = this._count;
    if (n === 0) return;
    const frame = this._stats(this._frame, n);
    const update = this._stats(this._update, n);
    const draw = this._stats(this._draw, n);
    const fps = frame.avg > 0 ? 1000 / frame.avg : 0;
    const g = this._game;
    const caches = PerfOverlay.spriteCacheSizes(g);
    const heap = PerfOverlay.heapMB();
    const lines = [
      `fps ${fps.toFixed(1)} | frame ${frame.avg.toFixed(1)} avg ${frame.p95.toFixed(1)} p95 ms | hitch ${this._hitches} over ${this._overBudget}`,
      `update ${update.avg.toFixed(2)} avg ${update.p95.toFixed(2)} p95 | draw ${draw.avg.toFixed(2)} avg ${draw.p95.toFixed(2)} p95 ms`,
      `ast ${len(g.asteroids)} bul ${len(g.bullets)} star ${len(g.stars)} exp ${len(g.explosions)} part ${len(g.particles)} trail ${len(g.engineTrail && g.engineTrail.particles)} pop ${len(g.scorePopups)}`,
      `pool free: bul ${free(g.bulletPool)} ast ${free(g.asteroidPool)} star ${free(g.starPool)} part ${free(g.particlePool)} exp ${free(g.explosionPool)}`,
      `sprites: ${Object.entries(caches)
        .map(([k, v]) => `${k} ${v}`)
        .join(" ")}`,
      `lvl ${g._performanceLevel ?? 0} dpr ${(g.view && g.view.dpr ? g.view.dpr : 1).toFixed(2)} canvas ${g.canvas ? `${g.canvas.width}x${g.canvas.height}` : "?"}${heap === null ? "" : ` | heap ${heap.toFixed(1)} MB`}`,
    ];
    this._el.textContent = lines.join("\n");
  }

  /**
   * Whole-session statistics (all frames since construction, capped at SESSION_CAP).
   * @returns {PerfSummary}
   */
  summary() {
    const n = Math.min(this._frames, SESSION_CAP);
    const seconds = this._frames > 1 ? (this._lastNow - this._firstNow) / 1000 : 0;
    return {
      frames: this._frames,
      seconds: round(seconds, 1),
      fps: seconds > 0 ? round((this._frames - 1) / seconds, 1) : 0,
      frameMs: this._statsRounded(this._sessionFrame, n),
      updateMs: this._statsRounded(this._sessionUpdate, n),
      drawMs: this._statsRounded(this._sessionDraw, n),
      hitches: this._hitches,
      overBudget: this._overBudget,
      spriteCaches: PerfOverlay.spriteCacheSizes(this._game),
      heapMB: PerfOverlay.heapMB(),
    };
  }

  /** Print the session summary to the console (one JSON line for easy copy/paste). */
  logSummary() {
    if (typeof console !== "undefined" && console.info) {
      console.info("[Perf] session summary", JSON.stringify(this.summary()));
    }
  }

  /** Remove the readout element from the document. */
  dispose() {
    const el = /** @type {any} */ (this._el);
    if (el && typeof el.remove === "function") el.remove();
  }

  /**
   * Sizes of the static sprite caches plus live asteroid surface sprites (per-instance).
   * @param {any} game
   * @returns {Record<string, number>}
   */
  static spriteCacheSizes(game) {
    let asteroidSprites = 0;
    const asteroids = game && Array.isArray(game.asteroids) ? game.asteroids : [];
    for (let i = 0; i < asteroids.length; i++) if (asteroids[i]._surfaceSprite) asteroidSprites++;
    return {
      part: size(Particle._spriteCache),
      ast: asteroidSprites,
      sf: size(StarField._spriteCache),
      trail: size(EngineTrail._spriteCache),
      exp: size(Explosion._spriteCache),
      neb: size(Nebula._spriteCache),
      star: size(Star._spriteCache),
      bul: size(Bullet._spriteCache),
      ship: size(Player._spriteCache),
    };
  }

  /**
   * Chrome-only heap usage in MB; null when the non-standard API is unavailable.
   * @returns {number|null}
   */
  static heapMB() {
    const mem =
      typeof performance !== "undefined" ? /** @type {any} */ (performance).memory : undefined;
    return mem && Number.isFinite(mem.usedJSHeapSize) ? mem.usedJSHeapSize / (1024 * 1024) : null;
  }

  /**
   * avg / p95 / max over the first n entries of buf (uses the shared scratch buffer for sorting).
   * @param {Float32Array} buf
   * @param {number} n
   * @returns {{ avg:number, p95:number, max:number }}
   * @private
   */
  _stats(buf, n) {
    if (n <= 0) return { avg: 0, p95: 0, max: 0 };
    const scratch = n <= this._scratch.length ? this._scratch.subarray(0, n) : new Float32Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      scratch[i] = buf[i];
      sum += buf[i];
    }
    scratch.sort();
    const p95Index = Math.min(n - 1, Math.floor(n * 0.95));
    return { avg: sum / n, p95: scratch[p95Index], max: scratch[n - 1] };
  }

  /**
   * @param {Float32Array} buf
   * @param {number} n
   * @returns {{ avg:number, p95:number, max:number }}
   * @private
   */
  _statsRounded(buf, n) {
    const s = this._stats(buf, n);
    return { avg: round(s.avg, 2), p95: round(s.p95, 2), max: round(s.max, 2) };
  }

  /**
   * Create and attach the readout element (no-op stub outside a DOM environment).
   * @returns {{ textContent: string }}
   * @private
   */
  static _createElement() {
    if (typeof document === "undefined" || !document.body) return { textContent: "" };
    const el = document.createElement("pre");
    el.className = "perf-overlay";
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
    return el;
  }
}

/** @param {any[]|undefined|null} arr */
function len(arr) {
  return Array.isArray(arr) ? arr.length : 0;
}

/** @param {{ freeCount?: number }|undefined|null} pool */
function free(pool) {
  return pool && typeof pool.freeCount === "number" ? pool.freeCount : 0;
}

/** @param {{ size:number }|undefined|null} map */
function size(map) {
  return map && typeof map.size === "number" ? map.size : 0;
}

/** @param {number} v @param {number} digits */
function round(v, digits) {
  const f = Math.pow(10, digits);
  return Math.round(v * f) / f;
}
