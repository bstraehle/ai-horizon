// @ts-check
import { describe, it, expect, vi, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import { typewrite } from "../js/ui/Typewriter.js";

const el = () =>
  /** @type {HTMLElement} */ (new JSDOM("<p></p>").window.document.querySelector("p"));

describe("typewrite", () => {
  afterEach(() => vi.useRealTimers());

  it("waits for the delay, then reveals the text evenly over the duration", async () => {
    vi.useFakeTimers();
    const p = el();
    const { done } = typewrite(p, "abcdefghij", { delayMs: 500, durationMs: 1000 });
    expect(p.textContent).toBe("");
    await vi.advanceTimersByTimeAsync(400);
    expect(p.textContent).toBe("");
    await vi.advanceTimersByTimeAsync(600);
    expect(p.textContent?.length).toBeGreaterThanOrEqual(4);
    expect(p.textContent?.length).toBeLessThanOrEqual(6);
    await vi.advanceTimersByTimeAsync(600);
    expect(p.textContent).toBe("abcdefghij");
    await expect(done).resolves.toBeUndefined();
  });

  it("never splits an emoji or combined character", async () => {
    vi.useFakeTimers();
    const p = el();
    const text = "👨‍🚀 Go";
    typewrite(p, text, { durationMs: 400 });
    const seen = new Set();
    for (let i = 0; i < 20; i++) {
      await vi.advanceTimersByTimeAsync(30);
      seen.add(p.textContent);
    }
    for (const shown of seen) expect(text.startsWith(String(shown))).toBe(true);
    expect([...seen].some((s) => s === "👨‍🚀")).toBe(true);
  });

  it("hands the not-yet-shown text to restEl so the layout never changes size", async () => {
    vi.useFakeTimers();
    const p = el();
    const rest = el();
    typewrite(p, "abcdef", { durationMs: 600, restEl: rest });
    expect(rest.textContent).toBe("abcdef");
    await vi.advanceTimersByTimeAsync(300);
    expect(`${p.textContent}${rest.textContent}`).toBe("abcdef");
    expect(rest.textContent?.length).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(400);
    expect(rest.textContent).toBe("");
  });

  it("shows everything at once when instant, and cancel finishes early", async () => {
    const p = el();
    await typewrite(p, "Done.", { instant: true, durationMs: 5000 }).done;
    expect(p.textContent).toBe("Done.");
    vi.useFakeTimers();
    const q = el();
    const reveal = typewrite(q, "Cancelled early.", { durationMs: 5000 });
    await vi.advanceTimersByTimeAsync(100);
    reveal.cancel();
    expect(q.textContent).toBe("Cancelled early.");
    await expect(reveal.done).resolves.toBeUndefined();
  });
});
