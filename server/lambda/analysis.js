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

/**
 * Bedrock prompt; `%%prompt%%` is replaced with the run summary JSON, including the client's
 * `verdict` and `insights` (see `missionVerdict` / `missionInsights` in
 * js/adapters/AIAnalysisAdapter.js). The client shows each weakness as its exact fact followed by
 * the model's `technique-N`; its offline debrief uses the same techniques in English.
 * Kept in code rather than an environment variable because Lambda caps all environment variables
 * at 4 KB combined.
 */
export const PROMPT = `You are a space force debrief officer for AI HORIZON, an arcade-style space shooter, in which a player has 90 seconds to collect stars and destroy asteroids without having to eject due to an imminent asteroid collision. Based on the provided scoring rules, technique rules, verdict rules, and mission details, provide your analysis to help the pilot improve. Respond in the provided answer format.
<scoring rules - start>
- Stars: +25
- Bonus stars: +50
- Asteroids: +10
- Hardened asteroids (10 hits): +100
- 8 bonus asteroids (10 hits): +250
- Every 1000 points: +250
- Bullet upgrade (after 2500 points): hardened and bonus asteroids take 50% fewer hits
- Finale (last 15 seconds): all points double
- End-of-run shots fired accuracy bonus (0-100%)
<scoring rules - end>
<technique rules - start>
The mission details include insights computed by the game: up to 3 weaknesses, the most important first, each with a topic. The game shows each weakness as its topic name and exact numbers; write technique-N for weakness N: one short order based on the topic's technique below, as a sentence (capital first letter, ending with a period), without emoji, numbers from the mission, or the topic name.
- survival: Dodge first, shoot second; one collision ends the run; keep room to maneuver.
- finale: Every point counts double in the last 15 seconds; push hardest then.
- bonusAsteroids (250 points, 10 hits): One appears every 10 seconds, 8 per mission; hit each one as soon as it appears.
- bonusStars (50 points): Every 5th star is a bonus star; steer through them.
- hardenedAsteroids (100 points, 10 hits): Reach 2500 points early to upgrade your bullets; they then take half the hits.
- accuracy: The end-of-run bonus is the base score times accuracy; fire short bursts at targets instead of holding fire.
- stars (25 points): Grab stars on the way between attacks.
- asteroids (10 points): Shoot the asteroids in your path.
<technique rules - end>
<verdict rules - start>
The mission details include a verdict decided by the game. The game puts the rating (e.g. "Commendation, pilot.") in front of the feedback headline, so do not write a rating yourself. The headline is read aloud by a text-to-speech voice, so write it for listening, as a strict but fair space force officer: 2 short plain sentences, first the most important fact of this mission (e.g. survivedSeconds, bonusAsteroidsKilled, shotsFiredAccuracy, playerFinaleBonus), then a brief remark or order matching the verdict. No questions, irony, sarcasm, jokes, or metaphors; avoid generic phrases such as "Great job" or "Keep it up".
- commendation: sincere praise, e.g. "7 of 8 bonus asteroids destroyed. Outstanding shooting."
- satisfactory: acknowledge, then push, e.g. "Full 90 seconds flown. Now hit the bonus asteroids."
- reprimand: firm criticism, e.g. "You ejected after 41 seconds. Stay in the fight."
- no verdict: choose the tone from survivedSeconds.
The examples only show the structure: use the facts of this mission.
<verdict rules - end>
<mission details - start>
%%prompt%%
<mission details - end>
<answer format - start>
Write in the language of device.locale, with numbers as digits. Call things by their names in the scoring rules (stars, bonus stars, asteroids, hardened asteroids, bonus asteroids), never by colour. The headline has less than 10 words, each technique less than 12 words. Include one technique per weakness and leave out the rest.
{
"feedback": "👨‍🚀 <headline without the rating, see verdict rules>",
"technique-1": "<technique for weakness 1, see technique rules>",
"technique-2": "<technique for weakness 2>",
"technique-3": "<technique for weakness 3>"
}
<answer format - end>
Your answer:`;

/**
 * Fill {@link PROMPT} with the run summary. A replacer function keeps `$` sequences in the
 * summary literal.
 * @param {string} summary Run summary JSON (without the `speech` request).
 * @returns {string}
 */
export function buildPrompt(summary) {
  return PROMPT.replace("%%prompt%%", () => summary);
}

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

/** Verdicts the client may send (see `missionVerdict` in js/adapters/AIAnalysisAdapter.js). */
const VERDICTS = ["commendation", "satisfactory", "reprimand"];

/**
 * Rating the officer opens the debrief with, per language of {@link LANGUAGE_DEFAULTS}. Written
 * here rather than by the model so the spoken and displayed rating always matches the verdict.
 * @type {Record<string, Record<string, string>>}
 */
export const VERDICT_RATINGS = {
  en: {
    commendation: "Commendation, pilot.",
    satisfactory: "Satisfactory, pilot.",
    reprimand: "Reprimand, pilot.",
  },
  nl: {
    commendation: "Eervolle vermelding, piloot.",
    satisfactory: "Voldoende, piloot.",
    reprimand: "Berisping, piloot.",
  },
  fr: {
    commendation: "Félicitations, pilote.",
    satisfactory: "Satisfaisant, pilote.",
    reprimand: "Blâme, pilote.",
  },
  de: {
    commendation: "Belobigung, Pilot.",
    satisfactory: "Zufriedenstellend, Pilot.",
    reprimand: "Verweis, Pilot.",
  },
  it: {
    commendation: "Encomio, pilota.",
    satisfactory: "Soddisfacente, pilota.",
    reprimand: "Richiamo, pilota.",
  },
  ko: {
    commendation: "표창입니다, 조종사님.",
    satisfactory: "보통입니다, 조종사님.",
    reprimand: "경고입니다, 조종사님.",
  },
  pl: {
    commendation: "Pochwała, pilocie.",
    satisfactory: "Zadowalająco, pilocie.",
    reprimand: "Nagana, pilocie.",
  },
  pt: {
    commendation: "Elogio, piloto.",
    satisfactory: "Satisfatório, piloto.",
    reprimand: "Repreensão, piloto.",
  },
  es: {
    commendation: "Felicitación, piloto.",
    satisfactory: "Satisfactorio, piloto.",
    reprimand: "Amonestación, piloto.",
  },
};

