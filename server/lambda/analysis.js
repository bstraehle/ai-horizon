import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";

const bedrockClient = new BedrockRuntimeClient({
  region: "us-west-2",
  maxAttempts: 3,
});

const pollyClient = new PollyClient({
  region: "us-west-2",
  maxAttempts: 2,
});

/** Longest headline (after emoji removal) sent to Polly; Bedrock is asked for < 10 words. */
const MAX_SPEECH_CHARS = 160;

/**
 * Amazon Polly generative voices (all available in us-west-2), one per gender where Polly offers
 * one. Locales missing a gender fall back to the other gender; unlisted languages get no speech.
 * @type {Record<string, { female?: string, male?: string }>}
 */
export const GENERATIVE_VOICES = {
  "en-US": { female: "Ruth", male: "Matthew" },
  "en-GB": { female: "Amy", male: "Brian" },
  "en-AU": { female: "Olivia" },
  "en-IN": { female: "Kajal" },
  "en-IE": { female: "Niamh" },
  "en-NZ": { female: "Aria" },
  "en-SG": { female: "Jasmine" },
  "en-ZA": { female: "Ayanda" },
  "nl-BE": { female: "Lisa" },
  "nl-NL": { female: "Laura" },
  "fr-BE": { female: "Isabelle" },
  "fr-CA": { female: "Gabrielle", male: "Liam" },
  "fr-FR": { female: "Lea", male: "Remi" },
  "de-AT": { female: "Hannah" },
  "de-DE": { female: "Vicki", male: "Daniel" },
  "de-CH": { female: "Sabrina" },
  "it-IT": { female: "Bianca", male: "Lorenzo" },
  "ko-KR": { female: "Seoyeon" },
  "pl-PL": { female: "Ola" },
  "pt-BR": { female: "Camila" },
  "es-MX": { female: "Mia", male: "Andres" },
  "es-ES": { female: "Lucia", male: "Sergio" },
  "es-US": { female: "Lupe", male: "Pedro" },
};

/** Locale used when only the language matches (e.g. "en-CA" → "en-US", "de" → "de-DE"). */
const LANGUAGE_DEFAULTS = {
  en: "en-US",
  nl: "nl-NL",
  fr: "fr-FR",
  de: "de-DE",
  it: "it-IT",
  ko: "ko-KR",
  pl: "pl-PL",
  pt: "pt-BR",
  es: "es-ES",
};

/**
 * Pick a generative voice for the player's locale, preferring the requested gender.
 * Missing locale defaults to en-US (Bedrock then answers in English).
 * @param {string|null|undefined} locale BCP 47 tag, e.g. "de-DE".
 * @param {string} preferred "female" or "male".
 * @returns {{ voiceId: string, gender: "female"|"male" }|null} null when no voice exists.
 */
export function selectVoice(locale, preferred) {
  if (preferred !== "female" && preferred !== "male") return null;
  const tag = typeof locale === "string" && locale.trim() ? locale.trim() : "en-US";
  const [lang = "", region = ""] = tag.replace(/_/g, "-").split("-");
  const exact = region ? `${lang.toLowerCase()}-${region.toUpperCase()}` : "";
  const fallback = /** @type {Record<string, string>} */ (LANGUAGE_DEFAULTS)[lang.toLowerCase()];
  const voices = GENERATIVE_VOICES[exact] || (fallback ? GENERATIVE_VOICES[fallback] : undefined);
  if (!voices) return null;
  /** @type {"female"|"male"} */
  const other = preferred === "male" ? "female" : "male";
  const gender = voices[preferred] ? preferred : voices[other] ? other : null;
  const voiceId = gender ? voices[gender] : undefined;
  return gender && voiceId ? { voiceId, gender } : null;
}

/**
 * Headline text suitable for speech: emoji removed, whitespace collapsed, length capped.
 * @param {unknown} text
 * @returns {string}
 */
