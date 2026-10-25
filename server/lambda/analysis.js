import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

const bedrockClient = new BedrockRuntimeClient({
  region: "us-west-2",
  maxAttempts: 3,
});

const pollyClient = new PollyClient({
  region: "us-west-2",
  maxAttempts: 2,
});

const secretsClient = new SecretsManagerClient({
  region: "us-west-2",
  maxAttempts: 2,
});

/**
 * System prompts: the two recurring debrief characters ({@link PERSONAS}). Kept in code (with {@link PROMPT}) rather than an
 * environment variable because Lambda caps all environment variables at 4 KB combined.
 */
const GAME_INTRO =
  "AI HORIZON is an arcade space shooter: a pilot has 90 seconds to collect stars and destroy asteroids, and one asteroid collision ends the mission. After every mission Commander Vega or Captain “Altair” Straehle radios the pilot a short debrief; they take turns.";
const SHARED_RULES = `You know this pilot. The game tells you what changed since their earlier missions ("story hooks"), including what was said in the last debrief; noticing it is what makes the debriefs worth waiting for.
You speak straight to the pilot in short spoken sentences for a text-to-speech voice. Never invent numbers, events, or history: use only the facts you are given.`;

/**
 * The two debrief commanders (the client picks one per mission and sends `commander`): a system
 * prompt each, the voice that keeps each character's voice consistent (Altair's custom ElevenLabs
 * voice `elevenlabs`, see {@link ELEVENLABS}; otherwise, and as his fallback, a Polly voice of the
 * `voice` gender), and the headline's shape and style, so they also sound different on paper:
 * Vega clipped (2 sentences), Altair longer and brasher (3-4). `headline.sentences` /
 * `headline.chars` are enforced by {@link tidyHeadline}.
 * @typedef {{ shape: string, style: string, sentences: number, chars: number }} HeadlineShape
 * @typedef {{ system: string, voice: "female"|"male", elevenlabs?: string, headline: HeadlineShape }} Persona
 * @type {Record<"vega"|"altair", Persona>}
 */
export const PERSONAS = {
  vega: {
    voice: "female",
    headline: {
      shape: "exactly 2 sentences, at most 22 words in total",
      style:
        "Your voice: clipped, dry and understated, like a veteran on the radio; no exclamation marks, no slang.",
      sentences: 2,
      chars: 180,
    },
    system: `You are Commander Vega (she/her), the veteran squadron commander. ${GAME_INTRO}
Captain Straehle (he/him), call sign “Altair”, is the squadron's hotshot ace; on the radio you call him Altair. You respect his flying and roll your eyes at his showing off.
Personality: a gruff but warm mentor with dry humour who drills survival and discipline. Proud of real progress, impatient with carelessness, never a cheerleader, never cruel.
${SHARED_RULES}`,
  },
  altair: {
    voice: "male",
    elevenlabs: "AYZwqKNJgPfbTjp3GbCG",
    headline: {
      shape: "3 or 4 short, punchy sentences, at most 45 words in total",
      style:
        '3-4. Then 1 or 2 sentences of pure swagger, like a cocky ace on the radio rather than a coach: a dare with a number to beat, a boast, a bit of pilot slang, or a playful jab at Commander Vega. Leave advice to the techniques. Exclamation marks are fine. The tone, never to be copied: "Vega calls that luck. I call it a warm-up." "8200 to beat. Bring it, hotshot!"',
      sentences: 4,
      chars: 300,
    },
    system: `You are Captain Straehle (he/him), call sign “Altair”, the squadron's hotshot ace. On the radio you go by Altair; you give your full name only when you introduce yourself. ${GAME_INTRO}
Commander Vega (she/her) is the squadron's gruff veteran mentor; you respect her and sometimes tease her, but never undermine her.
Personality: an upbeat, competitive, quick-witted ace who lives for scores, records, bonus asteroids, style and the leaderboard. You hype real achievements and turn setbacks into a challenge; never cruel, never fake.
${SHARED_RULES}`,
  },
};

/** Commander used when the request names none (older clients). */
const DEFAULT_COMMANDER = "vega";

