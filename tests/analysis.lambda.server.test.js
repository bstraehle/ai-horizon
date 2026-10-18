import { beforeEach, describe, expect, it, vi } from "vitest";

const bedrockSend = vi.fn();
const pollySend = vi.fn();

vi.mock("@aws-sdk/client-bedrock-runtime", () => ({
  BedrockRuntimeClient: class {
    send(/** @type {any} */ cmd) {
      return bedrockSend(cmd);
    }
  },
  InvokeModelCommand: class {
    constructor(/** @type {any} */ params) {
      this.params = params;
    }
  },
}));

vi.mock("@aws-sdk/client-polly", () => ({
  PollyClient: class {
    send(/** @type {any} */ cmd) {
      return pollySend(cmd);
    }
  },
  SynthesizeSpeechCommand: class {
    constructor(/** @type {any} */ params) {
      this.params = params;
    }
  },
}));

process.env.PROMPT = "PROMPT:%%prompt%%";
process.env.MODEL_ID = "test-model";

const { handler, selectVoice, speakableText, splitRequest } =
  await import("../server/lambda/analysis.js");

const ANALYSIS = {
  feedback: "👨‍🚀 Survive the full 90 seconds to score",
  "improvement-tip-1": "🚀 Dodge earlier",
};

/** Bedrock InvokeModel response carrying `text`. @param {string} text */
function bedrockReply(text) {
  return {
    body: new TextEncoder().encode(
      JSON.stringify({ output: { message: { content: [{ text }] } } })
    ),
  };
}

/** @param {any} summary */
async function post(summary) {
  const res = await handler({ httpMethod: "POST", body: JSON.stringify(summary) });
  return { status: res.statusCode, analysis: JSON.parse(JSON.parse(res.body)) };
}

describe("analysis Lambda – Polly narration", () => {
  beforeEach(() => {
    bedrockSend.mockReset();
    pollySend.mockReset();
    bedrockSend.mockResolvedValue(bedrockReply(JSON.stringify(ANALYSIS)));
    pollySend.mockResolvedValue({
      AudioStream: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
    });
  });

  it("selects generative voices by locale and gender, falling back as specified", () => {
    expect(selectVoice("en-US", "female")).toEqual({ voiceId: "Ruth", gender: "female" });
    expect(selectVoice("en-US", "male")).toEqual({ voiceId: "Matthew", gender: "male" });
    expect(selectVoice("de-DE", "male")).toEqual({ voiceId: "Daniel", gender: "male" });
    // Only a female voice exists → female even when male is requested.
    expect(selectVoice("en-AU", "male")).toEqual({ voiceId: "Olivia", gender: "female" });
    expect(selectVoice("pt-BR", "male")?.voiceId).toBe("Camila");
    // Language-only / unknown region → language default.
    expect(selectVoice("en-CA", "male")?.voiceId).toBe("Matthew");
    expect(selectVoice("fr", "female")?.voiceId).toBe("Lea");
    expect(selectVoice("es_MX", "male")?.voiceId).toBe("Andres");
    // Missing locale → en-US.
    expect(selectVoice(null, "female")?.voiceId).toBe("Ruth");
    // No generative voice for the language, or an invalid gender → nothing.
    expect(selectVoice("ja-JP", "female")).toBeNull();
    expect(selectVoice("zh-CN", "male")).toBeNull();
    expect(selectVoice("en-US", "robot")).toBeNull();
  });

  it("strips emoji and caps the spoken text", () => {
    expect(speakableText("👨‍🚀 Survive  90s 🔥")).toBe("Survive 90s");
    expect(speakableText("x".repeat(500))).toHaveLength(160);
    expect(speakableText(undefined)).toBe("");
  });

  it("keeps the speech request out of the Bedrock prompt", () => {
    const body = JSON.stringify({
      score: 1,
      device: { locale: "de-DE" },
      speech: { voice: "male" },
    });
    expect(splitRequest(body)).toEqual({
      prompt: JSON.stringify({ score: 1, device: { locale: "de-DE" } }),
      voice: "male",
      locale: "de-DE",
    });
    expect(splitRequest('{"score":1}')).toEqual({
      prompt: '{"score":1}',
      voice: null,
      locale: null,
    });
    expect(splitRequest("not json")).toEqual({ prompt: "not json", voice: null, locale: null });
  });

  it("returns the headline as generative Polly audio when speech is requested", async () => {
    const { status, analysis } = await post({
      score: 1,
      device: { locale: "en-US" },
      speech: { voice: "male" },
    });
    expect(status).toBe(200);
    const prompt = JSON.parse(bedrockSend.mock.calls[0][0].params.body).messages[0].content[0].text;
    expect(prompt).not.toContain("speech");
    expect(pollySend).toHaveBeenCalledTimes(1);
    expect(pollySend.mock.calls[0][0].params).toEqual({
      Engine: "generative",
      OutputFormat: "mp3",
      SampleRate: "24000",
      Text: "Survive the full 90 seconds to score",
      VoiceId: "Matthew",
    });
    expect(analysis.feedback).toBe(ANALYSIS.feedback);
    expect(analysis.speech).toEqual({
      voice: "Matthew",
      gender: "male",
      format: "mp3",
      audio: Buffer.from([1, 2, 3]).toString("base64"),
    });
  });

  it("does not invoke Polly without a speech request or without a voice for the locale", async () => {
    const plain = await post({ score: 1, device: { locale: "en-US" } });
    expect(plain.analysis.speech).toBeUndefined();
    const japanese = await post({
      score: 1,
      device: { locale: "ja-JP" },
      speech: { voice: "female" },
    });
    expect(japanese.analysis.speech).toBeUndefined();
    expect(pollySend).not.toHaveBeenCalled();
  });

  it("still returns the debrief when Polly fails", async () => {
    pollySend.mockRejectedValue(new Error("ThrottlingException"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { status, analysis } = await post({ score: 1, speech: { voice: "female" } });
    expect(status).toBe(200);
    expect(analysis).toEqual(ANALYSIS);
    errorSpy.mockRestore();
  });
});
