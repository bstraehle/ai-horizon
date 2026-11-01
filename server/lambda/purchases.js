import { createHmac, createPublicKey, timingSafeEqual, verify } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

/**
 * Purchases Lambda – the Bullet Upgrade (one-time, $0.99).
 *
 * Identity: players sign in with Google (OpenID Connect redirect in the browser); the Google ID
 * token is verified here and exchanged for an account token signed with our own key
 * (`signAccountToken`). The purchase belongs to the Google account, so it works on every device
 * the player signs in on, with no restore step.
 *
 * Payment (web): Stripe Checkout with Managed Payments (Stripe is the merchant of record). The
 * player returns with a Checkout Session id (`confirm`); the Stripe webhook records the same
 * purchase independently (closed tab) and revokes it on a refund or dispute.
 *
 * Routes (API Gateway REST proxy):
 *   POST /purchases          `{ action, ... }`, IAM auth (Cognito identity, like the leaderboard)
 *     signin   { idToken, nonce }            -> { token, owned, email }
 *     status   { token }                     -> { owned }
 *     checkout { token, origin, email? }     -> { url } | { owned: true }
 *     confirm  { token, sessionId }          -> { owned }
 *   POST /purchases/stripe   Stripe webhook (public, `Stripe-Signature` verified)
 *
 * The leaderboard Lambda verifies the same account tokens (its copy of `verifyAccountToken`) and
 * reads this table to badge upgraded runs. Env vars: `GOOGLE_CLIENT_ID`, `STRIPE_PRICE_ID`,
 * `STRIPE_SECRET_ID` (secret JSON `{ secretKey, webhookSecret }`), `SIGNING_SECRET_ID` (secret
 * JSON `{ signingKey }`).
 */

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "us-west-2" }));
const secretsClient = new SecretsManagerClient({ region: "us-west-2", maxAttempts: 2 });

export const TABLE_NAME = "ai-horizon-purchases";
export const PRODUCT = "bullet_upgrade";
const STRIPE_API = "https://api.stripe.com/v1";
const STRIPE_VERSION = "2025-03-31.basil";
const GOOGLE_CERTS = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
/** Account tokens are accepted for a year; signing in again issues a fresh one. */
export const TOKEN_MAX_AGE_SECONDS = 365 * 24 * 3600;
/** Clock skew tolerated for Google ID token and Stripe signature timestamps. */
const SKEW_SECONDS = 300;
/** Sites the checkout may return to; test-mode keys only return to local dev servers. */
export const LIVE_ORIGINS = ["https://www.agentmode.dev", "https://agentmode.dev"];
export const DEV_ORIGINS = ["http://localhost:8000", "http://127.0.0.1:8000"];

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

/** @param {Buffer|string} data */
const b64url = (data) => Buffer.from(data).toString("base64url");

/**
 * Sign an account token: `v1.<payload>.<hmac>`, payload `{ sub, iat }` (base64url JSON).
 * @param {string} sub Account id, `google:<subject>`.
 * @param {string} key Signing key.
 * @param {number} [now] Seconds since the epoch.
 */
export function signAccountToken(sub, key, now = Math.floor(Date.now() / 1000)) {
  const payload = b64url(JSON.stringify({ sub, iat: now }));
  const mac = createHmac("sha256", key).update(`v1.${payload}`).digest("base64url");
  return `v1.${payload}.${mac}`;
}

/**
 * Verify an account token (signature and age). Duplicated in server/lambda/leaderboard.js (single
 * file deploys); tests/purchases.lambda.server.test.js keeps the two in sync.
 * @param {unknown} token
 * @param {string} key
 * @param {number} [now]
 * @returns {string|null} The account id, or null when invalid.
 */
export function verifyAccountToken(token, key, now = Math.floor(Date.now() / 1000)) {
  if (typeof token !== "string" || token.length > 512) return null;
  const [version, payload, mac] = token.split(".");
  if (version !== "v1" || !payload || !mac) return null;
  const expected = createHmac("sha256", key).update(`v1.${payload}`).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const { sub, iat } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof sub !== "string" || !Number.isInteger(iat)) return null;
    if (iat > now + SKEW_SECONDS || now - iat > TOKEN_MAX_AGE_SECONDS) return null;
    return sub;
  } catch {
    return null;
  }
}

/**
 * Verify a Google ID token (RS256 against Google's published keys) for our client id.
 * @param {unknown} idToken
 * @param {{ clientId: string, nonce: unknown, keys: any[], now?: number }} options
 * @returns {{ sub: string, email: string|null } | null}
 */