/** System prompt of the original single commander, kept for compatibility. */
export const SYSTEM_PROMPT = PERSONAS.vega.system;

/**
 * Bedrock user prompt; `%%fact%%` (see `headlineFact`), `%%reaction%%` and `%%hooks%%` (see
 * `headlineReaction` / the client's story hooks) shape the headline and `%%prompt%%` is the run
 * summary JSON, including the client's `verdict` and `insights` (see `missionVerdict` /
 * `missionInsights` in js/adapters/AIAnalysisAdapter.js). The client shows each weakness as its
 * exact fact followed by the model's `technique-N`; its offline debrief uses the same techniques
 * in English. The answer comes back through the {@link DEBRIEF_TOOL} call.
 */
export const PROMPT = `Write the debrief for the mission below.
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
<headline rules - start>
The game shows a rating ("Commendation, pilot.", "Satisfactory, pilot." or "Reprimand, pilot.", from the verdict in the mission details) in front of your headline, so never write a rating, greeting, or emoji. The headline is %%shape%%:
1. State this fact, with its number as digits: %%fact%%.
2. %%reaction%%
%%style%%
Tone by verdict: commendation – genuine pride in what the pilot just did, no advice; satisfactory – credit, then a challenge; reprimand – firm but motivating; no verdict – choose from survivedSeconds.
Do not call the pilot "pilot" again (the rating already does). No questions, no clichés ("Great job", "Keep it up", "Stay in the fight", "The fleet salutes you").
<headline rules - end>
<story hooks - start>
%%hooks%%
<story hooks - end>
<mission details - start>
%%prompt%%
<mission details - end>
Write everything in %%language%% (the facts and hooks above are in English for you to translate), as a native speaker would: correct grammatical gender, case and agreement. Every number from the facts and hooks stays in digits, including counts and ordinals (3rd → 3e, 3., 3번째), never spelled out ("Trois", "Fourth"); words such as "first" and "last" are fine. Keep one register throughout; in Korean end every sentence politely (-습니다, -ㅂ니다, -요), never in 반말 (-어, -지, -다, -냐), even when cocky. Address the pilot consistently, informally where the language has a formal and an informal "you" (tu, du, tú). Call things by their names in the scoring rules, fully translated with no English words left (stars, bonus stars, asteroids, hardened asteroids, bonus asteroids), never by colour. Each technique has less than 12 words; give one per weakness and leave out the rest. Answer with the debrief tool.`;

/** @param {number} n */
const TECHNIQUE_DESCRIPTION = (n) =>
  `Technique for weakness ${n}: one short order in your own words, under 12 words, one sentence, no semicolons.`;

/**
 * Tool the model must call (Converse `toolChoice`), so every model returns the debrief as
 * structured input instead of prose around JSON.
 */
export const DEBRIEF_TOOL = {
  toolSpec: {
    name: "debrief",
    description: "Send the mission debrief to the pilot.",
    inputSchema: {
      json: {
        type: "object",
        properties: {
          draft: {
            type: "string",
            description: "A first draft of the headline, following the headline rules.",
          },
          feedback: {
            type: "string",
            description:
              "The final headline: the draft proofread by a native speaker of the pilot's language (grammatical gender, case, agreement, one consistent register) with every number in digits; same length rules, no rating or emoji.",
          },
          "technique-1": { type: "string", description: TECHNIQUE_DESCRIPTION(1) },
          "technique-2": { type: "string", description: TECHNIQUE_DESCRIPTION(2) },
          "technique-3": { type: "string", description: TECHNIQUE_DESCRIPTION(3) },
        },
        required: ["draft", "feedback"],
      },
    },
  },
};

/**
 * Imagery for the headline's second sentence when there is no story hook; one is picked at random
 * per debrief so repeat runs with the same verdict don't read alike.
 */
export const HEADLINE_IMAGERY = [
  "engines and thrusters",
  "the asteroid belt",
  "the hangar and the ground crew",
  "medals and the fleet watching",
  "radar and targeting computers",
  "comets and shooting stars",
  "the next sortie at dawn",
  "mission control on the radio",
  "shields and armor plating",
  "afterburners and raw speed",
  "the squadron's history books",
];

