// @ts-check
import { describe, it, expect } from "vitest";
import {
  altairCanSpeak,
  commanderHooks,
  isStarCrossedDay,
  pickCommander,
} from "../js/managers/Commanders.js";

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

describe("pickCommander", () => {
  it("keeps Vega until the first full mission, which is Altair's debut", () => {
    expect(pickCommander(run(), [], {}, "en-US")).toEqual({ commander: "vega", debut: false });
    expect(pickCommander(run({ survived: 90 }), [run()], {}, "en-US")).toEqual({
      commander: "altair",
      debut: true,
    });
  });

  it("alternates once Altair has been introduced", () => {
    expect(pickCommander(run(), [run()], { ...met, last: "vega" }, "en").commander).toBe("altair");
    expect(pickCommander(run(), [run()], { ...met, last: "altair" }, "en").commander).toBe("vega");
  });

  it("gives a new personal best to Altair and a 3rd early crash in a row to Vega", () => {
    const best = run({ score: 5000, verdict: "satisfactory" });
    expect(pickCommander(best, [run({ score: 4000 })], { ...met, last: "altair" }, "en")).toEqual({
      commander: "altair",
      debut: false,
    });
    const third = pickCommander(run({ score: 10 }), [run(), run()], { ...met, last: "vega" }, "en");
    expect(third.commander).toBe("vega");
    // The all-time best counts, not just the recent runs passed in.
    expect(
      pickCommander(best, [run({ score: 4000 })], { ...met, last: "altair" }, "en", 6000).commander
    ).toBe("vega");
    // Only the 2nd crash in a row: normal turn-taking.
    expect(
      pickCommander(run({ score: 10 }), [run()], { ...met, last: "vega" }, "en").commander
    ).toBe("altair");
  });

  it("never picks Altair where he has no voice", () => {
    expect(altairCanSpeak("nl-BE")).toBe(false);
    expect(altairCanSpeak("pl_PL")).toBe(false);
    expect(altairCanSpeak("ko-KR")).toBe(true);
    expect(altairCanSpeak(null)).toBe(true);
    const best = run({ score: 5000, survived: 90 });
    expect(pickCommander(best, [run()], { ...met, last: "vega" }, "nl-NL").commander).toBe("vega");
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
    expect(lead[0]).toMatch(/first full 90-second mission\. Briefly introduce yourself\.$/);
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
