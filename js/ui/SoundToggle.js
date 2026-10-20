/**
 * SoundToggle – binds every `.sound-toggle` control and the M key (see `isMuteKey`) to
 * AudioManager mute state.
 *
 * The controls are links (`<a role="button">`) because the start and leaderboard overlays'
 * focus locks only let links take focus besides their primary button. Labels read "Sound: On" /
 * "Sound: Off" and stay in sync through `audio.onMuteChange`. Unmuting from a control also
 * unlocks the AudioContext, since the click is a user gesture. When Web Audio is unsupported the
 * controls are hidden and the M key is ignored.
 */

/**
 * @param {Element|null} el
 * @returns {boolean} Whether keystrokes on `el` are text entry (e.g. the initials input).
 */
function isTextEntry(el) {
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    /** @type {HTMLElement} */ (el).isContentEditable === true
  );
}

const LETTER = /^\p{L}$/u;
const LATIN = /^\p{Script=Latin}$/u;

/**
 * Whether `e` is the mute shortcut: the key that types M on the active layout (so it follows the
 * label on AZERTY and other Latin layouts). Layouts that type a non-Latin letter there (Cyrillic,
 * Greek, Hangul), or report no character, fall back to the physical M key position.
 * @param {KeyboardEvent} e
 * @returns {boolean}
 */
export function isMuteKey(e) {
  const key = e.key || "";
  if (key === "m" || key === "M") return true;
  const nonLatinLetter = LETTER.test(key) && !LATIN.test(key);
  return (nonLatinLetter || key.length !== 1) && e.code === "KeyM";
}

/**
 * @param {import('../managers/AudioManager.js').AudioManager} audio
 * @param {Document} [doc]
 * @returns {() => void} Teardown that removes all listeners.
 */
export function initSoundToggles(audio, doc = document) {
  const toggles = /** @type {HTMLElement[]} */ (Array.from(doc.querySelectorAll(".sound-toggle")));
  if (!audio.supported) {
    for (const el of toggles) el.hidden = true;
    return () => {};
  }

  /** @param {boolean} muted */
  const render = (muted) => {
    for (const el of toggles) el.textContent = muted ? "Sound: Off" : "Sound: On";
  };
  const toggle = () => {
    if (!audio.toggleMuted()) audio.unlock();
  };

  /** @param {Event} e */
  const onClick = (e) => {
    e.preventDefault();
    toggle();
  };
  /** @param {KeyboardEvent} e */
  const onToggleKey = (e) => {
    if (e.key !== " " && e.code !== "Space") return;
    e.preventDefault();
    e.stopPropagation();
    toggle();
  };
  /** @param {KeyboardEvent} e */
  const onWindowKey = (e) => {
    if (!isMuteKey(e) || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTextEntry(/** @type {Element|null} */ (e.target))) return;
    toggle();
  };

  for (const el of toggles) {
    el.addEventListener("click", onClick);
    el.addEventListener("keydown", onToggleKey);
  }
  const win = doc.defaultView;
  if (win) win.addEventListener("keydown", onWindowKey);
  const unsubscribe = audio.onMuteChange(render);
  render(audio.muted);

  return () => {
    for (const el of toggles) {
      el.removeEventListener("click", onClick);
      el.removeEventListener("keydown", onToggleKey);
    }
    if (win) win.removeEventListener("keydown", onWindowKey);
    unsubscribe();
  };
}