/** Most story hooks passed to the model, and their longest accepted length (client input). */
const MAX_HOOKS = 5;
const MAX_HOOK_CHARS = 200;

/**
 * Story hooks from the request (the client's comparisons with the pilot's earlier missions,
 * most interesting first), limited in count and length since they come from the client.
 * @param {unknown} history The request's `history` (`{ mission?: number, hooks?: string[] }`).
 * @returns {string[]}
 */
export function storyHooks(history) {
  const hooks = history && typeof history === "object" ? /** @type {any} */ (history).hooks : null;
  if (!Array.isArray(hooks)) return [];
  return hooks
    .filter((h) => typeof h === "string" && h.trim())
    .slice(0, MAX_HOOKS)
    .map((h) => h.trim().slice(0, MAX_HOOK_CHARS));
}

/**
 * What the headline's second sentence does: react to the first (most interesting) story hook,
 * quoted in the instruction because models otherwise pick a lesser one from the list, or,
 * without hooks, make a remark built on random imagery.
 * @param {string[]} hooks
 * @param {() => number} [random] Source of [0, 1) numbers (injectable for tests).
 * @returns {string}
 */
export function headlineReaction(hooks, random = Math.random) {
  if (hooks.length) {
    return `React to this, as someone who remembers this pilot's earlier missions, including its number when it has one: ${hooks[0]}`;
  }
  const imagery = HEADLINE_IMAGERY[Math.floor(random() * HEADLINE_IMAGERY.length)];
  return `Make one vivid, specific remark about this mission, built on this imagery: ${imagery}.`;
}

/** Bonus asteroids that make a commendation about them (mirrors the client's VERDICT_BONUS_ASTEROIDS). */
const FACT_BONUS_ASTEROIDS = 6;

/**
 * The fact the headline opens with, worked out here because the model often picks or computes
 * the wrong one from the summary: seconds survived (reprimand), seconds left when going down in
 * the finale or the full mission flown (satisfactory), bonus asteroids or shots fired accuracy
 * (commendation).
 * @param {any} summary Parsed run summary.
 * @param {string|null} verdict
 * @returns {string} English description for the prompt; the model words it in the player's language.
 */
export function headlineFact(summary, verdict) {
  const timer = (summary && summary.timer) || {};
  const stats = (summary && summary.stats) || {};
  const total = Number.isFinite(timer.totalSeconds) ? timer.totalSeconds : 90;
  const survived = timer.survivedSeconds;
  if (!Number.isFinite(survived)) return "the most important number in the mission details";
  if (verdict === "commendation") {
    const bonus = stats.bonusAsteroidsKilled ?? 0;
    if (bonus >= FACT_BONUS_ASTEROIDS) {
      return `the pilot destroyed ${bonus} of ${stats.bonusAsteroidsEncountered ?? 8} bonus asteroids`;
    }
    return `the pilot hit ${Math.round(100 * (stats.shotsFiredAccuracy ?? 0))}% of their shots`;
  }
  if (survived >= total) return `the pilot flew the full ${total} seconds`;
  if (verdict === "satisfactory") {
    return `the pilot went down in the finale with ${total - survived} seconds left`;
  }
  return `the pilot survived ${survived} seconds`;
}

/**
 * The player's language spelled out for the prompt (e.g. "German (Germany)"); models follow a
 * named language more reliably than a locale code buried in the JSON.
 * @param {string|null|undefined} locale BCP 47 tag; missing → English.
 * @returns {string}
 */
export function languageName(locale) {
  const tag = typeof locale === "string" && locale.trim() ? locale.trim().replace(/_/g, "-") : "en";
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(tag) || "English";
  } catch {
    return "English";
  }
}

