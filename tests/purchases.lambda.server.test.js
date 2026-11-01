import { createHmac, generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dynamoSend = vi.fn();
const secretsSend = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => ({ DynamoDBClient: class {} }));
vi.mock("@aws-sdk/lib-dynamodb", () => {
  class Command {
    /** @param {any} params */
    constructor(params) {
      this.params = params;
    }
  }
  return {
    DynamoDBDocumentClient: { from: () => ({ send: dynamoSend }) },
    GetCommand: class GetCommand extends Command {},
    UpdateCommand: class UpdateCommand extends Command {},
  };
});
vi.mock("@aws-sdk/client-sns", () => ({ SNSClient: class {}, PublishCommand: class {} }));
vi.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: class {
    /** @param {any} cmd */
    send(cmd) {
      return secretsSend(cmd);
    }
  },
  GetSecretValueCommand: class {
    /** @param {any} params */
    constructor(params) {
      this.params = params;
    }
  },
}));

const purchases = await import("../server/lambda/purchases.js");
const leaderboard = await import("../server/lambda/leaderboard.js");
const { handler, signAccountToken, verifyAccountToken, verifyGoogleIdToken } = purchases;
const { verifyStripeSignature, returnOrigin, paidSessionAccount } = purchases;

const CLIENT_ID = "client.apps.googleusercontent.com";
const SIGNING_KEY = "test-signing-key";
const WEBHOOK_SECRET = "whsec_test";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const JWK = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };

