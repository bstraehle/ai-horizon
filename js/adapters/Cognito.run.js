// Runner for the Cognito adapter demo. Provides quick manual GET / PUT tests
// against the real API Gateway + Lambda leaderboard endpoint using SigV4
// signing and (optionally) anonymous Cognito Identity Pool credentials.
//
// Usage (Node 18+):
//   node js/adapters/Cognito.run.js          # GET test (id=1)
//   node js/adapters/Cognito.run.js put      # PUT test (append random score)
//
// Env overrides (optional):
//   COGNITO_IDENTITY_POOL_ID, AWS_REGION, LEADERBOARD_ENDPOINT, LEADERBOARD_ID
//
// NOTE: This is a manual/local integration smoke test. It will mutate the
// remote leaderboard record on a successful PUT by appending a temporary score.

import { CognitoAPIClient } from "./Cognito.js";

// Minimal Node global declarations to appease checkJs without pulling full @types/node

// @ts-ignore - Provide minimal shape so checkJs doesn't complain; Node supplies the actual object.
// Best-effort reference; in Node this will be the real process, elsewhere a stub.
// Cast globalThis to any to avoid type complaints under checkJs without @types/node.

const process = /** @type {any} */ (/** @type {any} */ (globalThis)).process
  ? /** @type {any} */ (/** @type {any} */ (globalThis)).process
  : { env: {}, argv: [] };

/** Simple pretty logger */
/** @param {...any} args */
function log(...args) {
  console.log("[CognitoRun]", ...args);
}

/** Exit helper */
/** @param {string} msg @param {any} [err] */
function fail(msg, err) {
  console.error("[CognitoRun] ERROR:", msg, err || "");
  process.exitCode = 1;
}

/** Build configured client from environment overrides */
function buildClient() {
  const identityPoolId = process.env.COGNITO_IDENTITY_POOL_ID;
  const region = process.env.AWS_REGION;
  const apiEndpoint = process.env.LEADERBOARD_ENDPOINT;
  return new CognitoAPIClient({ identityPoolId, region, apiEndpoint });
}

/** Perform a GET of leaderboard id (default 1) */
/** @param {number} id */
async function testGet(id) {
  const client = buildClient();
  log("GET id=", id, "endpoint=", client.getApiEndpoint());
  const item = await client.callLeaderboardAPI(id);
  log(
    "GET success. version=",
    item.version,
    "scores count=",
    Array.isArray(item.scores) ? item.scores.length : 0
  );
  return item;
}

/** Perform a signed PUT updating scores with optimistic concurrency */
/** @param {number} id */
async function testPut(id) {
  const client = buildClient();
  log("PUT id=", id, "endpoint=", client.getApiEndpoint());
  const current = await client.callLeaderboardAPI(id);
  const version = current.version;
  const existingScores = Array.isArray(current.scores) ? current.scores.slice(0) : [];
  const newEntry = {
    id: "TST",
    score: Math.floor(Math.random() * 500) + 1,
  };
  const merged = [...existingScores, newEntry].sort((a, b) => b.score - a.score).slice(0, 50); // keep a reasonable cap locally

  const bodyObj = { scores: merged, version };
  const fetchSigned = client.buildSignedFetch();
  const url = new URL(client.getApiEndpoint());
  url.searchParams.set("id", String(id));
  const res = await fetchSigned(url.toString(), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyObj),
  });
  const text = await res.text();
  log("PUT status:", res.status, res.statusText);
  if (res.status !== 200 && res.status !== 409) {
    log("Headers:", Object.fromEntries(res.headers.entries()));
    log("Raw body:", text);
  }
  try {
    const parsed = JSON.parse(text);
    if (res.status === 200) {
      const serverItem = parsed.item || parsed;
      log(
        "PUT success. newVersion=",
        serverItem?.version,
        "scores count=",
        serverItem?.scores?.length
      );
    } else if (res.status === 409) {
      const serverItem = parsed.item || parsed;
      log("PUT conflict. serverVersion=", serverItem?.version, "clientVersion=", version);
    } else {
      fail(`Unexpected status ${res.status}`, text);
    }
  } catch (e) {
    fail("Failed parsing response JSON", e);
  }
}

(async () => {
  try {
    const id = Number(process.env.LEADERBOARD_ID || 1);
    const op = process.argv[2] ? process.argv[2].toLowerCase() : "get";
    switch (op) {
      case "get":
        await testGet(id);
        break;
      case "put":
        await testPut(id);
        break;
      default:
        log("Unknown op. Use 'get' or 'put'. Defaulting to GET.");
        await testGet(id);
    }
  } catch (err) {
    fail("Runner error", err);
  }
})();