/**
 * Fill {@link PROMPT}. Replacer functions keep `$` sequences literal.
 * @param {string} summary Run summary JSON (without the `speech` / `history` requests).
 * @param {string} fact Fact the headline opens with (see {@link headlineFact}).
 * @param {string} reaction What the second sentence does (see {@link headlineReaction}).
 * @param {string[]} hooks Story hooks (see {@link storyHooks}).
 * @param {string} [language] See {@link languageName}.
 * @param {HeadlineShape} [headline] The speaking commander's headline shape (see {@link PERSONAS}).
 * @returns {string}
 */
export function buildPrompt(
  summary,
  fact,
  reaction,
  hooks,
  language = "English",
  headline = PERSONAS.vega.headline
) {
  const hookList = hooks.length ? hooks.map((h) => `- ${h}`).join("\n") : "none";
  return PROMPT.replace("%%shape%%", () => headline.shape)
    .replace("%%fact%%", () => fact)
    .replace("%%reaction%%", () => reaction)
    .replace("%%style%%", () => headline.style)
    .replace("%%hooks%%", () => hookList)
    .replace("%%prompt%%", () => summary)
    .replace("%%language%%", () => language);
}

/** Longest headline (after emoji removal and the rating) sent to the voice. */
const MAX_SPEECH_CHARS = 340;

/**
 * Enforce the headline's shape when a model overruns it: at most `sentences` sentences, then at
 * most `chars` characters (cut at a word boundary with an ellipsis). Defaults to Vega's shape.
 * @param {string} text
 * @param {{ sentences?: number, chars?: number }} [shape]
 * @returns {string}
 */
