// @ts-check
import { describe, it, expect } from "vitest";
import { RunHistory, runEntry, storyHooks, ordinal } from "../js/managers/RunHistory.js";
import { LocalStorageAdapter } from "../js/adapters/LocalStorageAdapter.js";

const DAY = 86_400_000;

/**
 * @param {Partial<import("../js/managers/RunHistory.js").RunEntry>} o
 * @returns {import("../js/managers/RunHistory.js").RunEntry}
 */
const e = (o) => ({
  t: 1_000 * DAY,
  score: 1000,
  survived: 40,
  total: 90,
  verdict: "reprimand",
  accuracy: 0.4,
  bonus: 1,
  ...o,
});
const full = (/** @type {any} */ o = {}) => e({ survived: 90, verdict: "satisfactory", ...o });

/** In-memory Storage for LocalStorageAdapter. */
function memoryStorage() {
  /** @type {Record<string, string>} */
  const data = {};
  return /** @type {any} */ ({
    data,
    getItem: (/** @type {string} */ k) => (k in data ? data[k] : null),
    setItem: (/** @type {string} */ k, /** @type {string} */ v) => {
      data[k] = v;
    },
  });
}

describe("runEntry", () => {
  it("keeps what the commander needs from a run summary", () => {
    const summary = {
      timer: { totalSeconds: 90, survivedSeconds: 90 },
      score: { playerFinalScore: 8700, leaderBoardHighScore: 14415 },
      stats: { bonusAsteroidsKilled: 7, shotsFiredAccuracy: 0.55 },
    };
    expect(runEntry(summary, 5)).toEqual({
      t: 5,
      score: 8700,
      survived: 90,
      total: 90,
      verdict: "commendation",
      accuracy: 0.55,
      bonus: 7,
      top: 14415,
    });
    expect(runEntry({ timer: { survivedSeconds: null } })).toBeNull();
    expect(runEntry(null)).toBeNull();
  });
});

describe("storyHooks", () => {
  it("welcomes a first mission", () => {
    expect(storyHooks(e({}), [], 1)).toEqual(["This is the pilot's first mission."]);
  });

  it("puts a new personal best first, with the exact margin", () => {
    const hooks = storyHooks(e({ score: 5200 }), [e({ score: 4000 }), e({ score: 3000 })], 3);
    expect(hooks[0]).toBe(
      "New personal best: 5200 points, 1200 more than the previous best of 4000."
    );
  });

  it("notices coming close to the personal best", () => {
    expect(storyHooks(e({ score: 3700 }), [e({ score: 4000 })], 2)).toContain(
      "Only 300 points short of the personal best of 4000."
    );
  });

  it("celebrates firsts: full mission and commendation", () => {
    const hooks = storyHooks(full({ verdict: "commendation", score: 900 }), [e({})], 2);
    expect(hooks).toContain("First time the pilot flew the full 90 seconds.");
    expect(hooks).toContain("First commendation for this pilot.");
  });

  it("counts streaks, and notices a streak ending", () => {
    expect(storyHooks(full({ score: 10 }), [full(), full()], 3)).toContain(
      "3rd full mission in a row."
    );
    expect(storyHooks(e({ score: 10 }), [full(), full(), full()], 4)).toContain(
      "This crash ends a streak of 3 full missions."
    );
    expect(storyHooks(e({ score: 10 }), [e({}), e({})], 3)).toContain("3rd early crash in a row.");
  });

  it("measures improvements against recent missions", () => {
    const hooks = storyHooks(
      e({ score: 10, survived: 60, accuracy: 0.6, bonus: 4 }),
      [
        e({ survived: 30, accuracy: 0.4, verdict: null }),
        e({ survived: 40, accuracy: 0.44, verdict: null }),
      ],
      3
    );
    expect(hooks).toEqual([
      "Most bonus asteroids ever: 4, previous best 1.",
      "Survived 20 seconds longer than last mission (40 seconds).",
      "Accuracy 60%, up from an average of 42% over the last 2 missions.",
    ]);
  });

  it("notices a return after a break and mission milestones", () => {
    const back = storyHooks(e({ score: 10, t: 1_010 * DAY }), [e({ t: 1_000 * DAY })], 10);
    expect(back).toEqual(["First mission in 10 days.", "This is the pilot's 10th mission."]);
  });

  it("returns at most 3 hooks, most interesting first", () => {
    const hooks = storyHooks(
      full({ verdict: "commendation", score: 9000, bonus: 7, accuracy: 0.9 }),
      [e({ score: 1000 }), e({ score: 2000 })],
      3
    );
    expect(hooks).toHaveLength(3);
    expect(hooks[0]).toMatch(/^New personal best/);
  });

  it("formats ordinals", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "101st",
    ]);
  });
});

