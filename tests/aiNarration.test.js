// @ts-check
import { describe, it, expect, vi, afterEach } from "vitest";
import { AIAnalysisAdapter } from "../js/adapters/AIAnalysisAdapter.js";
import { AIAnalysisManager } from "../js/managers/AIAnalysisManager.js";

const ANALYSIS = {
  feedback: "👨‍🚀 Survive the full 90 seconds to score",
  "improvement-tip-1": "🚀 Dodge earlier",
};
const CLIP = { voice: "Ruth", gender: "female", format: "mp3", audio: "AQID" };

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
      runSummary: { score: { playerFinalScore: 10 } },
      speech: { voice: "female" },
    });
    expect(remote.postJSON).toHaveBeenCalledWith("/x", {
      score: { playerFinalScore: 10 },
      speech: { voice: "female" },
    });
    expect(result.title).toBe(ANALYSIS.feedback);
    expect(result.speech).toEqual({ audio: "AQID", voice: "Ruth", gender: "female" });
    expect(result.rawResponse).toEqual(ANALYSIS);
    expect(JSON.stringify(result.rawResponse)).not.toContain("AQID");
  });

  it("sends the plain run summary and passes responses without speech through unchanged", async () => {
    const raw = JSON.stringify(ANALYSIS);
    const remote = makeRemote(raw);
    const adapter = new AIAnalysisAdapter({
      remoteAdapter: /** @type {any} */ (remote),
      endpoint: "/x",
    });
    const result = await adapter.analyze({ runSummary: { score: 1 } });
    expect(remote.postJSON).toHaveBeenCalledWith("/x", { score: 1 });
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
      takeNarratorVoice: vi.fn(() => "male"),
      playSpeech: vi.fn(async () => true),
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

  it("requests speech when sound is on, plays the clip, and keeps it out of the result", async () => {
    const { audio, adapter } = setup();
    const result = await AIAnalysisManager.analyze({ runSummary: { score: 1 } });
    expect(adapter.analyze).toHaveBeenCalledWith({
      runSummary: { score: 1 },
      speech: { voice: "male" },
    });
    expect(audio.playSpeech).toHaveBeenCalledWith("AQID");
    expect(/** @type {any} */ (result).speech).toBeUndefined();
  });

  it("never requests speech (no Polly call) when sound is off, unsupported, or offline", async () => {
    for (const opts of [{ muted: true }, { supported: false }]) {
      const { audio, adapter } = setup(opts);
      await AIAnalysisManager.analyze({ runSummary: { score: 1 } });
      expect(adapter.analyze).toHaveBeenCalledWith({ runSummary: { score: 1 } });
      expect(audio.takeNarratorVoice).not.toHaveBeenCalled();
      expect(audio.playSpeech).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    }
    const { audio, adapter } = setup();
    AIAnalysisManager.IS_REMOTE = false;
    await AIAnalysisManager.analyze({ runSummary: { score: 1 } });
    expect(adapter.analyze).toHaveBeenCalledWith({ runSummary: { score: 1 } });
    expect(audio.takeNarratorVoice).not.toHaveBeenCalled();
  });
});
