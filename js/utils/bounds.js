/**
 * bounds.js – shared helpers for deriving axis-aligned bounds and view culling checks.
 *
 * These utilities are used by both rendering and update systems to avoid duplicating
 * geometry math and to keep culling behavior consistent across subsystems.
 */

/**
 * Derive an axis-aligned bounding box from an entity-like object.
 * Supports either plain `x/y/width/height` properties or a `getBounds()` method.
 * @param {any} obj
 * @returns {{ x:number, y:number, width:number, height:number } | null}
 */
export function getRect(obj) {
  if (!obj) return null;
  try {
    if (typeof obj.getBounds === "function") {
      const bounds = obj.getBounds();
      if (bounds && Number.isFinite(bounds.x) && Number.isFinite(bounds.y)) {
        return {
          x: bounds.x,
          y: bounds.y,
          width: Number.isFinite(bounds.width) ? bounds.width : 0,
          height: Number.isFinite(bounds.height) ? bounds.height : 0,
        };
      }
    }
  } catch (_e) {
    /* ignore malformed getBounds implementations */
  }
  if (
    typeof obj.x === "number" &&
    typeof obj.y === "number" &&
    Number.isFinite(obj.x) &&
    Number.isFinite(obj.y)
  ) {
    const width = typeof obj.width === "number" && Number.isFinite(obj.width) ? obj.width : 0;
    const height =
      typeof obj.height === "number" && Number.isFinite(obj.height) ? obj.height : width;
    return { x: obj.x, y: obj.y, width, height };
  }
  return null;
}

/**
 * Determine whether the provided object is within the extended viewport rectangle.
 * Passing a positive margin keeps entities alive slightly outside the view to prevent
 * popping when entering/exiting the screen.
 * @param {any} obj
 * @param {number} viewWidth
 * @param {number} viewHeight
 * @param {number} [margin=0]
 * @returns {boolean}
 */
export function isOnscreen(obj, viewWidth, viewHeight, margin = 0) {
  const rect = getRect(obj);
  if (!rect) return true;
  const vw = Number.isFinite(viewWidth) && viewWidth > 0 ? viewWidth : Infinity;
  const vh = Number.isFinite(viewHeight) && viewHeight > 0 ? viewHeight : Infinity;
  const m = margin > 0 ? margin : 0;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  return !(right < -m || rect.x > vw + m || bottom < -m || rect.y > vh + m);
}
