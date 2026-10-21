import { beforeEach, describe, expect, it, vi } from "vitest";

const bedrockSend = vi.fn();
const pollySend = vi.fn();

vi.mock("@aws-sdk/client-bedrock-runtime", () => ({
  BedrockRuntimeClient: class {
    send(/** @type {any} */ cmd) {
      return bedrockSend(cmd);
    }
  },
  ConverseCommand: class {
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
  DEBRIEF_TOOL,
  HEADLINE_IMAGERY,
  PERSONAS,
  PROMPT,
  SYSTEM_PROMPT,
  VERDICT_RATINGS,
  buildPrompt,
  debriefFromResponse,
  handler,
  headlineFact,
  headlineReaction,
  languageName,
  selectVoice,
  speakableText,
  speechInput,
  splitRequest,
  storyHooks,
  tidyHeadline,
  verdictRating,
  withRating,
} = await import("../server/lambda/analysis.js");

const ANALYSIS = {
  feedback: "👨‍🚀 Survive the full 90 seconds to score",
  "improvement-tip-1": "🚀 Dodge earlier",
};

/** Bedrock Converse response answering in text. @param {string} text */
function bedrockReply(text) {
  return { output: { message: { role: "assistant", content: [{ text }] } } };
}

/** The user prompt of the n-th Converse call. @param {number} [n] */
const sentPrompt = (n = 0) => bedrockSend.mock.calls[n][0].params.messages[0].content[0].text;

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
    expect(selectVoice("ko-KR", "male")?.voiceId).toBe("Hyunduk");
    expect(selectVoice("pt-BR", "male")?.voiceId).toBe("Leo");
    // No male voice for the region → the language default's male voice keeps the gender.
    expect(selectVoice("en-IE", "male")).toEqual({ voiceId: "Matthew", gender: "male" });
    expect(selectVoice("de-AT", "male")?.voiceId).toBe("Daniel");
    expect(selectVoice("en-IE", "female")?.voiceId).toBe("Niamh");
    // No male voice for the language at all → female even when male is requested.
    expect(selectVoice("nl-NL", "male")).toEqual({ voiceId: "Laura", gender: "female" });
    expect(selectVoice("pl-PL", "male")?.voiceId).toBe("Ola");
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
    expect(speakableText("x".repeat(500))).toHaveLength(340);
    expect(speakableText(undefined)).toBe("");
  });

  it("keeps the speech, history and commander requests out of the mission details", () => {
    const body = JSON.stringify({
      score: 1,
      device: { locale: "de-DE" },
      speech: { voice: "male" },
      history: { mission: 4, hooks: ["New personal best: 900 points."] },
      commander: "altair",
    });
    expect(splitRequest(body)).toEqual({
      prompt: JSON.stringify({ score: 1, device: { locale: "de-DE" } }),
      voice: "male",
      locale: "de-DE",
      verdict: null,
      hooks: ["New personal best: 900 points."],
      commander: "altair",
    });
    expect(splitRequest('{"score":1,"verdict":"reprimand"}')).toEqual({
      prompt: '{"score":1,"verdict":"reprimand"}',
      voice: null,
      locale: null,
      verdict: "reprimand",
      hooks: [],
      commander: "vega",
    });
    expect(splitRequest('{"verdict":"promoted"}').verdict).toBeNull();
    // Unknown commanders (including inherited property names) fall back to Vega.
    expect(splitRequest('{"commander":"zorg"}').commander).toBe("vega");
    expect(splitRequest('{"commander":"constructor"}').commander).toBe("vega");
    expect(splitRequest("not json")).toEqual({
      prompt: "not json",
      voice: null,
      locale: null,
      verdict: null,
      hooks: [],
    });
  });

  it("speaks as the requested commander, each with a consistent voice gender", async () => {
    await post({
      score: 1,
      device: { locale: "en-US" },
      commander: "altair",
      speech: { voice: "female" },
    });
    await post({ score: 1, device: { locale: "en-US" }, speech: { voice: "male" } });
    const system = (/** @type {number} */ n) => bedrockSend.mock.calls[n][0].params.system[0].text;
    expect(system(0)).toBe(PERSONAS.altair.system);
    expect(system(0)).toMatch(/^You are Captain Altair/);
    expect(system(1)).toBe(PERSONAS.vega.system);
    expect(system(1)).toBe(SYSTEM_PROMPT);
    expect(sentPrompt()).not.toContain("altair");
    expect(pollySend.mock.calls.map((c) => c[0].params.VoiceId)).toEqual(["Matthew", "Ruth"]);
  });

  it("limits the client's story hooks in count and length", () => {
    expect(storyHooks({ hooks: ["  a  ", 5, "", "b", "c", "d", "e"] })).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
    expect(storyHooks({ hooks: ["x".repeat(500)] })[0]).toHaveLength(200);
    expect(storyHooks(null)).toEqual([]);
    expect(storyHooks({ hooks: "nope" })).toEqual([]);
  });

  it("returns the headline as generative Polly audio when speech is requested", async () => {
    const { status, analysis } = await post({
      score: 1,
      device: { locale: "en-US" },
      commander: "altair",
      speech: { voice: "male" },
    });
    expect(status).toBe(200);
    expect(sentPrompt()).not.toContain('"speech"');
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
  it("embeds the run summary, fact, reaction and hooks verbatim, including `$` sequences", () => {
    const summary = JSON.stringify({ verdict: "reprimand", note: "$& $1 $'" });
    const prompt = buildPrompt(summary, "the pilot survived $1 seconds", "React $&.", [
      "New personal best: $1 points.",
      "3rd full mission in a row.",
    ]);
    expect(prompt).toContain(`<mission details - start>\n${summary}\n<mission details - end>`);
    expect(prompt).toContain(
      "1. State this fact, with its number as digits: the pilot survived $1 seconds."
    );
    expect(prompt).toContain("2. React $&.");
    expect(prompt).toContain(
      "<story hooks - start>\n- New personal best: $1 points.\n- 3rd full mission in a row.\n<story hooks - end>"
    );
    expect(prompt).not.toMatch(/%%\w+%%/);
    expect(buildPrompt("{}", "f", "r", [])).toContain(
      "<story hooks - start>\nnone\n<story hooks - end>"
    );
  });

  it("shapes the headline per commander: Vega clipped, Altair longer with swagger", () => {
    const vega = buildPrompt("{}", "f", "r", []);
    expect(vega).toContain(`The headline is ${PERSONAS.vega.headline.shape}:`);
    expect(vega).toContain(`2. r\n${PERSONAS.vega.headline.style}\n`);
    const altair = buildPrompt("{}", "f", "r", [], "English", PERSONAS.altair.headline);
    expect(altair).toContain("The headline is 3 or 4 short, punchy sentences");
    expect(altair).toContain("\n3-4. Then 1 or 2 sentences of pure swagger");
    expect(altair).not.toMatch(/%%\w+%%/);
  });

  it("states the verdict's key fact for the headline", () => {
    /** @param {number} survivedSeconds @param {any} [stats] */
    const run = (survivedSeconds, stats = {}) => ({
      timer: { totalSeconds: 90, survivedSeconds },
      stats,
    });
    expect(headlineFact(run(2), "reprimand")).toBe("the pilot survived 2 seconds");
    expect(headlineFact(run(84), "satisfactory")).toBe(
      "the pilot went down in the finale with 6 seconds left"
    );
    expect(headlineFact(run(90), "satisfactory")).toBe("the pilot flew the full 90 seconds");
    expect(
      headlineFact(
        run(90, { bonusAsteroidsKilled: 7, bonusAsteroidsEncountered: 8 }),
        "commendation"
      )
    ).toBe("the pilot destroyed 7 of 8 bonus asteroids");
    expect(
      headlineFact(run(90, { bonusAsteroidsKilled: 3, shotsFiredAccuracy: 0.614 }), "commendation")
    ).toBe("the pilot hit 61% of their shots");
    expect(headlineFact(null, null)).toBe("the most important number in the mission details");
  });

  it("reacts to the first story hook, or to random imagery without hooks", () => {
    expect(headlineReaction(["New personal best: 900 points.", "2nd full mission."])).toMatch(
      /^React to this, .*: New personal best: 900 points\.$/
    );
    expect(headlineReaction([], () => 0)).toContain(`imagery: ${HEADLINE_IMAGERY[0]}.`);
    expect(headlineReaction([], () => 0.999)).toContain(`imagery: ${HEADLINE_IMAGERY.at(-1)}.`);
  });

  it("names the player's language for the prompt", () => {
    expect(languageName("de-DE")).toBe("German (Germany)");
    expect(languageName("pt_BR")).toBe("Brazilian Portuguese");
    expect(languageName("ko")).toBe("Korean");
    expect(languageName(null)).toBe("English");
    expect(languageName("not a tag!")).toBe("English");
    expect(buildPrompt("{}", "f", "r", [], "French (France)")).toContain(
      "Write everything in French (France) (the facts"
    );
  });

  it("keeps the headline to 2 sentences and a readable length", () => {
    expect(tidyHeadline("One.  Two!   Three? Four.")).toBe("One. Two!");
    expect(tidyHeadline("Only one sentence without a stop")).toBe(
      "Only one sentence without a stop"
    );
    expect(tidyHeadline("90 Sekunden. Stark!")).toBe("90 Sekunden. Stark!");
    // A German ordinal ("4.") is not a sentence end.
    expect(tidyHeadline("9 Sekunden überlebt. Der 4. Absturz in Folge.")).toBe(
      "9 Sekunden überlebt. Der 4. Absturz in Folge."
    );
    expect(tidyHeadline("하나。둘。셋。")).toBe("하나。둘。");
    const long = tidyHeadline(`${"word ".repeat(60)}end.`);
    expect(long.length).toBeLessThanOrEqual(181);
    expect(long.endsWith("word…")).toBe(true);
    // Captain Altair's headline may run to 4 sentences and 300 characters.
    const altair = PERSONAS.altair.headline;
    expect(tidyHeadline("A. B! C. D? E.", altair)).toBe("A. B! C. D?");
    const longer = tidyHeadline(`${"word ".repeat(80)}end.`, altair);
    expect(longer.length).toBeGreaterThan(181);
    expect(longer.length).toBeLessThanOrEqual(301);
  });

  it("asks every model for the debrief through a forced tool call with the commander persona", async () => {
    bedrockSend.mockReset();
    bedrockSend.mockResolvedValue(bedrockReply(JSON.stringify(ANALYSIS)));
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    const summary = { timer: { totalSeconds: 90, survivedSeconds: 30 }, verdict: "reprimand" };
    await post({ ...summary, history: { mission: 7, hooks: ["4th early crash in a row."] } });
    await post(summary);
    random.mockRestore();
    const params = bedrockSend.mock.calls[0][0].params;
    expect(params.modelId).toBe("test-model");
    expect(params.system).toEqual([{ text: SYSTEM_PROMPT }]);
    expect(params.toolConfig).toEqual({
      tools: [DEBRIEF_TOOL],
      toolChoice: { tool: { name: "debrief" } },
    });
    const hooks = ["4th early crash in a row."];
    expect(sentPrompt(0)).toBe(
      buildPrompt(
        JSON.stringify(summary),
        "the pilot survived 30 seconds",
        headlineReaction(hooks),
        hooks
      )
    );
    expect(sentPrompt(1)).toBe(
      buildPrompt(
        JSON.stringify(summary),
        "the pilot survived 30 seconds",
        headlineReaction([], () => 0),
        []
      )
    );
    expect(PROMPT).toContain("<headline rules - start>");
  });

  it("reads the tool call, or JSON inside a text answer, and tidies the headline", async () => {
    const tool = { toolUse: { toolUseId: "t1", name: "debrief", input: { feedback: "A. B. C." } } };
    expect(debriefFromResponse({ output: { message: { content: [tool] } } })).toBe(
      JSON.stringify({ feedback: "A. B. C." })
    );
    expect(
      debriefFromResponse(bedrockReply(`Here you go:\n\`\`\`json\n{"feedback":"x"}\n\`\`\`\nDone.`))
    ).toBe('{"feedback":"x"}');
    expect(debriefFromResponse(null)).toBe("");

    bedrockSend.mockReset();
    bedrockSend.mockResolvedValue({ output: { message: { content: [tool] } } });
    const { analysis } = await post({ score: 1 });
    expect(analysis).toEqual({ feedback: "A. B." });
  });

  it("asks for a draft, then sends only the proofread headline in the commander's shape", async () => {
    expect(DEBRIEF_TOOL.toolSpec.inputSchema.json.required).toEqual(["draft", "feedback"]);
    const input = { draft: "Draft one. Two.", feedback: "A. B. C. D. E." };
    bedrockSend.mockReset();
    bedrockSend.mockResolvedValue({
      output: { message: { content: [{ toolUse: { name: "debrief", input } }] } },
    });
    expect((await post({ score: 1, commander: "altair" })).analysis).toEqual({
      feedback: "A. B. C. D.",
    });
    expect((await post({ score: 1 })).analysis).toEqual({ feedback: "A. B." });
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