export function tidyHeadline(text, shape = {}) {
  const { sentences = PERSONAS.vega.headline.sentences, chars = PERSONAS.vega.headline.chars } =
    shape;
  const clean = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  // Sentence ends: . ! ? before a space or the end (not right after a digit, so ordinals such as
  // German "4." stay inside their sentence), or CJK full-width stops.
  const ends = [...clean.matchAll(/(?<!\d)[.!?]+["'”’)]*(?=\s|$)|[。！？]+/gu)].map(
    (m) => (m.index ?? 0) + m[0].length
  );
  let out = ends.length > sentences ? clean.slice(0, ends[sentences - 1]).trim() : clean;
  if (out.length > chars) {
    const cut = out.slice(0, chars);
    const space = cut.lastIndexOf(" ");
    out = `${(space > 40 ? cut.slice(0, space) : cut).replace(/[\s,;:–-]+$/u, "")}…`;
  }
  return out;
}

/**
 * Tidy the `feedback` headline of an analysis JSON string (see {@link tidyHeadline}) and drop the
 * model's unproofread `draft`; returns the input unchanged when it is not JSON with feedback.
 * @param {string} analysisText
 * @param {{ sentences?: number, chars?: number }} [shape] The commander's headline shape.
 * @returns {string}
 */
export function withTidyHeadline(analysisText, shape) {
  try {
    const parsed = JSON.parse(analysisText);
    if (!parsed || typeof parsed.feedback !== "string") return analysisText;
    delete parsed.draft;
    parsed.feedback = tidyHeadline(parsed.feedback, shape);
    return JSON.stringify(parsed);
  } catch {
    return analysisText;
  }
}

/**
 * Amazon Polly generative voices (all available in us-west-2), one per gender where Polly offers
 * one. Locales missing a gender use their language default's; unlisted languages get no Polly
 * speech.
 * @type {Record<string, { female?: string, male?: string }>}
 */
export const GENERATIVE_VOICES = {
  "en-US": { female: "Ruth", male: "Matthew" },
  "en-GB": { female: "Amy", male: "Brian" },
  "en-AU": { female: "Olivia", male: "Russell" },
  "en-IN": { female: "Kajal", male: "Arjun" },
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
  "ko-KR": { female: "Seoyeon", male: "Hyunduk" },
  "pl-PL": { female: "Ola" },
  "pt-BR": { female: "Camila", male: "Leo" },
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
 * Pick a generative voice of the requested gender for the player's locale: the exact locale's,
 * else its language default's (so a male commander in en-IE speaks with en-US Matthew). A
 * commander never switches gender, so there is no voice when the language has none of that gender.
 * Missing locale defaults to en-US (Bedrock then answers in English).
 * @param {string|null|undefined} locale BCP 47 tag, e.g. "de-DE".
 * @param {string} gender "female" or "male".
 * @returns {{ voiceId: string, gender: "female"|"male" }|null} null when no voice exists.
 */
export function selectVoice(locale, gender) {
  if (gender !== "female" && gender !== "male") return null;
  const tag = typeof locale === "string" && locale.trim() ? locale.trim() : "en-US";
  const [lang = "", region = ""] = tag.replace(/_/g, "-").split("-");
  const exact = region ? `${lang.toLowerCase()}-${region.toUpperCase()}` : "";
  const fallback = /** @type {Record<string, string>} */ (LANGUAGE_DEFAULTS)[lang.toLowerCase()];
  for (const voices of [GENERATIVE_VOICES[exact], fallback && GENERATIVE_VOICES[fallback]]) {
    const voiceId = voices && voices[gender];
    if (voiceId) return { voiceId, gender };
  }
  return null;
}

/**
 * The ISO 639-1 language of a BCP 47 locale ("de_AT" → "de"); missing locale → English, like the
 * voice.
 * @param {string|null|undefined} locale
 * @returns {string}
 */
const localeLanguage = (locale) =>
  (typeof locale === "string" && locale.trim() ? locale.trim() : "en")
    .replace(/_/g, "-")
    .split("-")[0]
    .toLowerCase();

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
  const ratings = VERDICT_RATINGS[localeLanguage(locale)];
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
 * Spellings the voices read better than the real ones (speech only; the headline on screen keeps
 * the real spelling): Captain Straehle's surname with its final e sounded.
 * @type {[RegExp, string][]}
 */
const SPOKEN_SPELLINGS = [[/\bStraehle\b/g, "Straehleh"]];

/**
 * Headline text suitable for speech: emoji removed, whitespace collapsed, length capped, and
 * {@link SPOKEN_SPELLINGS} applied.
 * @param {unknown} text
 * @returns {string}
 */
export function speakableText(text) {
  return SPOKEN_SPELLINGS.reduce(
    (spoken, [word, spelling]) => spoken.replace(word, spelling),
    String(text ?? "")
      .replace(/\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}]|\u200d|\uFE0F/gu, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_SPEECH_CHARS)
  );
}

/**
 * Separate the optional `speech` and `history` requests from the run summary so they never
 * reach the mission details, and read the player's locale, the client's `verdict` (which stays
 * in the prompt) and the story hooks (see {@link storyHooks}).
 * @param {string} body Raw POST body (JSON run summary, optionally with `verdict`,
 *   `speech: { voice }` and `history: { mission, hooks }`).
 * @returns {{ prompt: string, voice: string|null, locale: string|null, verdict: string|null, hooks: string[] }}
 */
export function splitRequest(body) {
  const fallback = { prompt: body, voice: null, locale: null, verdict: null, hooks: [] };
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== "object") return fallback;
    const { speech, history, commander: requested, ...summary } = parsed;
    const commander = Object.hasOwn(PERSONAS, requested) ? requested : DEFAULT_COMMANDER;
    const voice = speech && typeof speech.voice === "string" ? speech.voice : null;
    const locale =
      summary.device && typeof summary.device.locale === "string" ? summary.device.locale : null;
    const verdict = VERDICTS.includes(summary.verdict) ? summary.verdict : null;
    const stripped = "speech" in parsed || "history" in parsed || "commander" in parsed;
    const prompt = stripped ? JSON.stringify(summary) : body;
    return { prompt, voice, locale, verdict, hooks: storyHooks(history), commander };
  } catch {
    return fallback;
  }
}

/**
 * ElevenLabs text to speech for commanders with a custom voice ({@link PERSONAS} `elevenlabs`):
 * the model, the MP3 format (64 kbps is plenty for the game's 300-3400 Hz radio voice and halves
 * the response), and how long to wait before falling back to Polly (the client gives the whole
 * debrief 15 s). The API key comes from the Secrets Manager secret named by the
 * `ELEVENLABS_SECRET_ID` env var, JSON `{ apiToken, apiTokenRegion }`; the region picks the API
 * host ({@link ELEVENLABS_HOSTS}). Without the env var those commanders speak with Polly.
 */
