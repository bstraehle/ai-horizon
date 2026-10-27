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
    expect(pickCommander(run(), [], {})).toEqual({ commander: "vega", debut: false });
    const crashRecord = run({ score: 9000, top: 8000, survived: 85 });
    expect(pickCommander(crashRecord, [run()], met).commander).toBe("vega");
    expect(pickCommander(crashRecord, [run()], {})).toEqual({
      commander: "vega",
      debut: false,
    });
  });

  it("gives the first full mission to Altair as his debut, once the AI debrief is online", () => {
    expect(pickCommander(full(), [run(), run()], {})).toEqual({
      commander: "altair",
      debut: true,
    });
    expect(pickCommander(full(), [run()], {}, undefined, false)).toEqual({
      commander: "vega",
      debut: false,
    });
  });

  it("alternates back-to-back full missions, picking up after the last full one", () => {
    const pick = (/** @type {any} */ lastFull) =>
      pickCommander(full({ score: 10 }), [full({ score: 20 })], { ...met, lastFull }).commander;
    expect(pick("altair")).toBe("vega");
    expect(pick("vega")).toBe("altair");
    // Not remembered (history from before): the last full mission was Altair's debut.
    expect(pick(undefined)).toBe("vega");
  });

  it("gives the first full mission after one that ended early to Altair", () => {
    const cast = { ...met, lastFull: /** @type {const} */ ("altair") };
    expect(pickCommander(full({ score: 10 }), [full({ score: 20 }), run()], cast).commander).toBe(
      "altair"
    );
    // Only the mission right before counts.
    expect(pickCommander(full({ score: 10 }), [run(), full({ score: 20 })], cast).commander).toBe(
      "vega"
    );
  });

  it("gives full missions with a personal best or overall record to Altair", () => {
    const cast = { ...met, lastFull: /** @type {const} */ ("altair") };
    const best = full({ score: 5000 });
    // A full mission before, so only the record decides (after a crash it would be Altair's anyway).
    const before = [full({ score: 4000 })];
    expect(pickCommander(best, before, cast)).toEqual({ commander: "altair", debut: false });
    // The all-time best counts, not just the recent runs passed in.
    expect(pickCommander(best, before, cast, 6000).commander).toBe("vega");
    // Beating the leaderboard's top score is a record even below the personal best.
    const overall = full({ score: 5000, top: 4500 });
    expect(pickCommander(overall, before, cast, 6000).commander).toBe("altair");
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
