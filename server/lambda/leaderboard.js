import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";

const client = new DynamoDBClient({ region: "us-west-2" });
const docClient = DynamoDBDocumentClient.from(client);
const sns = new SNSClient({ region: "us-west-2" });

const TABLE_NAME = "ai-horizon-leaderboard";
export const MAX_LEADERBOARD_ENTRIES = 10;
/** Upper bound for a plausible 90-second run (best real runs are ~15k). */
export const MAX_SCORE = 100000;
/** Cap for the optional `game-summary` / `ai-analysis` JSON strings stored with an entry. */
export const MAX_TEXT_LENGTH = 4000;
const TEXT_FIELDS = ["game-summary", "ai-analysis"];
const MAX_WRITE_ATTEMPTS = 3;
/** At most one "rejected submission" alert per warm container in this window (anti-flood). */
const REJECTION_ALERT_COOLDOWN_MS = 10 * 60 * 1000;
let lastRejectionAlertAt = 0;

/**
 * Game rules mirrored from js/constants.js (CONFIG.GAME / CONFIG.ASTEROID) for run-summary checks.
 * The Lambda deploys as a single file; tests/leaderboard.runSummary.test.js keeps these in sync.
 */
export const RULES = Object.freeze({
  TIMER_SECONDS: 90,
  FINALE_WINDOW_SECONDS: 15,
  STAR_SCORE: 25,
  STAR_SCORE_BONUS: 50,
  ASTEROID_SCORE: 10,
  ASTEROID_SCORE_HARDENED: 100,
  ASTEROID_SCORE_BONUS: 250,
  MILESTONE_THRESHOLD: 1000,
  MILESTONE_POINTS: 250,
  SHOT_COOLDOWN_MS: 200,
  HARDENED_HITS: 10,
  UPGRADED_HITS_FACTOR: 0.5,
  /** Highest spawn rates (desktop, per second); mobile and low-power profiles only go lower. */
  STAR_SPAWN_RATE_MAX: 2,
  ASTEROID_SPAWN_RATE_MAX: 4,
  STARS_BEFORE_BONUS: 4,
  ASTEROIDS_BEFORE_HARDENED: 4,
  BONUS_ASTEROID_COUNT: 8,
  BONUS_INTERVAL_SECONDS: 10,
});

/**
 * Initials rejected for the public leaderboard. The Lambda deploys as a single file, so this list
 * is duplicated in js/utils/initials.js (client-side feedback); a unit test keeps them in sync.
 */
export const BLOCKED_INITIALS = new Set([
  "ASS",
  "AZZ",
  "BCH",
  "CCK",
  "CLT",
  "CNT",
  "COC",
  "COK",
  "CUM",
  "CUN",
  "DCK",
  "DIC",
  "DIK",
  "FAG",
  "FAP",
  "FCK",
  "FKU",
  "FUC",
  "FUK",
  "FUQ",
  "HOE",
  "JIZ",
  "JZZ",
  "KKK",
  "KUM",
  "KYS",
  "NAZ",
  "NGA",
  "NGR",
  "NIG",
  "SEX",
  "SHT",
  "SLT",
  "SPK",
  "TIT",
  "TWT",
  "VAG",
  "WTF",
  "XXX",
]);

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * @param {number} statusCode
 * @param {any} body
 */
const respond = (statusCode, body) => ({
  statusCode,
  headers: HEADERS,
  body: JSON.stringify(body),
});

/**
 * @param {unknown} id
 * @returns {boolean} True for 1-3 upper-case letters that are not on the blocklist.
 */
export function isAllowedInitials(id) {
  return typeof id === "string" && /^[A-Z]{1,3}$/.test(id) && !BLOCKED_INITIALS.has(id);
}

/**
 * Validate an untrusted client submission and build the entry to store. The date is assigned
 * server-side (UTC); unknown fields are dropped and oversized text fields are omitted.
 * @param {any} raw
 * @returns {{entry: Record<string, any>, error?: undefined} | {entry?: undefined, error: string}}
 */
export function validateEntry(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "Expected a single entry" };
  }
  if (!isAllowedInitials(raw.id)) return { error: "Invalid initials" };
  if (!Number.isInteger(raw.score) || raw.score < 1 || raw.score > MAX_SCORE) {
    return { error: "Invalid score" };
  }
  /** @type {Record<string, any>} */
  const entry = { id: raw.id, score: raw.score, date: new Date().toISOString().slice(0, 10) };
  if (typeof raw.accuracy === "number" && raw.accuracy >= 0 && raw.accuracy <= 1) {
    entry.accuracy = raw.accuracy;
  }
  for (const key of TEXT_FIELDS) {
    const value = raw[key];
    if (typeof value === "string" && value.length > 0 && value.length <= MAX_TEXT_LENGTH) {
      entry[key] = value;
    }
  }
  return { entry };
}