/** @param {Record<string, any>} claims @param {string} [kid] */
function googleToken(claims, kid = "k1") {
  const enc = (/** @type {any} */ o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = enc({ alg: "RS256", kid, typ: "JWT" });
  const body = enc({
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    sub: "1234567890",
    email: "pilot@example.com",
    nonce: "n-1",
    exp: Math.floor(Date.now() / 1000) + 600,
    ...claims,
  });
  const sig = sign("RSA-SHA256", Buffer.from(`${head}.${body}`), privateKey).toString("base64url");
  return `${head}.${body}.${sig}`;
}

/** @param {any} body @param {Partial<{resource:string, headers:any}>} [extra] */
const post = (body, extra = {}) =>
  handler({
    httpMethod: "POST",
    resource: "/purchases",
    body: typeof body === "string" ? body : JSON.stringify(body),
    ...extra,
  });

/** @param {any} res */
const json = (res) => JSON.parse(res.body);

/** @type {Map<string, any>} */
let table;
/** @type {Array<{ url: string, init: any }>} */
let stripeCalls;
/** @type {(url: string, init: any) => any} */
let stripeReply;
/** @type {any} */
let playPurchase;
/** @type {any[]} */
let playCalls;

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
  process.env.STRIPE_PRICE_ID = "price_test";
  process.env.STRIPE_SECRET_ID = "stripe";
  process.env.SIGNING_SECRET_ID = "signing";
  table = new Map();
  stripeCalls = [];
  stripeReply = () => ({});
  dynamoSend.mockImplementation(async (cmd) => {
    const { Key } = cmd.params;
    if (cmd.constructor.name === "GetCommand") return { Item: table.get(Key.account) };
    const values = cmd.params.ExpressionAttributeValues;
    table.set(Key.account, { ...table.get(Key.account), status: values[":status"] });
    return {};
  });
  process.env.PLAY_SECRET_ID = "play";
  playPurchase = { purchaseState: 0, acknowledgementState: 0, orderId: "GPA.1" };
  playCalls = [];
  secretsSend.mockImplementation(async (cmd) => ({
    SecretString: JSON.stringify(
      cmd.params.SecretId === "signing"
        ? { signingKey: SIGNING_KEY }
        : cmd.params.SecretId === "play"
          ? {
              client_email: "sa@project.iam.gserviceaccount.com",
              private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
            }
          : { secretKey: "sk_test_x", webhookSecret: WEBHOOK_SECRET }
    ),
  }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (/** @type {string} */ url, /** @type {any} */ init) => {
      if (url.startsWith("https://www.googleapis.com/")) {
        return new Response(JSON.stringify({ keys: [JWK] }), {
          headers: { "cache-control": "public, max-age=3600" },
        });
      }
      if (url === "https://oauth2.googleapis.com/token") {
        const assertion = new URLSearchParams(init.body).get("assertion") || "";
        playCalls.push({ url, assertion });
        return new Response(JSON.stringify({ access_token: "ya29.test", expires_in: 3600 }));
      }
      if (url.startsWith("https://androidpublisher.googleapis.com/")) {
        playCalls.push({ url, method: init.method, auth: init.headers.Authorization });
        if (url.endsWith(":acknowledge")) return new Response("{}");
        return new Response(JSON.stringify(playPurchase));
      }
      stripeCalls.push({ url, init });
      return new Response(JSON.stringify(stripeReply(url, init)));
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  dynamoSend.mockReset();
  secretsSend.mockReset();
});

describe("account tokens", () => {
  it("round-trip, and reject tampering, other keys and old tokens", () => {
    const now = 1_800_000_000;
    const token = signAccountToken("google:42", "k", now);
    expect(verifyAccountToken(token, "k", now)).toBe("google:42");
    expect(verifyAccountToken(token, "other", now)).toBeNull();
    expect(verifyAccountToken(token.slice(0, -2) + "xx", "k", now)).toBeNull();
    expect(verifyAccountToken(token, "k", now + purchases.TOKEN_MAX_AGE_SECONDS + 1)).toBeNull();
    expect(verifyAccountToken("v1.e30.", "k", now)).toBeNull();
    expect(verifyAccountToken(42, "k", now)).toBeNull();
  });

  it("are verified identically by the leaderboard Lambda's copy", () => {
    const now = 1_800_000_000;
    const token = signAccountToken("google:42", "k", now);
    expect(leaderboard.verifyAccountToken(token, "k", now)).toBe("google:42");
    expect(leaderboard.verifyAccountToken(token, "other", now)).toBeNull();
    expect(leaderboard.verifyAccountToken(token, "k", now + 400 * 24 * 3600)).toBeNull();
    expect(leaderboard.PURCHASES_TABLE).toBe(purchases.TABLE_NAME);
  });
});

describe("verifyGoogleIdToken", () => {
  const opts = { clientId: CLIENT_ID, nonce: "n-1", keys: [JWK] };

  it("accepts a valid token and returns the subject and email", () => {
    expect(verifyGoogleIdToken(googleToken({}), opts)).toEqual({
      sub: "1234567890",
      email: "pilot@example.com",
    });
  });

  it("rejects another audience, issuer, nonce, unknown key, expiry or a forged signature", () => {
    expect(verifyGoogleIdToken(googleToken({ aud: "other" }), opts)).toBeNull();
    expect(verifyGoogleIdToken(googleToken({ iss: "https://evil.example" }), opts)).toBeNull();
    expect(verifyGoogleIdToken(googleToken({ nonce: "n-2" }), opts)).toBeNull();
    expect(verifyGoogleIdToken(googleToken({}), { ...opts, nonce: undefined })).toBeNull();
    expect(verifyGoogleIdToken(googleToken({}, "k2"), opts)).toBeNull();
    expect(verifyGoogleIdToken(googleToken({ exp: 1000 }), opts)).toBeNull();
    const [h, b] = googleToken({}).split(".");
    const forged = googleToken({ sub: "999" }).split(".")[2];
    expect(verifyGoogleIdToken(`${h}.${b}.${forged}`, opts)).toBeNull();
  });
});

describe("helpers", () => {
  it("verifyStripeSignature checks the HMAC and the timestamp", () => {
    const now = 1_800_000_000;
    const body = '{"id":"evt_1"}';
    const v1 = createHmac("sha256", "whsec").update(`${now}.${body}`).digest("hex");
    expect(verifyStripeSignature(body, `t=${now},v1=${v1}`, "whsec", now)).toBe(true);
    expect(verifyStripeSignature(body + " ", `t=${now},v1=${v1}`, "whsec", now)).toBe(false);
    expect(verifyStripeSignature(body, `t=${now},v1=${v1}`, "whsec", now + 3600)).toBe(false);
    expect(verifyStripeSignature(body, undefined, "whsec", now)).toBe(false);
  });

  it("isLiveKey accepts live secret and restricted keys only", () => {
    expect(purchases.isLiveKey("sk_live_x")).toBe(true);
    expect(purchases.isLiveKey("rk_live_x")).toBe(true);
    expect(purchases.isLiveKey("sk_test_x")).toBe(false);
    expect(purchases.isLiveKey("rk_test_x")).toBe(false);
    expect(purchases.isLiveKey(undefined)).toBe(false);
  });

  it("returnOrigin allows the production site for live keys and local servers for test keys", () => {
    expect(returnOrigin("https://www.agentmode.dev", true)).toBe("https://www.agentmode.dev");
    expect(returnOrigin("http://localhost:8000", true)).toBeNull();
    expect(returnOrigin("http://localhost:8000", false)).toBe("http://localhost:8000");
    expect(returnOrigin("https://www.agentmode.dev", false)).toBeNull();
    expect(returnOrigin("https://evil.example", true)).toBeNull();
  });

  it("paidSessionAccount needs a paid session for the product and a Google account", () => {
    const session = {
      client_reference_id: "google:1",
      payment_status: "paid",
      metadata: { product: "bullet_upgrade" },
    };
    expect(paidSessionAccount(session)).toBe("google:1");
    expect(paidSessionAccount({ ...session, payment_status: "unpaid" })).toBeNull();
    expect(paidSessionAccount({ ...session, metadata: {} })).toBeNull();
    expect(paidSessionAccount({ ...session, client_reference_id: "x" })).toBeNull();
  });
});

describe("handler", () => {
  it("signin exchanges a Google ID token for an account token and the ownership", async () => {
    table.set("google:1234567890", { status: "active" });
    const res = await post({ action: "signin", idToken: googleToken({}), nonce: "n-1" });
    expect(res.statusCode).toBe(200);
    const body = json(res);
    expect(body.owned).toBe(true);
    expect(body.email).toBe("pilot@example.com");
    expect(verifyAccountToken(body.token, SIGNING_KEY)).toBe("google:1234567890");
  });

  it("signin rejects a bad token", async () => {
    const res = await post({ action: "signin", idToken: googleToken({ aud: "x" }), nonce: "n-1" });
    expect(res.statusCode).toBe(401);
  });

  it("status needs a valid account token", async () => {
    expect((await post({ action: "status", token: "nope" })).statusCode).toBe(401);
    const token = signAccountToken("google:7", SIGNING_KEY);
    expect(json(await post({ action: "status", token }))).toEqual({ owned: false });
    table.set("google:7", { status: "revoked" });
    expect(json(await post({ action: "status", token }))).toEqual({ owned: false });
    table.set("google:7", { status: "active" });
    expect(json(await post({ action: "status", token }))).toEqual({ owned: true });
  });

  it("checkout creates a Managed Payments session for the account", async () => {
    stripeReply = () => ({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" });
    const token = signAccountToken("google:7", SIGNING_KEY);
    const res = await post({
      action: "checkout",
      token,
      origin: "http://localhost:8000",
      email: "pilot@example.com",
    });
    expect(json(res)).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_test_1" });
    const form = new URLSearchParams(stripeCalls[0].init.body);
    expect(form.get("managed_payments[enabled]")).toBe("true");
    expect(form.get("line_items[0][price]")).toBe("price_test");
    expect(form.get("client_reference_id")).toBe("google:7");
    expect(form.get("customer_email")).toBe("pilot@example.com");
    expect(form.get("success_url")).toBe(
      "http://localhost:8000/?purchase=success&session_id={CHECKOUT_SESSION_ID}"
    );
  });

  it("checkout refuses foreign origins and skips payment when already owned", async () => {
    const token = signAccountToken("google:7", SIGNING_KEY);
    const bad = await post({ action: "checkout", token, origin: "https://evil.example" });
    expect(bad.statusCode).toBe(400);
    table.set("google:7", { status: "active" });
    expect(
      json(await post({ action: "checkout", token, origin: "http://localhost:8000" }))
    ).toEqual({ owned: true });
    expect(stripeCalls).toHaveLength(0);
  });

  it("confirm records a paid session for the same account only", async () => {
    const paid = {
      id: "cs_test_1",
      client_reference_id: "google:7",
      payment_status: "paid",
      payment_intent: "pi_1",
      livemode: false,
      metadata: { product: "bullet_upgrade" },
    };
    stripeReply = () => paid;
    const other = signAccountToken("google:8", SIGNING_KEY);
    expect(json(await post({ action: "confirm", token: other, sessionId: "cs_test_1" }))).toEqual({
      owned: false,
    });
    const token = signAccountToken("google:7", SIGNING_KEY);
    expect(json(await post({ action: "confirm", token, sessionId: "cs_test_1" }))).toEqual({
      owned: true,
    });
    expect(table.get("google:7").status).toBe("active");
    expect((await post({ action: "confirm", token, sessionId: "../x" })).statusCode).toBe(400);
  });

  /** @param {any} event */
  const webhook = (event, secret = WEBHOOK_SECRET) => {
    const body = JSON.stringify(event);
    const t = Math.floor(Date.now() / 1000);
    const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
    return post(body, {
      resource: "/purchases/stripe",
      headers: { "Stripe-Signature": `t=${t},v1=${v1}` },
    });
  };

  it("the webhook records completed checkouts and revokes refunds", async () => {
    const session = {
      id: "cs_test_1",
      client_reference_id: "google:9",
      payment_status: "paid",
      payment_intent: "pi_9",
      metadata: { product: "bullet_upgrade" },
    };
    const done = await webhook({ type: "checkout.session.completed", data: { object: session } });
    expect(done.statusCode).toBe(200);
    expect(table.get("google:9").status).toBe("active");

    stripeReply = () => ({ data: [session] });
    await webhook({
      type: "charge.refunded",
      data: { object: { payment_intent: "pi_9", refunded: false } },
    });
    expect(table.get("google:9").status).toBe("active");
    await webhook({
      type: "charge.refunded",
      data: { object: { payment_intent: "pi_9", refunded: true } },
    });
    expect(table.get("google:9").status).toBe("revoked");
    expect(stripeCalls.at(-1)?.url).toContain("payment_intent=pi_9");
  });

  it("the webhook rejects a bad signature", async () => {
    const res = await webhook({ type: "checkout.session.completed", data: {} }, "whsec_other");
    expect(res.statusCode).toBe(400);
  });

  it("play verifies and acknowledges the purchase, owning it for the device and the account", async () => {
    const token = signAccountToken("google:7", SIGNING_KEY);
    const res = await post({ action: "play", purchaseToken: "ptok", token });
    const body = json(res);
    expect(body.owned).toBe(true);
    expect(verifyAccountToken(body.token, SIGNING_KEY)).toBe("google:7");
    expect(table.get("google:7").status).toBe("active");
    expect(table.get(purchases.playTokenAccount("ptok")).status).toBe("active");

    const [oauth, get, ack] = playCalls;
    const claims = JSON.parse(Buffer.from(oauth.assertion.split(".")[1], "base64url").toString());
    expect(claims.iss).toBe("sa@project.iam.gserviceaccount.com");
    expect(claims.scope).toBe("https://www.googleapis.com/auth/androidpublisher");
    expect(get.url).toBe(
      "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/" +
        "dev.agentmode.aihorizon/purchases/products/bullet_upgrade/tokens/ptok"
    );
    expect(get.auth).toBe("Bearer ya29.test");
    expect(ack.url.endsWith("/tokens/ptok:acknowledge")).toBe(true);
    expect(ack.method).toBe("POST");
  });

  it("play without sign-in owns it under the purchase token; acknowledged purchases are not re-acknowledged", async () => {
    playPurchase = { purchaseState: 0, acknowledgementState: 1, orderId: "GPA.2" };
    const body = json(await post({ action: "play", purchaseToken: "ptok2" }));
    expect(verifyAccountToken(body.token, SIGNING_KEY)).toBe(purchases.playTokenAccount("ptok2"));
    expect(playCalls.some((c) => c.url.endsWith(":acknowledge"))).toBe(false);
  });

  it("play refuses pending or cancelled purchases and bad tokens", async () => {
    playPurchase = { purchaseState: 2 };
    expect(json(await post({ action: "play", purchaseToken: "ptok3" }))).toEqual({ owned: false });
    expect(table.size).toBe(0);
    expect((await post({ action: "play", purchaseToken: "" })).statusCode).toBe(400);
  });

  it("status revokes a Play purchase that was refunded", async () => {
    table.set("google:7", { status: "active", platform: "play", playToken: "ptok" });
    const token = signAccountToken("google:7", SIGNING_KEY);
    expect(json(await post({ action: "status", token }))).toEqual({ owned: true });
    playPurchase = { purchaseState: 1 };
    expect(json(await post({ action: "status", token }))).toEqual({ owned: false });
    expect(table.get("google:7").status).toBe("revoked");
  });

  it("rejects other methods and malformed bodies", async () => {
    expect((await handler({ httpMethod: "GET" })).statusCode).toBe(405);
    expect((await post("not json")).statusCode).toBe(400);
    const token = signAccountToken("google:7", SIGNING_KEY);
    expect((await post({ action: "nope", token })).statusCode).toBe(400);
  });
});