export const ELEVENLABS = { model: "eleven_v4", format: "mp3_44100_64", timeoutMs: 8000 };

/** ElevenLabs API host per `apiTokenRegion`; other regions use the global host. */
const ELEVENLABS_HOSTS = /** @type {Record<string, string>} */ ({
  us: "https://api.us.elevenlabs.io",
  eu: "https://api.eu.residency.elevenlabs.io",
  in: "https://api.in.residency.elevenlabs.io",
  sg: "https://api.sg.residency.elevenlabs.io",
});

/**
 * The ElevenLabs key and host, read once per container (per secret); a failed read is retried on
 * the next request.
 * @type {{ id: string, value: Promise<{ key: string, host: string }> }|null}
 */
let elevenLabsSecret = null;

/** @returns {Promise<{ key: string, host: string }|null>} null when no secret is configured. */
function elevenLabsCredentials() {
  const id = process.env.ELEVENLABS_SECRET_ID;
  if (!id) return Promise.resolve(null);
  if (elevenLabsSecret?.id !== id) {
    const value = secretsClient.send(new GetSecretValueCommand({ SecretId: id })).then((res) => {
      const { apiToken, apiTokenRegion } = JSON.parse(res.SecretString || "{}");
      if (!apiToken) throw new Error("ElevenLabs secret has no apiToken");
      return {
        key: String(apiToken),
        host: ELEVENLABS_HOSTS[apiTokenRegion] || "https://api.elevenlabs.io",
      };
    });
    const entry = { id, value };
    value.catch(() => {
      if (elevenLabsSecret === entry) elevenLabsSecret = null;
    });
    elevenLabsSecret = entry;
  }
  return elevenLabsSecret.value;
}

/** @typedef {{ voice: string, gender: string, format: "mp3", audio: string }} Speech */

/**
 * The headline spoken by an ElevenLabs voice ({@link ELEVENLABS}) in the player's language, or
 * null without a key or when ElevenLabs fails or is too slow. Plain text: the model takes no SSML.
 * @param {string} text Speakable headline.
 * @param {string} voiceId
 * @param {"female"|"male"} gender The voice's gender, reported like Polly's.
 * @param {string|null} locale
 * @returns {Promise<Speech|null>}
 */
