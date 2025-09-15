import { CONFIG, clamp } from "../constants.js";

/**
 * ViewManager – responsive canvas sizing + DPR transform management.
 *
 * Responsibilities:
 * - Compute logical (CSS) vs backing-store pixel sizes respecting min/max DPR caps and mobile constraints.
 * - Preserve player relative position during live resizes (center X and bottom offset heuristics) for smoother UX.
 * - Clamp player back into view when new dimensions shrink beneath previous bounds.
 * - Expose a single static `resize` entry to keep side effects localized.
 */
export class ViewManager {
  /**
   * Resize canvas and update view metrics and player spawn position.
   * @param {{ canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, view: {width:number,height:number,dpr:number}, player: { x:number,y:number,width:number,height:number}, canvasRect?: DOMRect, state: import('../core/GameStateMachine.js').GameStateMachine }} game - The game instance.
   */
  static resize(game) {
    const { canvas, ctx, view, player } = game;
    const wasRunning = game.state.isRunning();
    const prevW = view.width || 0;
    const prevH = view.height || 0;
    let relCenterX = 0.5;
    let relBottom = CONFIG.PLAYER.SPAWN_Y_OFFSET / Math.max(1, prevH);
    if (wasRunning && prevW > 0 && prevH > 0) {
      const centerX = player.x + player.width / 2;
      const bottomOffset = Math.max(0, prevH - (player.y + player.height));
      relCenterX = centerX / prevW;
      relBottom = bottomOffset / prevH;
    }
    let deviceDpr = window.devicePixelRatio || 1;
    // Determine a conservative mobile hint: prefer the game's _isMobile flag, else fallback to basic touch check.
    // Cast to any to avoid static typing errors when checking a runtime-only flag.
    const gAny = /** @type {any} */ (game);
    const hintIsMobile =
      typeof gAny === "object" && typeof gAny._isMobile === "boolean"
        ? gAny._isMobile
        : (navigator.maxTouchPoints || 0) > 0;
    if (hintIsMobile && CONFIG.VIEW.DPR_MOBILE_MAX) {
      deviceDpr = Math.min(deviceDpr, CONFIG.VIEW.DPR_MOBILE_MAX);
    }
    const dpr = Math.max(CONFIG.VIEW.DPR_MIN, Math.min(CONFIG.VIEW.DPR_MAX, deviceDpr));
    view.dpr = dpr;
    view.width = Math.round(window.innerWidth);
    view.height = Math.round(window.innerHeight);

    canvas.style.width = view.width + "px";
    canvas.style.height = view.height + "px";
    // Use rounded pixel sizes for backing store to avoid off-by-one reflows
    canvas.width = Math.round(view.width * dpr);
    canvas.height = Math.round(view.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (wasRunning && prevW > 0 && prevH > 0) {
      const newCenterX = relCenterX * view.width;
      const newBottom = relBottom * view.height;
      player.x = clamp(newCenterX - player.width / 2, 0, view.width - player.width);
      player.y = clamp(view.height - player.height - newBottom, 0, view.height - player.height);
    } else {
      player.x = view.width / 2 - player.width / 2;
      player.y = view.height - player.height - CONFIG.PLAYER.SPAWN_Y_OFFSET;
    }

    game.canvasRect = canvas.getBoundingClientRect();
  }
}
