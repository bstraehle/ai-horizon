// @ts-check
import { describe, it, expect } from "vitest";
import { commanderHooks, isStarCrossedDay, pickCommander } from "../js/managers/Commanders.js";

const DAY = 86_400_000;
/** A Wednesday in October, no star-crossed day in either calendar. */
const OCT = Date.UTC(2026, 9, 21, 12);

/** @param {object} o */
const run = (o = {}) => ({
  t: OCT,
  score: 1000,
  survived: 40,
  total: 90,
  verdict: "reprimand",
  ...o,
});
const met = { altairMet: true };
/** A full 90-second mission. @param {object} o */
const full = (o = {}) => run({ survived: 90, verdict: "satisfactory", ...o });

describe("pickCommander", () => {
  it("gives every mission under 90 seconds to Vega, records included", () => {
    expect(pickCommander(run(), {})).toEqual({ commander: "vega", debut: false });
    const crashRecord = run({ score: 9000, top: 8000, survived: 85 });
    expect(pickCommander(crashRecord, met)).toEqual({ commander: "vega", debut: false });
    expect(pickCommander(crashRecord, {})).toEqual({ commander: "vega", debut: false });
  });

  it("gives every full mission to Altair, records or not", () => {
    for (const mission of [full({ score: 10 }), full({ score: 9000, top: 8000 })]) {
      expect(pickCommander(mission, met)).toEqual({ commander: "altair", debut: false });
      expect(pickCommander(mission, met, false)).toEqual({ commander: "altair", debut: false });
    }
  });

  it("makes the first full mission online Altair's debut; offline ones keep it waiting", () => {
    expect(pickCommander(full(), {})).toEqual({ commander: "altair", debut: true });
    expect(pickCommander(full(), {}, false)).toEqual({ commander: "altair", debut: false });
  });
});

describe("star-crossed day", () => {
  it("finds the 7th day of the 7th month in the Gregorian and Chinese calendars", () => {
    expect(isStarCrossedDay(Date.UTC(2026, 6, 7, 12), "UTC")).toBe(true);
    expect(isStarCrossedDay(Date.UTC(2026, 7, 19, 12), "UTC")).toBe(true);
    expect(isStarCrossedDay(Date.UTC(2025, 7, 29, 12), "UTC")).toBe(true);
    expect(isStarCrossedDay(Date.UTC(2026, 7, 18, 12), "UTC")).toBe(false);
    expect(isStarCrossedDay(OCT, "UTC")).toBe(false);
  });
});

describe("commanderHooks", () => {
  it("leads with Altair's debut and the star-crossed day, and quotes the last line last", () => {
    const july7 = run({ t: Date.UTC(2026, 6, 7, 12), survived: 90 });
    const cast = { line: "x".repeat(200), lineBy: /** @type {const} */ ("vega") };
    const { lead, tail } = commanderHooks({ commander: "altair", debut: true }, july7, cast);
    expect(lead[0]).toMatch(/^Captain “Altair” Straehle's first debrief with this pilot/);
    expect(lead[0]).toMatch(
      /first full 90-second mission\. Briefly introduce yourself with your rank, name and call sign\.$/
    );
    expect(lead[1]).toMatch(/Vega and Altair meet across the Milky Way.*Mention Commander Vega/);
    expect(tail).toHaveLength(1);
    expect(tail[0]).toMatch(/^Last mission, Commander Vega told the pilot: "x+…"$/);
    expect(tail[0].length).toBeLessThanOrEqual(200);
  });

  it("adds nothing on an ordinary day without a remembered line", () => {
    expect(commanderHooks({ commander: "vega", debut: false }, run({ t: OCT + DAY }), {})).toEqual({
      lead: [],
      tail: [],
    });
  });
});
