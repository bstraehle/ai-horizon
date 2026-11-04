import { describe, expect, it } from "vitest";
import { CONFIG } from "../js/constants.js";
import { spawnRates } from "../js/managers/SpawnManager.js";

const G = CONFIG.GAME;

describe("spawnRates", () => {
  it("gives desktops the desktop rates whatever the window size", () => {
    expect(spawnRates({ _isMobile: false, view: { width: 360, height: 700 } })).toEqual({
      deviceClass: "desktop",
      asteroid: G.ASTEROID_SPAWN_RATE_DESKTOP,
      star: G.STAR_SPAWN_RATE_DESKTOP,
    });
  });

  it("gives phones (short side under the tablet threshold) the phone rates", () => {
    expect(spawnRates({ _isMobile: true, view: { width: 360, height: 705 } })).toMatchObject({
      deviceClass: "phone",
      asteroid: G.ASTEROID_SPAWN_RATE_MOBILE,
      star: G.STAR_SPAWN_RATE_MOBILE,
    });
    // A phone in landscape is still a phone: the short side decides.
    expect(spawnRates({ _isMobile: true, view: { width: 915, height: 412 } }).deviceClass).toBe(
      "phone"
    );
  });

  it("gives tablets (short side at the threshold or more) the tablet rates, in both orientations", () => {
    for (const view of [
      { width: 820, height: 1180 },
      { width: 1180, height: 820 },
      { width: G.TABLET_MIN_SHORT_SIDE, height: 1000 },
    ]) {
      expect(spawnRates({ _isMobile: true, view })).toMatchObject({
        deviceClass: "tablet",
        asteroid: G.ASTEROID_SPAWN_RATE_TABLET,
        star: G.STAR_SPAWN_RATE_TABLET,
      });
    }
  });

  it("places tablet rates between phone and desktop", () => {
    expect(G.ASTEROID_SPAWN_RATE_TABLET).toBeGreaterThan(G.ASTEROID_SPAWN_RATE_MOBILE);
    expect(G.ASTEROID_SPAWN_RATE_TABLET).toBeLessThan(G.ASTEROID_SPAWN_RATE_DESKTOP);
    expect(G.STAR_SPAWN_RATE_TABLET).toBeGreaterThan(G.STAR_SPAWN_RATE_MOBILE);
    expect(G.STAR_SPAWN_RATE_TABLET).toBeLessThan(G.STAR_SPAWN_RATE_DESKTOP);
  });

  it("uses the generic rates when the platform is unknown and not in low-power mode", () => {
    expect(spawnRates({ view: { width: 1000, height: 800 } })).toEqual({
      deviceClass: "default",
      asteroid: G.ASTEROID_SPAWN_RATE,
      star: G.STAR_SPAWN_RATE,
    });
  });
});