/**
 * Upper bound for a Poisson spawn count (`rate` per second over `seconds`): mean + 6 sigma + slack.
 * @param {number} rate
 * @param {number} seconds
 */
const spawnCap = (rate, seconds) => rate * seconds + 6 * Math.sqrt(rate * seconds) + 10;

/**
 * Check that the entry's `game-summary` (built by `AIHorizon._logRunSummary`) describes a run
 * the game could have produced, and that it adds up to the submitted score:
 * - counts are non-negative integers, kills/collections never exceed what spawned, spawn counts
 *   fit the spawn rates and variant cadence (every 5th star / asteroid), shots fit the fire cooldown,
 *   and each hardened kill took at least the minimum number of hits;
 * - the base score is rebuilt from item points + finale bonus + milestone bonuses, then the
 *   accuracy bonus `round(base * min(1, hits / shots))` is applied, as in ScoringManager.
 * This cannot prove a run happened (a careful forger can build a consistent summary), but it rejects
 * edited scores and impossible stats.
 * @param {Record<string, any>} entry Validated entry (score already bounded).
 * @returns {string|null} Rejection reason, or null when the summary is consistent.
 */
export function checkRunSummary(entry) {
  let summary = null;
  try {
    summary = JSON.parse(entry["game-summary"]);
  } catch {
    /* reported below */
  }
  const { timer, score, stats } = summary || {};
  if (!timer || !score || !stats) return "missing run summary";

  const counts = {
    seconds: timer.survivedSeconds,
    shots: stats.shotsFiredTotal,
    hits: stats.shotsFiredHitTarget,
    starsSeen: stats.regularStarsEncountered,
    stars: stats.regularStarsCollected,
    redStarsSeen: stats.bonusStarsEncountered,
    redStars: stats.bonusStarsCollected,
    asteroidsSeen: stats.regularAsteroidsEncountered,
    rocks: stats.regularAsteroidsKilled,
    planetsSeen: stats.hardenedAsteroidsEncountered,
    planets: stats.hardenedAsteroidsKilled,
    bonusSeen: stats.bonusAsteroidsEncountered,
    bonus: stats.bonusAsteroidsKilled,
    base: score.playerBaseScore,
    accuracyBonus: score.playerAccuracyBonus,
    finaleBase: score.playerBaseScoreFinale,
    finaleBonus: score.playerFinaleBonus,
  };
  if (!Object.values(counts).every((v) => Number.isInteger(v) && v >= 0)) {
    return "malformed run summary";
  }
  const { seconds, shots, hits, starsSeen, stars, redStarsSeen, redStars, asteroidsSeen } = counts;
  const { rocks, planetsSeen, planets, bonusSeen, bonus } = counts;
  const { base, accuracyBonus, finaleBase, finaleBonus } = counts;

  const R = RULES;
  if (seconds > R.TIMER_SECONDS) return "timer out of range";
  // Star / asteroid counters include their bonus / hardened variants.
  if (redStars > stars || redStarsSeen > starsSeen || redStars > redStarsSeen) return "star counts";
  if (stars - redStars > starsSeen - redStarsSeen) return "star counts";
  if (planetsSeen > asteroidsSeen || rocks > asteroidsSeen - planetsSeen) return "asteroid counts";
  if (planets > planetsSeen || bonus > planets || bonus > bonusSeen || bonusSeen > planetsSeen) {
    return "asteroid counts";
  }
  if (starsSeen > spawnCap(R.STAR_SPAWN_RATE_MAX, seconds)) return "too many stars";
  if (asteroidsSeen > spawnCap(R.ASTEROID_SPAWN_RATE_MAX, seconds)) return "too many asteroids";
  if (Math.abs(redStarsSeen - starsSeen / (R.STARS_BEFORE_BONUS + 1)) > 2) return "star cadence";
  if (Math.abs(planetsSeen - asteroidsSeen / (R.ASTEROIDS_BEFORE_HARDENED + 1)) > 2) {
    return "asteroid cadence";
  }
  const maxBonus = Math.min(
    R.BONUS_ASTEROID_COUNT,
    Math.floor(seconds / R.BONUS_INTERVAL_SECONDS) + 1
  );
  if (bonusSeen > maxBonus) return "too many bonus asteroids";
  if (shots > (seconds * 1000) / R.SHOT_COOLDOWN_MS + 5) return "too many shots";
  const minHitsPerPlanet = Math.ceil(R.HARDENED_HITS * R.UPGRADED_HITS_FACTOR);
  if (hits > shots || hits < rocks + planets * minHitsPerPlanet) return "hit counts";

  const itemPoints =
    (stars - redStars) * R.STAR_SCORE +
    redStars * R.STAR_SCORE_BONUS +
    rocks * R.ASTEROID_SCORE +
    (planets - bonus) * R.ASTEROID_SCORE_HARDENED +
    bonus * R.ASTEROID_SCORE_BONUS;
  if (finaleBonus !== finaleBase || finaleBonus > itemPoints) return "finale bonus";
  if (finaleBonus > 0 && seconds < R.TIMER_SECONDS - R.FINALE_WINDOW_SECONDS) {
    return "finale bonus";
  }
  // Milestones: every threshold crossed by item points pays a bonus; thresholds crossed by the
  // bonuses themselves do not, so the count lies between half and all of the thresholds reached.
  const milestones = (base - itemPoints - finaleBonus) / R.MILESTONE_POINTS;
  const thresholds = Math.floor(base / R.MILESTONE_THRESHOLD);
  if (!Number.isInteger(milestones) || milestones < thresholds / 2 || milestones > thresholds) {
    return "base score does not match stats";
  }
  const accuracy = shots > 0 ? Math.min(1, hits / shots) : 0;
  if (Math.abs(accuracyBonus - Math.round(base * accuracy)) > 1) return "accuracy bonus";
  if (base + accuracyBonus !== entry.score || score.playerFinalScore !== entry.score) {
    return "score does not match summary";
  }
  if (typeof entry.accuracy === "number" && Math.abs(entry.accuracy - accuracy) > 0.01) {
    return "accuracy";
  }
  return null;
}

