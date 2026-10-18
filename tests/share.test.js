// @ts-check
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { JSDOM } from "jsdom";
import { buildShareData, shareScore, initShareLink } from "../js/ui/Share.js";
import { CONFIG } from "../js/constants.js";

const DATA = { title: "AI HORIZON", text: "I scored 10 points", url: "https://example.test/" };

describe("buildShareData", () => {
  it("brags about a positive score with the canonical URL", () => {
    expect(buildShareData(12345.7)).toEqual({
      title: CONFIG.SHARE.TITLE,
      text: "I scored 12,345 points in AI HORIZON. Can you beat it?",
      url: CONFIG.SHARE.URL,
    });
  });

  it("falls back to a generic invite for zero, negative, or invalid scores", () => {
    for (const score of [0, -5, NaN, Infinity]) {
      expect(buildShareData(score).text).toBe(
        "Collect stars, blast asteroids, and beat the clock in AI HORIZON."
      );
    }
  });

  it("accepts a custom URL", () => {
    expect(buildShareData(1, "https://example.test/").url).toBe("https://example.test/");
  });
});

describe("shareScore", () => {
  it("uses the native share sheet when available", async () => {
    const nav = { share: vi.fn().mockResolvedValue(undefined), clipboard: { writeText: vi.fn() } };
    await expect(shareScore(DATA, nav)).resolves.toBe("shared");
    expect(nav.share).toHaveBeenCalledWith(DATA);
    expect(nav.clipboard.writeText).not.toHaveBeenCalled();
  });

  it("does not fall back to the clipboard when the user dismisses the share sheet", async () => {
    const abort = Object.assign(new Error("dismissed"), { name: "AbortError" });
    const nav = { share: vi.fn().mockRejectedValue(abort), clipboard: { writeText: vi.fn() } };
    await expect(shareScore(DATA, nav)).resolves.toBe("cancelled");
    expect(nav.clipboard.writeText).not.toHaveBeenCalled();
  });

  it("copies to the clipboard when sharing fails, is rejected by canShare, or is missing", async () => {
    const failing = {
      share: vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "NotAllowedError" })),
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    };
    await expect(shareScore(DATA, failing)).resolves.toBe("copied");
    expect(failing.clipboard.writeText).toHaveBeenCalledWith(
      "I scored 10 points https://example.test/"
    );

    const refused = {
      share: vi.fn(),
      canShare: () => false,
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    };
    await expect(shareScore(DATA, refused)).resolves.toBe("copied");
    expect(refused.share).not.toHaveBeenCalled();

    const clipboardOnly = { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } };
    await expect(shareScore(DATA, clipboardOnly)).resolves.toBe("copied");
  });

  it("reports unavailable when neither API works", async () => {
    await expect(shareScore(DATA, undefined)).resolves.toBe("unavailable");
    await expect(shareScore(DATA, {})).resolves.toBe("unavailable");
    const denied = { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } };
    await expect(shareScore(DATA, denied)).resolves.toBe("unavailable");
  });
});

describe("initShareLink", () => {
  /** @type {HTMLAnchorElement} */
  let link;
  /** @type {JSDOM} */
  let dom;

  beforeEach(() => {
    vi.useFakeTimers();
    dom = new JSDOM(`<!doctype html><a id="shareLink" href="/">Share</a>`, {
      url: "http://localhost/",
    });
    link = /** @type {HTMLAnchorElement} */ (dom.window.document.getElementById("shareLink"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Click the link and let the async handler settle. */
  const click = async () => {
    const evt = new dom.window.MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(evt);
    await vi.advanceTimersByTimeAsync(0);
    return evt;
  };

  it("ignores a missing element", () => {
    expect(() => initShareLink(null, () => 0, {})).not.toThrow();
  });

  it("shares the score read at click time and suppresses navigation", async () => {
    let score = 0;
    const nav = { share: vi.fn().mockResolvedValue(undefined) };
    initShareLink(link, () => score, nav);
    score = 4200;
    const evt = await click();
    expect(evt.defaultPrevented).toBe(true);
    expect(nav.share).toHaveBeenCalledWith(buildShareData(4200));
    expect(link.textContent).toBe("Share");
  });

  it("shows clipboard feedback, then restores the label", async () => {
    const nav = { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } };
    initShareLink(link, () => 10, nav);
    await click();
    expect(link.textContent).toBe("Link copied");
    await vi.advanceTimersByTimeAsync(CONFIG.SHARE.FEEDBACK_MS);
    expect(link.textContent).toBe("Share");
  });

  it("shows a failure message when sharing is unavailable", async () => {
    initShareLink(link, () => 10, {});
    await click();
    expect(link.textContent).toBe("Share unavailable");
  });
});
