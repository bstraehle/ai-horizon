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
/** A full 90-second mission. @param {object} o */
const full = (o = {}) => run({ survived: 90, verdict: "satisfactory", ...o });

describe("pickCommander", () => {
  it("gives every mission under 90 seconds to Vega, records included", () => {
    expect(pickCommander(run(), [], {}, "en-US")).toEqual({ commander: "vega", debut: false });
    const crashRecord = run({ score: 9000, top: 8000, survived: 85 });
    expect(pickCommander(crashRecord, [run()], met, "en").commander).toBe("vega");
    expect(pickCommander(crashRecord, [run()], {}, "en")).toEqual({
      commander: "vega",
      debut: false,
    });
  });

  it("gives the first full mission to Altair as his debut", () => {
    expect(pickCommander(full(), [run(), run()], {}, "en-US")).toEqual({
      commander: "altair",
      debut: true,
    });
  });

  it("alternates full missions, picking up after the last full one", () => {
    const pick = (/** @type {any} */ lastFull) =>
      pickCommander(full({ score: 10 }), [run()], { ...met, lastFull }, "en").commander;
    expect(pick("altair")).toBe("vega");
    expect(pick("vega")).toBe("altair");
    // Not remembered (history from before): the last full mission was Altair's debut.
    expect(pick(undefined)).toBe("vega");
  });

  it("gives full missions with a personal best or overall record to Altair", () => {
    const cast = { ...met, lastFull: /** @type {const} */ ("altair") };
    const best = full({ score: 5000 });
    expect(pickCommander(best, [run({ score: 4000 })], cast, "en")).toEqual({
      commander: "altair",
      debut: false,
    });
    // The all-time best counts, not just the recent runs passed in.
    expect(pickCommander(best, [run({ score: 4000 })], cast, "en", 6000).commander).toBe("vega");
    // Beating the leaderboard's top score is a record even below the personal best.
    const overall = full({ score: 5000, top: 4500 });
    expect(pickCommander(overall, [run({ score: 4000 })], cast, "en", 6000).commander).toBe(
      "altair"
    );
  });

  it("never picks Altair where he has no voice", () => {
    expect(altairCanSpeak("nl-BE")).toBe(false);
    expect(altairCanSpeak("pl_PL")).toBe(false);
    expect(altairCanSpeak("ko-KR")).toBe(true);
    expect(altairCanSpeak(null)).toBe(true);
    const best = full({ score: 5000 });
    expect(pickCommander(best, [run()], { ...met, lastFull: "vega" }, "nl-NL").commander).toBe(
      "vega"
    );
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
