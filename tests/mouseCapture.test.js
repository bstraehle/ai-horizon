// @ts-check
import { describe, it, expect, vi, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import { MouseCapture, isMouseEvent } from "../js/ui/MouseCapture.js";

describe("MouseCapture", () => {
  /** @type {Document} */
  let doc;
  /** @type {HTMLElement} */
  let canvas;
  /** @type {Element|null} */
  let lockElement;
  /** @type {import('vitest').Mock} */
  let onChange;

  /** Simulate the browser granting / dropping the lock. */
  const setLock = (/** @type {Element|null} */ el) => {
    lockElement = el;
    doc.dispatchEvent(new doc.defaultView.Event("pointerlockchange"));
  };

  beforeEach(() => {
    doc = new JSDOM(`<!doctype html><body><canvas id="c"></canvas></body>`).window.document;
    canvas = /** @type {HTMLElement} */ (doc.getElementById("c"));
    lockElement = null;
    Object.defineProperty(doc, "pointerLockElement", { get: () => lockElement });
    doc.exitPointerLock = vi.fn(() => setLock(null));
    canvas.requestPointerLock = /** @type {any} */ (vi.fn(() => Promise.resolve()));
    onChange = vi.fn();
  });

  it("requests the lock only when not already locked", () => {
    const capture = new MouseCapture(canvas, onChange, doc);
    capture.request();
    expect(canvas.requestPointerLock).toHaveBeenCalledTimes(1);
    setLock(canvas);
    expect(capture.locked).toBe(true);
    capture.request();
    expect(canvas.requestPointerLock).toHaveBeenCalledTimes(1);
  });

  it("reports gains and losses once each, including browser-forced releases", () => {
    new MouseCapture(canvas, onChange, doc);
    setLock(canvas);
    setLock(canvas);
    setLock(null);
    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });

  it("release exits only while locked", () => {
    const capture = new MouseCapture(canvas, onChange, doc);
    capture.release();
    expect(doc.exitPointerLock).not.toHaveBeenCalled();
    setLock(canvas);
    capture.release();
    expect(doc.exitPointerLock).toHaveBeenCalledTimes(1);
    expect(capture.locked).toBe(false);
  });

  it("swallows denied requests and is a no-op without Pointer Lock support", async () => {
    canvas.requestPointerLock = /** @type {any} */ (vi.fn(() => Promise.reject(new Error("no"))));
    new MouseCapture(canvas, onChange, doc).request();
    await Promise.resolve();
    /** @type {any} */ (canvas).requestPointerLock = undefined;
    expect(() => new MouseCapture(canvas, onChange, doc).request()).not.toThrow();
  });

  it("ignores another element holding the lock", () => {
    const capture = new MouseCapture(canvas, onChange, doc);
    setLock(doc.body);
    expect(capture.locked).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("dispose stops reporting", () => {
    const capture = new MouseCapture(canvas, onChange, doc);
    capture.dispose();
    setLock(canvas);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("isMouseEvent accepts mouse clicks only", () => {
    expect(isMouseEvent(/** @type {any} */ ({ pointerType: "mouse" }))).toBe(true);
    expect(isMouseEvent(/** @type {any} */ ({ pointerType: "touch" }))).toBe(false);
    expect(isMouseEvent(/** @type {any} */ ({ pointerType: "" }))).toBe(false);
    expect(isMouseEvent(undefined)).toBe(false);
  });
});
