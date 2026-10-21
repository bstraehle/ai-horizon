// @ts-check
import { describe, it, expect, vi, afterEach } from "vitest";
import { AIAnalysisAdapter } from "../js/adapters/AIAnalysisAdapter.js";
import { AIAnalysisManager } from "../js/managers/AIAnalysisManager.js";

const ANALYSIS = {
  feedback: "👨‍🚀 Survive the full 90 seconds to score",
  "technique-1": "Dodge earlier.",
};
const CLIP = { voice: "Ruth", gender: "female", format: "mp3", audio: "AQID" };
/** A run the game can build insights for (ejected after 41 s). */
const RUN = { timer: { totalSeconds: 90, survivedSeconds: 41 }, stats: {} };

/** @param {any} response */
function makeRemote(response) {
  return { postJSON: vi.fn(async () => response) };
}

describe("AIAnalysisAdapter narration", () => {
  it("sends the speech request with the run summary and splits the clip from rawResponse", async () => {
    // The Lambda returns the analysis as a JSON string.
    const remote = makeRemote(JSON.stringify({ ...ANALYSIS, speech: CLIP }));
    const adapter = new AIAnalysisAdapter({
      remoteAdapter: /** @type {any} */ (remote),
      endpoint: "/x",
    });
    const result = await adapter.analyze({
      runSummary: RUN,
      speech: { voice: "female" },
      history: { mission: 3, hooks: ["h"], commander: "altair" },
    });
    // The commander travels as its own field, next to the mission number and hooks.
    expect(remote.postJSON).toHaveBeenCalledWith(
      "/x",
      expect.objectContaining({
        ...RUN,
        speech: { voice: "female" },
        history: { mission: 3, hooks: ["h"] },
        commander: "altair",
      })
    );
    expect(result.title).toBe(ANALYSIS.feedback);
    expect(result.sections).toEqual([
      { kind: "next", heading: "Next mission", items: ["Survival: 41 / 90 s. Dodge earlier."] },
    ]);
    expect(result.speech).toEqual({ audio: "AQID", voice: "Ruth", gender: "female" });
    expect(result.rawResponse).toEqual(ANALYSIS);
    expect(JSON.stringify(result.rawResponse)).not.toContain("AQID");
  });

  it("sends no speech request without one and passes responses without speech through", async () => {
    const raw = JSON.stringify(ANALYSIS);
    const remote = makeRemote(raw);
    const adapter = new AIAnalysisAdapter({
      remoteAdapter: /** @type {any} */ (remote),
      endpoint: "/x",
    });
    const result = await adapter.analyze({ runSummary: RUN });
    expect(/** @type {any} */ (remote.postJSON.mock.calls[0])[1]).not.toHaveProperty("speech");
    expect(result.speech).toBeUndefined();
    expect(result.rawResponse).toBe(raw);
  });
});

describe("AIAnalysisManager narration", () => {
  const original = { audio: AIAnalysisManager.audio, remote: AIAnalysisManager.IS_REMOTE };

  afterEach(() => {
    AIAnalysisManager.audio = original.audio;
    AIAnalysisManager.IS_REMOTE = original.remote;
    vi.restoreAllMocks();
  });

  /** @param {{ muted?: boolean, supported?: boolean }} [opts] */
  function setup(opts = {}) {
    const audio = {
      supported: opts.supported !== false,
      muted: !!opts.muted,
      playSpeech: vi.fn(async () => ({ delay: 0.4, duration: 2.5 })),
    };
    const adapter = {
      analyze: vi.fn(async (/** @type {any} */ input) => ({
        title: "t",
        bullets: ["b"],
        isRemote: true,
        rawResponse: ANALYSIS,
        ...(input.speech ? { speech: { audio: "AQID", voice: "Matthew", gender: "male" } } : {}),
      })),
    };
    AIAnalysisManager.audio = audio;
    AIAnalysisManager.IS_REMOTE = true;
    vi.spyOn(AIAnalysisManager, "_createAdapter").mockResolvedValue(/** @type {any} */ (adapter));
    return { audio, adapter };
  }

  it("requests Commander Vega's voice when sound is on, plays the clip, and reports its timing", async () => {
    const { audio, adapter } = setup();
    const result = /** @type {any} */ (
      await AIAnalysisManager.analyze({
        runSummary: { score: 1 },
        history: { mission: 2, hooks: [] },
      })
    );
    expect(adapter.analyze).toHaveBeenCalledWith({
      runSummary: { score: 1 },
      history: { mission: 2, hooks: [] },
      speech: { voice: "female" },
    });
    expect(audio.playSpeech).toHaveBeenCalledWith("AQID", "vega");
    expect(result.speech).toBeUndefined();
    await expect(result.speechTiming).resolves.toEqual({ delay: 0.4, duration: 2.5 });
  });

  it("requests Captain Altair's voice and call tone when he debriefs", async () => {
    const { audio, adapter } = setup();
    const history = { mission: 5, hooks: [], commander: "altair" };
    await AIAnalysisManager.analyze({ runSummary: { score: 1 }, history });
    expect(adapter.analyze).toHaveBeenCalledWith({
      runSummary: { score: 1 },
      history,
      speech: { voice: "male" },
    });
    expect(audio.playSpeech).toHaveBeenCalledWith("AQID", "altair");
  });

  it("never requests speech (no Polly call) when sound is off, unsupported, or offline", async () => {
    for (const opts of [{ muted: true }, { supported: false }]) {
      const { audio, adapter } = setup(opts);
      const result = /** @type {any} */ (
        await AIAnalysisManager.analyze({ runSummary: { score: 1 } })
      );
      expect(adapter.analyze).toHaveBeenCalledWith({ runSummary: { score: 1 } });
      expect(audio.playSpeech).not.toHaveBeenCalled();
      expect(result.speechTiming).toBeUndefined();
      vi.restoreAllMocks();
    }
    const { adapter } = setup();
    AIAnalysisManager.IS_REMOTE = false;
    await AIAnalysisManager.analyze({ runSummary: { score: 1 } });
    expect(adapter.analyze).toHaveBeenCalledWith({ runSummary: { score: 1 } });
  });
});
