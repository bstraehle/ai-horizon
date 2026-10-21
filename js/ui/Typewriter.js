/**
 * Typewriter – reveal text in an element over a set duration (the debrief headline, timed to the
 * commander's voice). Splits by grapheme where `Intl.Segmenter` exists so emoji and combined
 * characters never appear half-drawn. The element should be `aria-hidden` with the full text
 * available to assistive technology elsewhere, since its content changes on every tick.
 *
 * Pass `restEl` (styled `visibility: hidden`) to keep the not-yet-shown text in the layout, so
 * the surrounding box has its final size from the start and the text reveals in place.
 */

/** @param {string} text @returns {string[]} */
function graphemes(text) {
  const Segmenter = /** @type {any} */ (Intl).Segmenter;
  if (typeof Segmenter === "function") {
    return Array.from(new Segmenter(undefined, { granularity: "grapheme" }).segment(text), (s) =>
      String(/** @type {any} */ (s).segment)
    );
  }
  return Array.from(text);
}

/**
 * @param {HTMLElement} el
 * @param {string} text
 * @param {{ delayMs?: number, durationMs?: number, instant?: boolean, tickMs?: number,
 *   restEl?: HTMLElement|null, now?: () => number, setTimer?: (fn: () => void, ms: number) => any,
 *   clearTimer?: (id: any) => void }} [opts]
 *   `instant` shows everything at once (e.g. reduced motion); `restEl` receives the text not yet
 *   shown; timers are injectable for tests.
 * @returns {{ done: Promise<void>, cancel: () => void }} `done` resolves when the text is fully
 *   shown (or the reveal is cancelled); `cancel` stops it and shows the full text.
 */
export function typewrite(el, text, opts = {}) {
  const {
    delayMs = 0,
    durationMs = 0,
    instant = false,
    tickMs = 30,
    restEl = null,
    now = () => Date.now(),
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (id) => clearTimeout(id),
  } = opts;
  const parts = graphemes(String(text ?? ""));
  /** @type {() => void} */
  let finish = () => {};
  const done = new Promise((resolve) => {
    finish = /** @type {() => void} */ (resolve);
  });
  /** @type {any} */
  let timer = null;
  let finished = false;
  /** @param {number} n Graphemes shown. */
  const show = (n) => {
    el.textContent = parts.slice(0, n).join("");
    if (restEl) restEl.textContent = parts.slice(n).join("");
  };
  const complete = () => {
    if (finished) return;
    finished = true;
    if (timer !== null) clearTimer(timer);
    show(parts.length);
    finish();
  };
  if (instant || durationMs <= 0 || parts.length === 0) {
    complete();
    return { done, cancel: complete };
  }
  show(0);
  const start = now() + Math.max(0, delayMs);
  const tick = () => {
    const shown = Math.ceil(((now() - start) / durationMs) * parts.length);
    if (shown >= parts.length) {
      complete();
      return;
    }
    if (shown > 0) show(shown);
    timer = setTimer(tick, tickMs);
  };
  timer = setTimer(tick, Math.max(0, delayMs));
  return { done, cancel: complete };
}
