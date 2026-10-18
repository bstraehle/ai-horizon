// @ts-check
import { describe, it, expect, vi, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import { initSoundToggles } from "../js/ui/SoundToggle.js";

/** Minimal AudioManager stand-in with real mute bookkeeping. */
function makeAudio(supported = true) {
  /** @type {Set<(m: boolean) => void>} */
  const listeners = new Set();
  const audio = {
    supported,
    muted: false,
    unlock: vi.fn(),
    toggleMuted() {
      audio.muted = !audio.muted;
      for (const fn of listeners) fn(audio.muted);
      return audio.muted;
    },
    /** @param {(m: boolean) => void} fn */
    onMuteChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return audio;
}

describe("initSoundToggles", () => {
  /** @type {JSDOM} */
  let dom;
  /** @type {Document} */
  let doc;

  beforeEach(() => {
    dom = new JSDOM(
      `<!doctype html><body>
        <a id="t1" class="sound-toggle" href="#" role="button">Sound: On</a>
        <a id="t2" class="sound-toggle" href="#" role="button">Sound: On</a>
        <input id="initialsInput" />
      </body>`,
      { url: "http://localhost/" }
    );
    doc = dom.window.document;
  });

  const label = (/** @type {string} */ id) => doc.getElementById(id)?.textContent;
  /** @param {EventTarget} target @param {Record<string, any>} init */
  const key = (target, init) =>
    target.dispatchEvent(new dom.window.KeyboardEvent("keydown", { bubbles: true, ...init }));

  it("renders the persisted state and keeps every toggle in sync on click", () => {
    const audio = makeAudio();
    audio.muted = true;
    initSoundToggles(/** @type {any} */ (audio), doc);
    expect(label("t1")).toBe("Sound: Off");
    expect(label("t2")).toBe("Sound: Off");

    const click = new dom.window.MouseEvent("click", { bubbles: true, cancelable: true });
    doc.getElementById("t1")?.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(audio.muted).toBe(false);
    expect(audio.unlock).toHaveBeenCalledTimes(1);
    expect(label("t1")).toBe("Sound: On");
    expect(label("t2")).toBe("Sound: On");
  });

  it("toggles with the M key and Space on a focused toggle, but not while typing initials", () => {
    const audio = makeAudio();
    initSoundToggles(/** @type {any} */ (audio), doc);
    key(doc.body, { code: "KeyM", key: "m" });
    expect(audio.muted).toBe(true);
    key(doc.body, { code: "KeyM", key: "m", repeat: true });
    key(doc.body, { code: "KeyM", key: "m", ctrlKey: true });
    key(/** @type {Element} */ (doc.getElementById("initialsInput")), { code: "KeyM", key: "m" });
    expect(audio.muted).toBe(true);
    key(/** @type {Element} */ (doc.getElementById("t2")), { code: "Space", key: " " });
    expect(audio.muted).toBe(false);
  });

  it("hides the toggles and ignores M when Web Audio is unsupported", () => {
    const audio = makeAudio(false);
    initSoundToggles(/** @type {any} */ (audio), doc);
    expect(/** @type {HTMLElement} */ (doc.getElementById("t1")).hidden).toBe(true);
    key(doc.body, { code: "KeyM", key: "m" });
    expect(audio.muted).toBe(false);
  });

  it("teardown removes listeners", () => {
    const audio = makeAudio();
    const teardown = initSoundToggles(/** @type {any} */ (audio), doc);
    teardown();
    key(doc.body, { code: "KeyM", key: "m" });
    doc.getElementById("t1")?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    expect(audio.muted).toBe(false);
  });
});