/**
 * Publish an alert to the SNS topic in `ALERT_TOPIC_ARN` (no-op when unset). Never throws:
 * alerting must not affect the submission.
 * @param {string} subject
 * @param {Record<string, any>} details
 */
async function sendAlert(subject, details) {
  const TopicArn = process.env.ALERT_TOPIC_ARN;
  if (!TopicArn) return;
  try {
    await sns.send(
      new PublishCommand({
        TopicArn,
        Subject: subject.slice(0, 100),
        Message: JSON.stringify(details, null, 2),
      })
    );
  } catch (error) {
    console.error("SNS error:", error instanceof Error ? error.message : String(error));
  }
}

/**
 * @param {Record<string, any>} entry
 * @returns {any} Parsed run summary (for alert e-mails), or the raw string when unparsable.
 */
function summaryOf(entry) {
  try {
    return JSON.parse(entry["game-summary"]);
  } catch {
    return entry["game-summary"] ?? null;
  }
}

/**
 * Copy of the board safe to return to any client: the stored `game-summary` keeps the player's
 * `device` details (user agent, viewport, locale, time zone, platform) for analysis and alerts,
 * but responses drop them.
 * @param {any[]} scores
 * @returns {any[]}
 */
export function publicScores(scores) {
  return scores.map((e) => {
    const summary = e && typeof e["game-summary"] === "string" ? summaryOf(e) : null;
    if (!summary || typeof summary !== "object" || !("device" in summary)) return e;
    const { device: _device, ...rest } = summary;
    return { ...e, "game-summary": JSON.stringify(rest) };
  });
}

/**
 * @param {{id:string, score:number}} a
 * @param {{id:string, score:number}} b
 */
const compareEntries = (a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id));

/**
 * Insert one entry into the ranked list. Initials are unique: a lower or equal score for existing
 * initials is ignored.
 * @param {any[]} scores Current stored entries.
 * @param {{id:string, score:number}} entry Validated entry.
 * @param {number} [max]
 * @returns {any[]|null} New top-N list, or null when the entry does not change the board.
 */
export function mergeEntry(scores, entry, max = MAX_LEADERBOARD_ENTRIES) {
  const existing = scores.find((e) => e && e.id === entry.id);
  if (existing && existing.score >= entry.score) return null;
  const next = scores
    .filter((e) => e && e.id !== entry.id)
    .concat(entry)
    .sort(compareEntries)
    .slice(0, max);
  return next.includes(entry) ? next : null;
}

/**
 * Lambda handler.
 * GET  ?id=N                     -> `{ id, scores, version, updatedAt }`
 * PUT  ?id=N  `{ entry: {...} }` -> `{ accepted, scores, version }`
 * The PUT body carries a single score; ranking, de-duplication and trimming happen here so a
 * client can never overwrite other players' entries. The entry's `game-summary` must pass
 * {@link checkRunSummary}. With `ALERT_TOPIC_ARN` set, a new #1 and (rate-limited) rejected
 * submissions are e-mailed via SNS. Returned `scores` never include device details
 * ({@link publicScores}); the stored entries keep them.
 * @param {{httpMethod:string,queryStringParameters?:Record<string,string>,body?:string,requestContext?:any}} event
 */