describe("RunHistory", () => {
  it("numbers missions, keeps the most recent ones, and compares before recording", () => {
    const storage = memoryStorage();
    const history = new RunHistory({ storage: new LocalStorageAdapter({ storage }), max: 2 });
    expect(history.debrief(e({ score: 100 }))).toEqual({
      mission: 1,
      hooks: ["This is the pilot's first mission."],
      commander: "vega",
    });
    expect(history.debrief(e({ score: 200 })).hooks[0]).toMatch(/^New personal best: 200/);
    const third = history.debrief(e({ score: 150 }));
    expect(third.mission).toBe(3);
    const stored = history.read();
    expect(stored.count).toBe(3);
    expect(stored.runs.map((r) => r.score)).toEqual([200, 150]);
  });

  it("introduces Altair on the first full mission, then full missions take turns", () => {
    const history = new RunHistory({
      storage: new LocalStorageAdapter({ storage: memoryStorage() }),
    });
    expect(history.debrief(e({ score: 500 })).commander).toBe("vega");
    expect(history.debrief(e({ score: 400 })).commander).toBe("vega");
    const debut = history.debrief(full({ score: 300 }));
    expect(debut.commander).toBe("altair");
    expect(debut.hooks[0]).toMatch(/^Captain Altair's first debrief with this pilot/);
    expect(history.read().cast).toEqual({ lastFull: "altair", altairMet: true });
    // Crashes are always Vega's and leave the full-mission turn alone.
    const crash = history.debrief(e({ score: 200 }));
    expect(crash.commander).toBe("vega");
    expect(crash.hooks.join(" ")).not.toMatch(/first debrief/);
    expect(history.read().cast.lastFull).toBe("altair");
    expect(history.debrief(full({ score: 100 })).commander).toBe("vega");
    expect(history.debrief(e({ score: 100 })).commander).toBe("vega");
    expect(history.debrief(full({ score: 100 })).commander).toBe("altair");
    expect(history.debrief(full({ score: 100 })).commander).toBe("vega");
  });

  it("gives an overall record to Altair on a full mission, and to Vega on a crash", () => {
    const history = new RunHistory({
      storage: new LocalStorageAdapter({ storage: memoryStorage() }),
    });
    history.debrief(full({ score: 9000 }));
    history.debrief(full({ score: 100 }));
    expect(history.read().cast.lastFull).toBe("vega");
    // Below the personal best of 9000, but above the leaderboard's top score.
    const crash = history.debrief(e({ score: 5000, top: 4000 }));
    expect(crash.commander).toBe("vega");
    expect(crash.hooks[0]).toBe(
      "New overall record: 5000 points beats the leaderboard's top score of 4000."
    );
    expect(history.debrief(full({ score: 100 })).commander).toBe("altair");
    expect(history.debrief(full({ score: 6000, top: 5000 })).commander).toBe("altair");
  });

  it("quotes the last debrief once, and only after it was remembered", () => {
    const history = new RunHistory({
      storage: new LocalStorageAdapter({ storage: memoryStorage() }),
    });
    history.rememberDebrief("vega", "ignored: nothing recorded yet");
    expect(history.read().cast).toEqual({});
    const first = history.debrief(e({ score: 100 }));
    history.rememberDebrief(first.commander, "  Reprimand, pilot. Survived 40 seconds.  ");
    const second = history.debrief(e({ score: 50 }));
    expect(second.hooks[second.hooks.length - 1]).toBe(
      'Last mission, Commander Vega told the pilot: "Reprimand, pilot. Survived 40 seconds."'
    );
    // No debrief arrived for the second mission (offline), so the third quotes nothing.
    expect(history.debrief(e({ score: 60 })).hooks.join(" ")).not.toMatch(/Last mission/);
    history.rememberDebrief(/** @type {any} */ ("zorg"), "x");
    history.rememberDebrief("vega", "   ");
    expect(history.read().cast.line).toBeUndefined();
  });

  it("keeps the run hooks to 3 next to the commander hooks, and the quote last", () => {
    const history = new RunHistory({
      storage: new LocalStorageAdapter({ storage: memoryStorage() }),
    });
    history.debrief(e({ score: 1000 }));
    history.rememberDebrief("vega", "Line.");
    const debut = history.debrief(
      full({ verdict: "commendation", score: 9000, bonus: 7, accuracy: 0.9 })
    );
    expect(debut.hooks).toHaveLength(4);
    expect(debut.hooks[0]).toMatch(/^Captain Altair's first debrief/);
    expect(debut.hooks[1]).toMatch(/^New personal best/);
    expect(debut.hooks[3]).toMatch(/^Last mission, Commander Vega/);
  });

  it("keeps Commander Vega for languages without a male voice", () => {
    const history = new RunHistory({
      storage: new LocalStorageAdapter({ storage: memoryStorage() }),
    });
    expect(history.debrief(full({}), { locale: "nl-NL" }).commander).toBe("vega");
    expect(history.debrief(full({}), { locale: "pl-PL" }).commander).toBe("vega");
    expect(history.debrief(full({}), { locale: "de-DE" }).commander).toBe("altair");
  });

  it("can describe a mission without remembering it (autopilot)", () => {
    const history = new RunHistory({
      storage: new LocalStorageAdapter({ storage: memoryStorage() }),
    });
    expect(history.debrief(full({}), { record: false })).toMatchObject({
      mission: 1,
      commander: "altair",
    });
    expect(history.read()).toEqual({ count: 0, runs: [], best: 0, cast: {} });
  });

  it("treats missing or corrupt storage as an empty history", () => {
    const storage = memoryStorage();
    storage.setItem("aiHorizonRunHistory", "{not json");
    expect(new RunHistory({ storage: new LocalStorageAdapter({ storage }) }).read()).toEqual({
      count: 0,
      runs: [],
      best: 0,
      cast: {},
    });
    storage.setItem(
      "aiHorizonRunHistory",
      JSON.stringify({
        count: 9,
        runs: [{ score: "x" }, e({})],
        best: "lots",
        cast: { last: "zorg", altairMet: "yes", line: "Hi.", lineBy: "altair" },
      })
    );
    // Without a valid stored best (e.g. history from before it was kept), the runs' best counts.
    expect(new RunHistory({ storage: new LocalStorageAdapter({ storage }) }).read()).toEqual({
      count: 9,
      runs: [e({})],
      best: 1000,
      cast: { line: "Hi.", lineBy: "altair" },
    });
  });

  it("keeps the all-time best after its mission drops out of the recent runs", () => {
    const storage = memoryStorage();
    const history = new RunHistory({ storage: new LocalStorageAdapter({ storage }), max: 2 });
    history.debrief(full({ score: 9000 }));
    history.debrief(e({ score: 100 }));
    history.debrief(e({ score: 200 }));
    expect(history.read().runs.map((r) => r.score)).toEqual([100, 200]);
    expect(history.read().best).toBe(9000);
    // 5000 beats every remembered run but not the all-time best: no false personal best.
    const below = history.debrief(full({ score: 5000 }));
    expect(below.hooks.join(" ")).not.toMatch(/New personal best/);
    expect(below.commander).toBe("vega");
    const above = history.debrief(full({ score: 9500 }));
    expect(above.hooks[0]).toBe(
      "New personal best: 9500 points, 500 more than the previous best of 9000."
    );
    expect(above.commander).toBe("altair");
    expect(history.read().best).toBe(9500);
  });
});