/**
 * Rating for the verdict in the player's language (missing locale → English, like the voice).
 * @param {string|null|undefined} verdict
 * @param {string|null|undefined} locale
 * @returns {string|null} null for an unknown verdict or a language without ratings.
 */
export function verdictRating(verdict, locale) {
  if (!verdict || !VERDICTS.includes(verdict)) return null;
  const tag = typeof locale === "string" && locale.trim() ? locale.trim() : "en";
  const lang = tag.replace(/_/g, "-").split("-")[0].toLowerCase();
  const ratings = VERDICT_RATINGS[lang];
  return ratings ? ratings[verdict] : null;
}

/** Officer emoji every rated headline starts with (the model sometimes drops it). */
const HEADLINE_EMOJI = "👨‍🚀";

/**
 * Put the rating in front of the model's `feedback` headline, after the officer emoji, so the
 * screen shows what the officer says. Any emoji the model led with is replaced by
 * {@link HEADLINE_EMOJI}, and a rating the model already wrote is not repeated. Returns the
 * analysis unchanged when it is not JSON with feedback.
 * @param {string} analysisText Analysis JSON string from Bedrock.
 * @param {string} rating
 * @returns {string}
 */
export function withRating(analysisText, rating) {
  try {
    const parsed = JSON.parse(analysisText);
    if (!parsed || typeof parsed.feedback !== "string") return analysisText;
    const text = parsed.feedback
      .replace(/^(?:\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}]|\u200d|\uFE0F|\s)+/u, "")
      .trim();
    const rated = text.toLowerCase().startsWith(rating.toLowerCase()) ? text : `${rating} ${text}`;
    parsed.feedback = `${HEADLINE_EMOJI} ${rated.trim()}`;
    return JSON.stringify(parsed);
  } catch {
    return analysisText;
  }
}

/** @type {Record<string, string>} */
const XML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };

/** @param {string} text @returns {string} */
const escapeXml = (text) => text.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);

/**
 * SSML for the spoken headline: the rating slightly slower, then a pause, then the rest, so the
 * verdict frames the line even though generative voices cannot act out tone. Uses only tags the
 * generative engine supports (`prosody rate` around a full sentence, `break`).
 * @param {string} text Speakable headline (see {@link speakableText}).
 * @param {string|null} rating
 * @returns {{ Text: string, TextType?: "ssml" }} Plain text when the headline has no rating.
 */
export function speechInput(text, rating) {
  if (!rating || !text.startsWith(rating)) return { Text: text };
  const rest = text.slice(rating.length).trim();
  const lead = `<prosody rate="90%">${escapeXml(rating)}</prosody>`;
  return {
    Text: `<speak>${lead}${rest ? `<break time="400ms"/>${escapeXml(rest)}` : ""}</speak>`,
    TextType: "ssml",
  };
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
 * Separate the optional `speech` request from the run summary so it never reaches the prompt,
 * and read the player's locale and the client's `verdict` (which stays in the prompt).
 * @param {string} body Raw POST body (JSON run summary, optionally with `verdict` and
 *   `speech: { voice }`).
 * @returns {{ prompt: string, voice: string|null, locale: string|null, verdict: string|null }}
 */
export function splitRequest(body) {
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== "object") {
      return { prompt: body, voice: null, locale: null, verdict: null };
    }
    const { speech, ...summary } = parsed;
    const voice = speech && typeof speech.voice === "string" ? speech.voice : null;
    const locale =
      summary.device && typeof summary.device.locale === "string" ? summary.device.locale : null;
    const verdict = VERDICTS.includes(summary.verdict) ? summary.verdict : null;
    const prompt = "speech" in parsed ? JSON.stringify(summary) : body;
    return { prompt, voice, locale, verdict };
  } catch {
    return { prompt: body, voice: null, locale: null, verdict: null };
  }
}

/**
 * Add `speech: { voice, gender, format, audio }` (base64 MP3 of the spoken `feedback`) to the
 * analysis JSON. A headline that starts with `rating` is spoken as SSML (see {@link speechInput}).
 * Returns the analysis unchanged when there is no feedback, no voice for the locale, or Polly
 * fails – speech is optional and must never break the debrief.
 * @param {string} analysisText Analysis JSON string (after {@link withRating}).
 * @param {string} voice Requested gender ("female" | "male").
 * @param {string|null} locale
 * @param {string|null} [rating] Rating at the start of the headline, if any.
 * @returns {Promise<string>}
 */
export async function withSpeech(analysisText, voice, locale, rating = null) {
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
        ...speechInput(text, rating),
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
          const { prompt, voice, locale, verdict } = splitRequest(body);
          console.log("Bedrock request: ", prompt);
          response = await analysis(prompt);
          console.log("Bedrock response: ", response);
          const rating = verdictRating(verdict, locale);
          if (rating) response = withRating(response, rating);
          if (voice) response = await withSpeech(response, voice, locale, rating);
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
  const prompt = buildPrompt(body);

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

  responseText = responseText
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");

  return responseText;
}