export const handler = async (event) => {
  try {
    const { httpMethod, queryStringParameters, body } = event;
    const id = Number(queryStringParameters?.id);
    if (!Number.isInteger(id)) return respond(400, { message: "Missing id" });

    if (httpMethod === "GET") {
      const item = await getItem(id);
      return item
        ? respond(200, { ...item, scores: publicScores(item.scores) })
        : respond(404, { message: "Leaderboard not found" });
    }
    if (httpMethod !== "PUT") return respond(405, { message: "Method not allowed" });

    let parsed = null;
    try {
      parsed = JSON.parse(body || "");
    } catch {
      /* handled as invalid entry below */
    }
    const { entry, error } = validateEntry(parsed?.entry);
    if (!entry) return respond(400, { message: error });
    const sourceIp = event.requestContext?.identity?.sourceIp;

    const reason = checkRunSummary(entry);
    if (reason) {
      console.log(
        "Leaderboard rejected:",
        JSON.stringify({ id: entry.id, score: entry.score, reason, sourceIp })
      );
      const now = Date.now();
      if (now - lastRejectionAlertAt >= REJECTION_ALERT_COOLDOWN_MS) {
        lastRejectionAlertAt = now;
        await sendAlert(`AI Horizon: rejected ${entry.id} ${entry.score} (${reason})`, {
          reason,
          entry: { id: entry.id, score: entry.score, accuracy: entry.accuracy },
          sourceIp,
          summary: summaryOf(entry),
          note: "Further rejections from this Lambda instance are not e-mailed for 10 minutes; see CloudWatch logs.",
        });
      }
      return respond(400, { message: `Run summary rejected: ${reason}` });
    }

    const result = await submitEntry(id, entry);
    console.log(
      "Leaderboard submit:",
      JSON.stringify({
        id: entry.id,
        score: entry.score,
        accepted: result?.accepted ?? false,
        sourceIp,
      })
    );
    if (!result) return respond(404, { message: "Leaderboard not found" });
    if (result.conflict) return respond(409, { message: "Leaderboard busy, try again" });
    const [top, runnerUp] = result.scores;
    if (result.accepted && top && top.id === entry.id && top.score === entry.score) {
      await sendAlert(`AI Horizon: new #1 ${entry.id} ${entry.score}`, {
        entry: { id: entry.id, score: entry.score, accuracy: entry.accuracy, date: entry.date },
        runnerUp: runnerUp ? { id: runnerUp.id, score: runnerUp.score } : null,
        sourceIp,
        summary: summaryOf(entry),
        remove: `node scripts/leaderboard-remove.cjs ${entry.id} --yes`,
      });
    }
    return respond(200, { ...result, scores: publicScores(result.scores) });
  } catch (error) {
    console.error("DynamoDB error:", error instanceof Error ? error.message : String(error));
    return respond(500, { message: "Internal server error" });
  }
};

/**
 * @param {number} id
 * @returns {Promise<Record<string, any>|null>}
 */
async function getItem(id) {
  const result = await docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
  const item = result.Item;
  if (!item) return null;
  item.scores = Array.isArray(item.scores) ? item.scores.slice(0, MAX_LEADERBOARD_ENTRIES) : [];
  // ensure version property exists for clients implementing optimistic concurrency
  if (typeof item.version !== "number") item.version = 0;
  return item;
}

/**
 * Read-merge-write with a version condition, retrying when a concurrent submission wins the race.
 * @param {number} id
 * @param {Record<string, any>} entry Validated entry.
 * @returns {Promise<{accepted:boolean, scores:any[], version:number} | {conflict:true} | null>}
 *   null when the leaderboard item does not exist.
 */
async function submitEntry(id, entry) {
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    const current = await getItem(id);
    if (!current) return null;
    const scores = mergeEntry(current.scores, /** @type {any} */ (entry));
    if (!scores) return { accepted: false, scores: current.scores, version: current.version };
    try {
      const result = await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { id },
          UpdateExpression:
            "SET #scores = :scores, #updatedAt = :now, #ver = if_not_exists(#ver, :zero) + :one",
          ConditionExpression:
            "attribute_exists(id) AND (attribute_not_exists(#ver) OR #ver = :expected)",
          ExpressionAttributeNames: {
            "#scores": "scores",
            "#updatedAt": "updatedAt",
            "#ver": "version",
          },
          ExpressionAttributeValues: {
            ":scores": scores,
            ":now": new Date().toISOString(),
            ":zero": 0,
            ":one": 1,
            ":expected": current.version,
          },
          ReturnValues: "ALL_NEW",
        })
      );
      return {
        accepted: true,
        scores: result.Attributes.scores,
        version: result.Attributes.version,
      };
    } catch (err) {
      if (!(err instanceof Error) || err.name !== "ConditionalCheckFailedException") throw err;
    }
  }
  return { conflict: true };
}