export function speakableText(text) {
  return String(text ?? "")
    .replace(/\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}]|\u200d|\uFE0F/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SPEECH_CHARS);
}

/**
 * Separate the optional `speech` request from the run summary so it never reaches the prompt.
 * @param {string} body Raw POST body (JSON run summary, optionally with `speech: { voice }`).
 * @returns {{ prompt: string, voice: string|null, locale: string|null }}
 */
export function splitRequest(body) {
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || !("speech" in parsed)) {
      return { prompt: body, voice: null, locale: null };
    }
    const { speech, ...summary } = parsed;
    const voice = speech && typeof speech.voice === "string" ? speech.voice : null;
    const locale =
      summary.device && typeof summary.device.locale === "string" ? summary.device.locale : null;
    return { prompt: JSON.stringify(summary), voice, locale };
  } catch {
    return { prompt: body, voice: null, locale: null };
  }
}

/**
 * Add `speech: { voice, gender, format, audio }` (base64 MP3 of the spoken `feedback`) to the
 * analysis JSON. Returns the analysis unchanged when there is no feedback, no voice for the
 * locale, or Polly fails – speech is optional and must never break the debrief.
 * @param {string} analysisText Analysis JSON string from Bedrock.
 * @param {string} voice Requested gender ("female" | "male").
 * @param {string|null} locale
 * @returns {Promise<string>}
 */
export async function withSpeech(analysisText, voice, locale) {
  try {
    const parsed = JSON.parse(analysisText);
    const text = speakableText(parsed && parsed.feedback);
    const selected = text ? selectVoice(locale, voice) : null;
    if (!selected) return analysisText;
    const result = await pollyClient.send(
      new SynthesizeSpeechCommand({
        Engine: "generative",
        OutputFormat: "mp3",
        SampleRate: "24000",
        Text: text,
        VoiceId: selected.voiceId,
      })
    );
    const bytes = await result.AudioStream.transformToByteArray();
    parsed.speech = {
      voice: selected.voiceId,
      gender: selected.gender,
      format: "mp3",
      audio: Buffer.from(bytes).toString("base64"),
    };
    console.log("Polly speech: ", selected.voiceId, bytes.length, "bytes");
    return JSON.stringify(parsed);
  } catch (error) {
    console.error("Polly error:", error instanceof Error ? error.message : String(error));
    return analysisText;
  }
}

/**
 * Lambda handler
 * @param {{httpMethod:string,body?:string}} event
 */
export const handler = async (event) => {
  try {
    const { httpMethod, body } = event;
    let response;

    switch (httpMethod) {
      case "POST":
        if (body) {
          const { prompt, voice, locale } = splitRequest(body);
          console.log("Bedrock request: ", prompt);
          response = await analysis(prompt);
          console.log("Bedrock response: ", response);
          if (voice) response = await withSpeech(response, voice, locale);
        } else {
          return { statusCode: 400, body: JSON.stringify({ message: "Missing request body" }) };
        }
        break;

      default:
        return {
          statusCode: 405,
          body: JSON.stringify({ message: "Method not allowed" }),
        };
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Bedrock error:", message);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: JSON.stringify({
        message: "Internal server error",
        error: message,
      }),
    };
  }
};

/**
 * Analyze a game summary using Bedrock and return a structured response.
 * @param {string} body - The game summary / prompt to analyze
 */
async function analysis(body) {
  var prompt = process.env.PROMPT;
  prompt = prompt.replace("%%prompt%%", body);

  const requestBody = {
    messages: [
      {
        role: "user",
        content: [
          {
            text: prompt,
          },
        ],
      },
    ],
    inferenceConfig: {
      maxTokens: 1000,
      temperature: 1.0,
    },
  };

  const command = new InvokeModelCommand({
    modelId: process.env.MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(requestBody),
  });

  const response = await bedrockClient.send(command);
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));

  let responseText = responseBody.output.message.content[0].text;

  responseText = responseText.replace(/^```json\s*/i, "").replace(/```\s*$/, "");

  return responseText;
}
