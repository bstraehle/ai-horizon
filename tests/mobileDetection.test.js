import { describe, expect, it } from "vitest";
import { detectMobilePlatform } from "../js/utils/mobilePlatform.js";

describe("detectMobilePlatform", () => {
  it("treats Android browsers as mobile", () => {
    const result = detectMobilePlatform({
      userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36",
      maxTouchPoints: 5,
      userAgentData: { mobile: false, platform: "Android" },
      matchMedia: () => ({ matches: true }),
    });

    expect(result.isMobile).toBe(true);
    expect(result.isAndroid).toBe(true);
  });

  it("keeps desktop browsers on the desktop path", () => {
    const result = detectMobilePlatform({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15",
      maxTouchPoints: 0,
      userAgentData: { mobile: false, platform: "macOS" },
      matchMedia: () => ({ matches: false }),
    });

    expect(result.isMobile).toBe(false);
    expect(result.isAndroid).toBe(false);
  });
});