async function elevenLabsSpeech(text, voiceId, gender, locale) {
  try {
    const credentials = await elevenLabsCredentials();
    if (!credentials) return null;
    const url = `${credentials.host}/v1/text-to-speech/${voiceId}?output_format=${ELEVENLABS.format}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "xi-api-key": credentials.key, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: ELEVENLABS.model,
        language_code: localeLanguage(locale),
      }),
      signal: AbortSignal.timeout(ELEVENLABS.timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    console.log("ElevenLabs speech: ", voiceId, bytes.length, "bytes");
    return { voice: voiceId, gender, format: "mp3", audio: bytes.toString("base64") };
  } catch (error) {
    console.error("ElevenLabs error:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * The headline spoken by a Polly generative voice of `gender` (see {@link selectVoice}); a
 * headline that starts with `rating` is spoken as SSML (see {@link speechInput}). Null when the
 * locale has no such voice or Polly fails.
 * @param {string} text Speakable headline.
 * @param {"female"|"male"} gender
 * @param {string|null} locale
 * @param {string|null} rating
 * @returns {Promise<Speech|null>}
 */
async function pollySpeech(text, gender, locale, rating) {
  const selected = selectVoice(locale, gender);
  if (!selected) return null;
  try {
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
    console.log("Polly speech: ", selected.voiceId, bytes.length, "bytes");
    return {
      voice: selected.voiceId,
      gender: selected.gender,
      format: "mp3",
      audio: Buffer.from(bytes).toString("base64"),
    };
  } catch (error) {
    console.error("Polly error:", error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Add `speech: { voice, gender, format, audio }` (base64 MP3 of the spoken `feedback`) to the
 * analysis JSON, in the commander's voice: the custom ElevenLabs voice when the persona has one
 * ({@link elevenLabsSpeech}), else (or when it fails) Polly ({@link pollySpeech}). Returns the
 * analysis unchanged when there is no feedback or no voice speaks it – speech is optional and must
 * never break the debrief.
 * @param {string} analysisText Analysis JSON string (after {@link withRating}).
 * @param {Pick<Persona, "voice"|"elevenlabs">} persona The speaking commander's voices.
 * @param {string|null} locale
 * @param {string|null} [rating] Rating at the start of the headline, if any.
 * @returns {Promise<string>}
 */
export async function withSpeech(analysisText, persona, locale, rating = null) {
  let parsed;
  try {
    parsed = JSON.parse(analysisText);
  } catch {
    return analysisText;
  }
  const text = speakableText(parsed && parsed.feedback);
  if (!text) return analysisText;
  const speech =
    (persona.elevenlabs &&
      (await elevenLabsSpeech(text, persona.elevenlabs, persona.voice, locale))) ||
    (await pollySpeech(text, persona.voice, locale, rating));
  if (!speech) return analysisText;
  parsed.speech = speech;
  return JSON.stringify(parsed);
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
          const { prompt, voice, locale, verdict, hooks, commander } = splitRequest(body);
          console.log("Bedrock request: ", prompt, hooks);
          response = withTidyHeadline(
            await analysis(prompt, verdict, hooks, commander),
            PERSONAS[commander].headline
          );
          console.log("Bedrock response: ", response);
          const rating = verdictRating(verdict, locale);
          if (rating) response = withRating(response, rating);
          // Each commander keeps their own voice, whatever gender the client asked for.
          if (voice) {
            response = await withSpeech(response, PERSONAS[commander], locale, rating);
          }
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
 * The debrief JSON string from a Converse response: the forced {@link DEBRIEF_TOOL} call's input,
 * or, if a model answered in text anyway, the outermost `{…}` of that text (code fences and any
 * prose around it dropped).
 * @param {any} response Converse response.
 * @returns {string}
 */
export function debriefFromResponse(response) {
  const content = (response && response.output && response.output.message?.content) || [];
  const call = content.find((/** @type {any} */ c) => c && c.toolUse && c.toolUse.input);
  if (call) return JSON.stringify(call.toolUse.input);
  const text = content
    .map((/** @type {any} */ c) => (c && typeof c.text === "string" ? c.text : ""))
    .join("")
    .trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : text;
}

/**
 * Analyze a game summary with the Bedrock Converse API (model-agnostic: `MODEL_ID` can be any
 * Converse model that supports tool use) and return the debrief JSON string.
 * @param {string} body - The game summary to analyze
 * @param {string|null} [verdict] The client's verdict (picks the headline fact).
 * @param {string[]} [hooks] Story hooks from the client (see {@link storyHooks}).
 * @param {"vega"|"altair"} [commander] Which commander's persona speaks (see {@link PERSONAS}).
 */
async function analysis(body, verdict = null, hooks = [], commander = DEFAULT_COMMANDER) {
  let summary = null;
  try {
    summary = JSON.parse(body);
  } catch {
    /* not JSON: the fact falls back to a generic description */
  }
  const locale = summary && summary.device ? summary.device.locale : null;
  const prompt = buildPrompt(
    body,
    headlineFact(summary, verdict),
    headlineReaction(hooks),
    hooks,
    languageName(locale),
    PERSONAS[commander].headline
  );
  const response = await bedrockClient.send(
    new ConverseCommand({
      modelId: process.env.MODEL_ID,
      system: [{ text: PERSONAS[commander].system }],
      messages: [{ role: "user", content: [{ text: prompt }] }],
      inferenceConfig: { maxTokens: 600, temperature: 1.0 },
      toolConfig: { tools: [DEBRIEF_TOOL], toolChoice: { tool: { name: "debrief" } } },
    })
  );
  return debriefFromResponse(response);
}
