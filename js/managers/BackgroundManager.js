import { CONFIG } from "../constants.js";
import { Background } from "../entities/Background.js";
import { Nebula } from "../entities/Nebula.js";
import { StarField } from "../entities/StarField.js";
/** @typedef {import('../types.js').RNGLike} RNGLike */

/**
 * BackgroundManager – initializes & renders multi-layer parallax background elements.
 *
 * Layers managed:
 * - Gradient backdrop (delegated to `Background`).
 * - Procedural nebula blobs (animated wobble + slow drift) – optional on initial menu.
 * - Star field (single or layered, depending on CONFIG.STARFIELD.LAYERS).
 *
 * Key responsibilities:
 * - Provide pure static functions so callers can feed in a lightweight context snapshot (`getGameContext`).
 * - Handle proportional resize of previously generated nebula / star data to avoid abrupt visual jumps.
 * - Keep initialization deterministic when an RNG is supplied (enables seeded replays & stable tests).
 */
export class BackgroundManager {
  /**
   * Initialize background components (nebula + star field) using a lightweight
   * GameContext snapshot. Deterministic when an RNG is provided.
   *
   * Responsibilities / Behavior:
   * - Conditionally generate nebula configs only when the game is already in a running state.
   *   (On initial menu we skip heavy nebula generation; they appear once gameplay begins.)
   * - Always (re)create the star field data structure via `StarField.init` which returns either
   *   an array (legacy mode) or a layered object depending on CONFIG.STARFIELD.LAYERS.
   * - Accept an injected RNG so seeded test harnesses can verify layout deterministically.
   *
   * Performance Notes:
   * - Nebula initialization can be moderately expensive (random blob geometry & wobble seeds);
   *   deferring creation until needed avoids cost during non-interactive screens.
   * - Star field generation is lightweight but still benefits from pooling where internal
   *   entity constructors avoid per-frame allocations later.
   *
   * Side Effects:
   * - Pure: does not mutate the passed ctxObj; returns a new background state object.
   *
   * Failure Modes:
   * - Any exception inside Nebula/StarField init surfaces upward (not caught here) so calling
   *   code can decide whether to fallback or crash early.
   *
   * @param {{ view:{width:number,height:number}, running:boolean, isMobile:boolean, isLowPower?:boolean, starfieldScale?:number, rng?: RNGLike }} ctxObj Context-like object; minimal projection of GameContext.
   * @returns {{ nebulaConfigs?: any, starField: any }} New background state to assign onto the main context.
   */
  static init(ctxObj) {
    const {
      view: { width, height },
      running,
      isMobile,
      isLowPower,
      starfieldScale,
      rng,
    } = ctxObj;
    const mobileHint = isMobile || !!isLowPower;
    const scale = typeof starfieldScale === "number" ? starfieldScale : 1;
    const state = {};
    if (running) {
      state.nebulaConfigs = Nebula.init(width, height, mobileHint, rng);
    }
    state.starField = StarField.init(width, height, rng, mobileHint, scale);
    return state;
  }

  /**
   * Produce resized background state given new view dimensions while attempting
   * to preserve relative spatial distribution of nebula blobs and star field points.
   *
   * Behavior:
   * - If prior background state missing, returns null (caller can treat as no-op).
   * - Each sub-layer delegates proportional coordinate/radius scaling to its own resize helper.
   * - On individual layer resize failure (defensive try/catch), falls back to previous layer data
   *   to avoid visual popping or null references.
   *
   * Performance:
   * - Scaling is O(N) over each layer's element count (nebula blobs + star count). Performed only
   *   during resize events which are infrequent vs frame updates.
   *
   * Side Effects:
   * - Pure relative to inputs: original background object is not mutated; a shallow new object is returned.
   *
   * @param {{ view:{width:number,height:number}, running:boolean, isMobile:boolean, rng?: RNGLike, background?:{nebulaConfigs?:any, starField:any} }} ctxObj Context containing current view + existing background.
   * @param {{width:number,height:number}} prevView Previous view dimensions (before resize) used for proportional scaling.
   * @returns {{ nebulaConfigs?: any, starField?: any } | null} Resized background state or null if insufficient data.
   */
  static resize(ctxObj, prevView) {
    const { view, background } = ctxObj;
    if (!view || !prevView) return null;
    const prevW = prevView.width || 0;
    const prevH = prevView.height || 0;
    const newW = view.width || 0;
    const newH = view.height || 0;
    if (!background) return null;
    const out = {};
    if (background.nebulaConfigs) {
      try {
        out.nebulaConfigs = Nebula.resize(background.nebulaConfigs, prevW, prevH, newW, newH);
      } catch (_e) {
        out.nebulaConfigs = background.nebulaConfigs;
      }
    }
    if (background.starField) {
      try {
        out.starField = StarField.resize(background.starField, prevW, prevH, newW, newH);
      } catch (_e) {
        out.starField = background.starField;
      }
    }
    return out;
  }

  /**
   * Render the background layers (gradient, nebula, star field) with pause-aware
   * animation timing semantics.
   *
   * Behavior:
   * - Always draws gradient backdrop first (fills entire canvas).
   * - Nebula only skipped on the very initial menu (i.e., before gameplay) to reduce
   *   visual clutter and CPU on low-power devices; still shown during pause & game over.
   * - Star field animation time is frozen while paused (dtSec=0 path inside StarField.draw).
   * - Accepts external `timeSec`/`dtSec` overrides (tests) and falls back to animTime based computation.
   *
   * Performance Notes:
   * - All heavy geometric generation already occurred during init; draw allocates no new objects.
   * - Accepts optional RNG for rare cases where star twinkle may require deterministic variance.
   *
   * Side Effects:
   * - Mutates the provided canvas 2D context by issuing draw calls only (no global state stored).
   *
   * @param {{ ctx: CanvasRenderingContext2D, view: {width:number,height:number}, running:boolean, paused:boolean, gameOver?: boolean, animTime:number, timeSec?:number, dtSec?:number, background:{nebulaConfigs?:any, starField:any}, rng?: RNGLike }} ctxObj Composite context with drawing state + background assets.
   */
  static draw(ctxObj) {
    const {
      ctx,
      view: { width, height },
      paused,
      animTime,
      background: { nebulaConfigs, starField },
    } = ctxObj;
    Background.draw(ctx, width, height);
    if (nebulaConfigs && (ctxObj.running || ctxObj.paused || ctxObj.gameOver)) {
      Nebula.draw(ctx, nebulaConfigs);
    }
    const timeSec = typeof ctxObj.timeSec === "number" ? ctxObj.timeSec : (animTime || 0) / 1000;
    const dtSec = typeof ctxObj.dtSec === "number" ? ctxObj.dtSec : CONFIG.TIME.DEFAULT_DT;
    StarField.draw(ctx, width, height, starField, timeSec, paused, dtSec, ctxObj.rng);
  }
}