export function verifyGoogleIdToken(idToken, { clientId, nonce, keys, now = Date.now() / 1000 }) {
  if (typeof idToken !== "string" || idToken.length > 4096) return null;
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    const jwk = keys.find((k) => k && k.kid === header.kid);
    if (header.alg !== "RS256" || !jwk) return null;
    const key = createPublicKey({ key: jwk, format: "jwk" });
    const signed = Buffer.from(`${parts[0]}.${parts[1]}`);
    if (!verify("RSA-SHA256", signed, key, Buffer.from(parts[2], "base64url"))) return null;
    if (!GOOGLE_ISSUERS.has(claims.iss) || claims.aud !== clientId) return null;
    if (!(claims.exp > now - SKEW_SECONDS) || typeof claims.sub !== "string") return null;
    if (typeof nonce !== "string" || !nonce || claims.nonce !== nonce) return null;
    return { sub: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
  } catch {
    return null;
  }
}

/**
 * Verify a `Stripe-Signature` header (`t=…,v1=…`) over the raw body.
 * @param {string} body Raw request body.
 * @param {unknown} header
 * @param {string} secret Webhook signing secret (`whsec_…`).
 * @param {number} [now]
 */
export function verifyStripeSignature(body, header, secret, now = Math.floor(Date.now() / 1000)) {
  if (typeof header !== "string" || !secret) return false;
  const fields = header.split(",").map((f) => f.split("="));
  const t = Number(fields.find(([k]) => k === "t")?.[1]);
  if (!Number.isInteger(t) || Math.abs(now - t) > SKEW_SECONDS) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest();
  return fields.some(([k, v]) => {
    if (k !== "v1" || !v) return false;
    const given = Buffer.from(v, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/**
 * Whether a Stripe key is a live key (secret `sk_live_…` or restricted `rk_live_…`).
 * @param {unknown} key
 */
export const isLiveKey = (key) => typeof key === "string" && /^(sk|rk)_live_/.test(key);

/**
 * Allowed checkout return origin for the key's mode, or null.
 * @param {unknown} origin
 * @param {boolean} live Whether the Stripe key is a live key.
 */
export function returnOrigin(origin, live) {
  const allowed = live ? LIVE_ORIGINS : DEV_ORIGINS;
  return typeof origin === "string" && allowed.includes(origin) ? origin : null;
}

/** @type {Map<string, Promise<any>>} */
const secretCache = new Map();

/**
 * Secret JSON by id, cached per warm container (a failed read is retried next time).
 * @param {string|undefined} id
 */
function getSecret(id) {
  if (!id) return Promise.reject(new Error("Secret id not configured"));
  if (!secretCache.has(id)) {
    const value = secretsClient
      .send(new GetSecretValueCommand({ SecretId: id }))
      .then((res) => JSON.parse(res.SecretString || "{}"));
    value.catch(() => secretCache.delete(id));
    secretCache.set(id, value);
  }
  return /** @type {Promise<any>} */ (secretCache.get(id));
}

/** @type {{ keys: any[], expires: number } | null} */
let googleKeys = null;

/** Google's signing keys, cached for the `max-age` Google sends (at least an hour otherwise). */
async function getGoogleKeys() {
  if (googleKeys && googleKeys.expires > Date.now()) return googleKeys.keys;
  const res = await fetch(GOOGLE_CERTS);
  if (!res.ok) throw new Error(`Google certs ${res.status}`);
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") || "")?.[1]);
  const { keys } = await res.json();
  googleKeys = { keys, expires: Date.now() + (maxAge > 0 ? maxAge : 3600) * 1000 };
  return keys;
}

/**
 * Call the Stripe API (form-encoded).
 * @param {string} secretKey
 * @param {string} path
 * @param {Record<string,string>} [form] POST body; GET when omitted.
 */
async function stripe(secretKey, path, form) {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: form ? "POST" : "GET",
    headers: { Authorization: `Bearer ${secretKey}`, "Stripe-Version": STRIPE_VERSION },
    body: form ? new URLSearchParams(form) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Stripe ${path}: ${json?.error?.message || res.status}`);
  return json;
}

/**
 * Whether the account owns the Bullet Upgrade.
 * @param {string} account
 */
async function isOwned(account) {
  const { Item } = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { account } }));
  return Item?.status === "active";
}

/**
 * Record (or revoke) the account's Stripe purchase.
 * @param {string} account
 * @param {"active"|"revoked"} status
 * @param {{ sessionId?: string, paymentIntent?: string|null, livemode?: boolean }} details
 */
async function setPurchase(account, status, details) {
  const now = new Date().toISOString();
  await dynamo.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { account },
      UpdateExpression:
        "SET #status = :status, product = :product, platform = :platform, updatedAt = :now, " +
        "createdAt = if_not_exists(createdAt, :now)" +
        (details.sessionId ? ", purchaseId = :purchaseId" : "") +
        (details.paymentIntent ? ", paymentIntent = :paymentIntent" : "") +
        (typeof details.livemode === "boolean" ? ", livemode = :livemode" : ""),
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":status": status,
        ":product": PRODUCT,
        ":platform": "stripe",
        ":now": now,
        ...(details.sessionId ? { ":purchaseId": details.sessionId } : {}),
        ...(details.paymentIntent ? { ":paymentIntent": details.paymentIntent } : {}),
        ...(typeof details.livemode === "boolean" ? { ":livemode": details.livemode } : {}),
      },
    })
  );
}

/**
 * Account id of a paid Checkout Session for our price, or null.
 * @param {any} session
 */
export function paidSessionAccount(session) {
  const account = session?.client_reference_id;
  if (typeof account !== "string" || !account.startsWith("google:")) return null;
  if (session.payment_status !== "paid" || session.metadata?.product !== PRODUCT) return null;
  return account;
}

/**
 * @param {any} body
 * @param {{ clientId: string, priceId: string }} config
 */
async function handleAction(body, { clientId, priceId }) {
  const { signingKey } = await getSecret(process.env.SIGNING_SECRET_ID);
  if (body.action === "signin") {
    const google = verifyGoogleIdToken(body.idToken, {
      clientId,
      nonce: body.nonce,
      keys: await getGoogleKeys(),
    });
    if (!google) return respond(401, { message: "Sign-in failed" });
    const account = `google:${google.sub}`;
    return respond(200, {
      token: signAccountToken(account, signingKey),
      owned: await isOwned(account),
      email: google.email,
    });
  }

  const account = verifyAccountToken(body.token, signingKey);
  if (!account) return respond(401, { message: "Sign in again" });
  if (body.action === "status") return respond(200, { owned: await isOwned(account) });

  const { secretKey } = await getSecret(process.env.STRIPE_SECRET_ID);
  if (body.action === "checkout") {
    if (await isOwned(account)) return respond(200, { owned: true });
    const origin = returnOrigin(body.origin, isLiveKey(secretKey));
    if (!origin) return respond(400, { message: "Unsupported origin" });
    const email = typeof body.email === "string" && body.email.length <= 254 ? body.email : null;
    const session = await stripe(secretKey, "/checkout/sessions", {
      mode: "payment",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      "managed_payments[enabled]": "true",
      client_reference_id: account,
      "metadata[product]": PRODUCT,
      success_url: `${origin}/?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?purchase=cancel`,
      ...(email ? { customer_email: email } : {}),
    });
    return respond(200, { url: session.url });
  }
  if (body.action === "confirm") {
    const id = typeof body.sessionId === "string" ? body.sessionId : "";
    if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) return respond(400, { message: "Bad session" });
    const session = await stripe(secretKey, `/checkout/sessions/${id}`);
    if (paidSessionAccount(session) !== account) return respond(200, { owned: false });
    await setPurchase(account, "active", {
      sessionId: session.id,
      paymentIntent: session.payment_intent,
      livemode: session.livemode,
    });
    return respond(200, { owned: true });
  }
  return respond(400, { message: "Unknown action" });
}

/**
 * Stripe webhook: record paid Checkout Sessions, revoke refunded or disputed ones.
 * @param {string} body Raw body.
 * @param {Record<string,string>|undefined} headers
 */
async function handleWebhook(body, headers) {
  const { secretKey, webhookSecret } = await getSecret(process.env.STRIPE_SECRET_ID);
  const signature = headers?.["Stripe-Signature"] ?? headers?.["stripe-signature"];
  if (!verifyStripeSignature(body, signature, webhookSecret)) {
    return respond(400, { message: "Bad signature" });
  }
  const event = JSON.parse(body);
  const object = event?.data?.object;
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = object;
    const account = paidSessionAccount(session);
    if (account) {
      await setPurchase(account, "active", {
        sessionId: session.id,
        paymentIntent: session.payment_intent,
        livemode: session.livemode,
      });
    }
  } else if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
    const paymentIntent = object?.payment_intent;
    const fullyRefunded = event.type === "charge.dispute.created" || object?.refunded === true;
    if (typeof paymentIntent === "string" && fullyRefunded) {
      const list = await stripe(
        secretKey,
        `/checkout/sessions?payment_intent=${encodeURIComponent(paymentIntent)}&limit=1`
      );
      const session = list?.data?.[0];
      const account = session?.client_reference_id;
      if (typeof account === "string" && account.startsWith("google:")) {
        await setPurchase(account, "revoked", { paymentIntent });
      }
    }
  }
  return respond(200, { received: true });
}

/**
 * Lambda handler (API Gateway REST proxy).
 * @param {{ httpMethod: string, path?: string, resource?: string, body?: string|null,
 *   isBase64Encoded?: boolean, headers?: Record<string,string> }} event
 */
export const handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return respond(405, { message: "Method not allowed" });
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : event.body || "";
    if ((event.resource || event.path || "").endsWith("/stripe")) {
      return await handleWebhook(raw, event.headers);
    }
    let body = null;
    try {
      body = JSON.parse(raw);
    } catch {
      /* handled below */
    }
    if (!body || typeof body !== "object") return respond(400, { message: "Expected JSON" });
    return await handleAction(body, {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      priceId: process.env.STRIPE_PRICE_ID || "",
    });
  } catch (error) {
    console.error("Purchases error:", error instanceof Error ? error.message : String(error));
    return respond(500, { message: "Internal server error" });
  }
};
