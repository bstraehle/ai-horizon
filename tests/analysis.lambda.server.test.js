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

process.env.MODEL_ID = "test-model";

const {
  PROMPT,
  VERDICT_RATINGS,
  buildPrompt,
  handler,
  selectVoice,
  speakableText,
  speechInput,
  splitRequest,
  verdictRating,
  withRating,
} = await import("../server/lambda/analysis.js");

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
      verdict: null,
    });
    expect(splitRequest('{"score":1,"verdict":"reprimand"}')).toEqual({
      prompt: '{"score":1,"verdict":"reprimand"}',
      voice: null,
      locale: null,
      verdict: "reprimand",
    });
    expect(splitRequest('{"verdict":"promoted"}').verdict).toBeNull();
    expect(splitRequest("not json")).toEqual({
      prompt: "not json",
      voice: null,
      locale: null,
      verdict: null,
    });
  });

  it("returns the headline as generative Polly audio when speech is requested", async () => {
    const { status, analysis } = await post({
      score: 1,
      device: { locale: "en-US" },
      speech: { voice: "male" },
    });
    expect(status).toBe(200);
    const prompt = JSON.parse(bedrockSend.mock.calls[0][0].params.body).messages[0].content[0].text;
    expect(prompt).not.toContain('"speech"');
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

describe("analysis Lambda – verdict rating", () => {
  beforeEach(() => {
    bedrockSend.mockReset();
    pollySend.mockReset();
    bedrockSend.mockResolvedValue(bedrockReply(JSON.stringify(ANALYSIS)));
    pollySend.mockResolvedValue({
      AudioStream: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
    });
  });

  it("rates every verdict in every voiced language, falling back to English without a locale", () => {
    for (const ratings of Object.values(VERDICT_RATINGS)) {
      expect(Object.keys(ratings).sort()).toEqual(["commendation", "reprimand", "satisfactory"]);
    }
    expect(verdictRating("commendation", "en-GB")).toBe("Commendation, pilot.");
    expect(verdictRating("reprimand", "de_AT")).toBe("Verweis, Pilot.");
    expect(verdictRating("satisfactory", null)).toBe("Satisfactory, pilot.");
    expect(verdictRating("reprimand", "ja-JP")).toBeNull();
    expect(verdictRating("promoted", "en-US")).toBeNull();
    expect(verdictRating(null, "en-US")).toBeNull();
  });

  it("puts the rating after the officer emoji, once, even when the model drops the emoji", () => {
    const rated = JSON.parse(withRating(JSON.stringify(ANALYSIS), "Reprimand, pilot."));
    expect(rated.feedback).toBe("👨‍🚀 Reprimand, pilot. Survive the full 90 seconds to score");
    expect(rated["improvement-tip-1"]).toBe(ANALYSIS["improvement-tip-1"]);
    const again = JSON.stringify(rated);
    expect(withRating(again, "Reprimand, pilot.")).toBe(again);
    const bare = JSON.stringify({ feedback: "90 seconds flown." });
    expect(JSON.parse(withRating(bare, "Commendation, pilot.")).feedback).toBe(
      "👨‍🚀 Commendation, pilot. 90 seconds flown."
    );
    const selfRated = JSON.stringify({ feedback: "🚀 Commendation, pilot. 90 seconds flown." });
    expect(JSON.parse(withRating(selfRated, "Commendation, pilot.")).feedback).toBe(
      "👨‍🚀 Commendation, pilot. 90 seconds flown."
    );
    expect(withRating("not json", "Reprimand, pilot.")).toBe("not json");
  });

  it("speaks the rating slower and pauses before the rest, escaping the text for SSML", () => {
    expect(speechInput("Reprimand, pilot. Fly <90> & stay", "Reprimand, pilot.")).toEqual({
      Text: '<speak><prosody rate="90%">Reprimand, pilot.</prosody><break time="400ms"/>Fly &lt;90&gt; &amp; stay</speak>',
      TextType: "ssml",
    });
    expect(speechInput("Fly on", "Reprimand, pilot.")).toEqual({ Text: "Fly on" });
    expect(speechInput("Fly on", null)).toEqual({ Text: "Fly on" });
  });

  it("shows and speaks the rating for the client's verdict", async () => {
    const { analysis } = await post({
      score: 1,
      verdict: "commendation",
      device: { locale: "en-US" },
      speech: { voice: "female" },
    });
    expect(analysis.feedback).toBe("👨‍🚀 Commendation, pilot. Survive the full 90 seconds to score");
    expect(pollySend.mock.calls[0][0].params).toMatchObject({
      Engine: "generative",
      TextType: "ssml",
      Text: '<speak><prosody rate="90%">Commendation, pilot.</prosody><break time="400ms"/>Survive the full 90 seconds to score</speak>',
      VoiceId: "Ruth",
    });
  });

  it("leaves the headline alone without a verdict", async () => {
    const { analysis } = await post({ score: 1, device: { locale: "en-US" } });
    expect(analysis.feedback).toBe(ANALYSIS.feedback);
  });
});

describe("analysis Lambda – prompt", () => {
  it("embeds the run summary verbatim, including `$` sequences", () => {
    const summary = JSON.stringify({ verdict: "reprimand", note: "$& $1 $'" });
    const prompt = buildPrompt(summary);
    expect(prompt).toContain(`<mission details - start>\n${summary}\n<mission details - end>`);
    expect(prompt).not.toContain("%%prompt%%");
  });

  it("sends the filled prompt to Bedrock", async () => {
    bedrockSend.mockReset();
    bedrockSend.mockResolvedValue(bedrockReply(JSON.stringify(ANALYSIS)));
    await post({ score: 1, verdict: "commendation" });
    const sent = JSON.parse(bedrockSend.mock.calls[0][0].params.body).messages[0].content[0].text;
    expect(sent).toBe(buildPrompt(JSON.stringify({ score: 1, verdict: "commendation" })));
    expect(PROMPT).toContain("<verdict rules - start>");
  });

  it("strips Markdown code fences with or without a json tag", async () => {
    for (const fence of ["```json\n", "```\n"]) {
      bedrockSend.mockReset();
      bedrockSend.mockResolvedValue(bedrockReply(`${fence}${JSON.stringify(ANALYSIS)}\n\`\`\`\n`));
      const { analysis } = await post({ score: 1 });
      expect(analysis).toEqual(ANALYSIS);
    }
  });
});
