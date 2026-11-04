import { CONFIG } from "../constants.js";
import { AWS_CONFIG } from "../adapters/awsConfig.js";
import { loadSignedFetch } from "../adapters/SignedApi.js";

/**
 * PurchaseManager – the Bullet Upgrade: who the player is (Google account) and whether they own it.
 *
 * Flow (web; server side in server/lambda/purchases.js):
 *  1. `buy()` without an account: redirect to Google sign-in (OpenID Connect, `id_token` in the
 *     URL fragment; no Google script on the page, so the strict CSP stays as it is). The nonce and
 *     state wait in sessionStorage.
 *  2. Back on the game, `init()` exchanges the ID token for our account token (`signin`). An
 *     account that already owns the upgrade (another device) is done; otherwise, when the player
 *     was buying, it continues to Stripe Checkout (`checkout`).
 *  3. Back from Stripe (`?purchase=success&session_id=…`), `confirm` records the purchase.
 *  The account token and the last known ownership persist in localStorage, so the game knows at
 *  once on later visits; `init()` re-checks the ownership in the background (refunds revoke it).
 *
 * Flow (Google Play app, a Trusted Web Activity launched with an `android-app://` referrer): the
 * same Google sign-in first (so the purchase also counts on the web), then Google Play Billing:
 * the Digital Goods API gives the local price and owned purchases, a Payment Request with the
 * Play method opens Google's payment sheet, and the purchase token goes to the backend (`play`),
 * which verifies and acknowledges it. Sign-in returns by redirect, without the user gesture the
 * payment sheet needs, so the link then waits for one more tap (`ready`). On launch, owned Play
 * purchases are re-sent, so a reinstall restores the upgrade even before signing in. Stripe is
 * never offered inside the Play app.
 *
 * Offered only where `CONFIG.PURCHASES.LIVE` allows (or on a dev host, Stripe test mode); in the
 * Play app only once its Play Billing support is detected.
 *
 * @typedef {"idle"|"working"|"ready"|"owned"|"cancelled"|"error"} PurchaseStatus
 * @typedef {{ owned: boolean, status: PurchaseStatus }} PurchaseState
 * @typedef {(action: string, body: Record<string, any>) => Promise<any>} PurchasesCall
 */

const PENDING_KEY = "aiHorizonPurchasePending";
const PLAY_APP_KEY = "aiHorizonPlayApp";
const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const PLAY_BILLING = "https://play.google.com/billing";
/** Play product id of the Bullet Upgrade (Play Console in-app product). */
export const PLAY_PRODUCT = "bullet_upgrade";

/**
 * @typedef {{ getDetails(ids: string[]): Promise<Array<{ itemId: string,
 *   price: { currency: string, value: string } }>>,
 *   listPurchases(): Promise<Array<{ itemId: string, purchaseToken: string }>> }} DigitalGoods
 */

/** @returns {Promise<DigitalGoods|null>} The Play Billing service inside the Play app, or null. */
async function loadDigitalGoods() {
  const get = typeof window !== "undefined" && /** @type {any} */ (window).getDigitalGoodsService;
  if (typeof get !== "function") return null;
  try {
    return await get.call(window, PLAY_BILLING);
  } catch {
    return null;
  }
}

/**
 * Open Google Play's payment sheet for the Bullet Upgrade (needs a user gesture).
 * @returns {Promise<{ details: { purchaseToken: string }, complete(result: string): Promise<void> }>}
 */
function showPlayPayment() {
  const request = new PaymentRequest(
    [{ supportedMethods: PLAY_BILLING, data: { sku: PLAY_PRODUCT } }],
    { total: { label: "Total", amount: { currency: "USD", value: "0" } } }
  );
  return /** @type {any} */ (request.show());
}

/** @returns {string} 128 random bits as hex. */
function randomId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** @type {PurchasesCall} */
async function callPurchases(action, body) {
  const signedFetch = await loadSignedFetch();
  const res = await signedFetch(AWS_CONFIG.purchasesEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok)
    throw Object.assign(new Error(json.message || `HTTP ${res.status}`), { status: res.status });
  return json;
}

export class PurchaseManager {
  /**
   * @param {{ storage?: Storage, session?: Storage, location?: Location, history?: History,
   *   referrer?: string, call?: PurchasesCall, navigate?: (url: string) => void,
   *   digitalGoods?: () => Promise<DigitalGoods|null>,
   *   playPayment?: typeof showPlayPayment }} [deps]
   */
  constructor(deps = {}) {
    // Without a browser (unit tests of the game) these stay null: `available` is then false, and
    // the storage helpers swallow the errors.
    const win = /** @type {any} */ (typeof window !== "undefined" ? window : {});
    /** @param {"localStorage"|"sessionStorage"} name */
    const store = (name) => {
      try {
        return win[name] ?? null;
      } catch {
        return null; // e.g. SecurityError on opaque origins
      }
    };
    /** @type {Storage} */
    this.storage = deps.storage ?? store("localStorage");
    /** @type {Storage} */
    this.session = deps.session ?? store("sessionStorage");
    /** @type {Location} */
    this.location = deps.location ?? win.location ?? null;
    /** @type {History} */
    this.history = deps.history ?? win.history ?? null;
    this.call = deps.call ?? callPurchases;
    this.navigate = deps.navigate ?? ((url) => this.location?.assign(url));
    this.digitalGoods = deps.digitalGoods ?? loadDigitalGoods;
    this.playPayment = deps.playPayment ?? showPlayPayment;
    const referrer = deps.referrer ?? (typeof document !== "undefined" ? document.referrer : "");
    if (referrer.startsWith("android-app://")) this._sessionSet(PLAY_APP_KEY, "1");
    /** Inside the Google Play app (remembered for the tab: only its first page has the referrer). */
    this.playApp = this._sessionGet(PLAY_APP_KEY) === "1";
    /** Whether Google Play Billing was detected (Play app with billing support). */
    this.playBilling = false;
    /** Price shown on the link: Play's localized price in the Play app. */
    this.priceLabel = CONFIG.PURCHASES.PRICE_LABEL;
    /** Reason of the last failed Play payment (shown on the link), or null. */
    this.lastError = /** @type {string|null} */ (null);
    /** @type {{ token?: string, owned?: boolean, email?: string|null }} */
    this.saved = this._read();
    /** @type {PurchaseStatus} */
    this.status = this.saved.owned ? "owned" : "idle";
    /** @type {Set<(state: PurchaseState) => void>} */
    this.listeners = new Set();
  }

  /** Whether this site may sell the upgrade (`CONFIG.PURCHASES.LIVE`, or a dev host). */
  get _siteAllowed() {
    const P = CONFIG.PURCHASES;
    if (!this.location || !this.storage) return false;
    return P.LIVE || P.DEV_HOSTS.includes(this.location.hostname);
  }

  /** Whether the Bullet Upgrade can be bought here (in the Play app: with Play Billing only). */
  get available() {
    return this._siteAllowed && (!this.playApp || this.playBilling);
  }

  /** Whether the signed-in account owns the Bullet Upgrade (last known state). */
  get owned() {
    return this.available && this.saved.owned === true;
  }

  /** Account token for leaderboard submissions of upgraded runs, or null. */
  get token() {
    return this.saved.token || null;
  }

  /**
   * @param {(state: PurchaseState) => void} fn
   * @returns {() => void} Unsubscribe.
   */
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Finish a return from Google or Stripe, then re-check the ownership in the background.
   * Never rejects.
   */
  async init() {
    if (!this._siteAllowed) return;
    if (this.playApp && !(await this._initPlay())) return;
    try {
      if (await this._finishGoogle()) return;
      if (await this._finishStripe()) return;
      if (this.saved.token) {
        const { owned } = await this.call("status", { token: this.saved.token });
        this._save({ owned: owned === true });
        this._set(owned ? "owned" : "idle");
      }
    } catch (err) {
      if (/** @type {any} */ (err)?.status === 401) this._save({ token: undefined, owned: false });
      this._set(this.saved.owned ? "owned" : "idle");
    }
  }

  /** Start buying: sign in with Google first when needed, then go to Stripe Checkout. */
  async buy() {
    if (!this.available || this.owned) return;
    this._set("working");
    if (!this.saved.token) {
      this._signIn("buy");
      return;
    }
    try {
      if (this.playApp) await this._playPurchase();
      else await this._checkout();
    } catch (err) {
      if (/** @type {any} */ (err)?.status !== 401) {
        this._set("error");
        return;
      }
      this._save({ token: undefined });
      this._signIn("buy");
    }
  }

  /** @param {string} intent */
  _signIn(intent) {
    const state = randomId();
    const nonce = randomId();
    this._sessionSet(PENDING_KEY, JSON.stringify({ state, nonce, intent }));
    const params = new URLSearchParams({
      client_id: CONFIG.PURCHASES.GOOGLE_CLIENT_ID,
      redirect_uri: `${this.location.origin}/`,
      response_type: "id_token",
      scope: "openid email",
      nonce,
      state,
    });
    this.navigate(`${GOOGLE_AUTH}?${params}`);
  }

  async _checkout() {
    const res = await this.call("checkout", {
      token: this.saved.token,
      origin: this.location.origin,
      email: this.saved.email || undefined,
    });
    if (res.owned) {
      this._save({ owned: true });
      this._set("owned");
    } else if (typeof res.url === "string" && res.url.startsWith("https://checkout.stripe.com/")) {
      this.navigate(res.url);
    } else {
      this._set("error");
    }
  }

  /** @returns {Promise<boolean>} Whether the page was a return from Google sign-in. */
  async _finishGoogle() {
    const hash = new URLSearchParams(this.location.hash.replace(/^#/, ""));
    if (!hash.has("state")) return false;
    let pending = null;
    try {
      pending = JSON.parse(this._sessionGet(PENDING_KEY) || "null");
    } catch {
      /* no pending sign-in */
    }
    if (!pending || pending.state !== hash.get("state")) return false;
    this._sessionSet(PENDING_KEY, null);
    this._cleanUrl();
    const idToken = hash.get("id_token");
    if (!idToken) {
      this._set("cancelled");
      return true;
    }
    this._set("working");
    const res = await this.call("signin", { idToken, nonce: pending.nonce });
    this._save({ token: res.token, owned: res.owned === true, email: res.email ?? null });
    if (res.owned) this._set("owned");
    else if (pending.intent === "buy" && this.playApp) this._set("ready");
    else if (pending.intent === "buy") await this._checkout();
    else this._set("idle");
    return true;
  }

  /**
   * Detect Play Billing in the Play app: the localized price, and owned purchases re-sent to the
   * backend (restores a reinstall or a new phone, links them to the signed-in account).
   * @returns {Promise<boolean>} Whether Play Billing is available.
   */
  async _initPlay() {
    const goods = await this.digitalGoods();
    if (!goods) return false;
    this.playBilling = true;
    try {
      const [item] = await goods.getDetails([PLAY_PRODUCT]);
      if (item?.price) {
        this.priceLabel = new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: item.price.currency,
        }).format(Number(item.price.value));
      }
      const owned = (await goods.listPurchases()).find((p) => p.itemId === PLAY_PRODUCT);
      if (owned && !this.saved.owned) await this._sendPlayPurchase(owned.purchaseToken);
    } catch {
      /* the price and restore are best effort; buying still works */
    }
    this._set(this.saved.owned ? "owned" : this.status);
    return true;
  }

  /** Google Play's payment sheet, then the backend verifies and records the purchase. */
  async _playPurchase() {
    let response;
    try {
      response = await this.playPayment();
    } catch (err) {
      // AbortError: the player closed Google's sheet. Anything else means it could not open (or
      // Play refused the purchase); keep the reason so the link can show it.
      const e = /** @type {any} */ (err);
      if (e?.name === "AbortError") {
        this._set("cancelled");
      } else {
        this.lastError = `${e?.name || "Error"}${e?.message ? `: ${e.message}` : ""}`.slice(0, 80);
        console.warn("Play payment failed:", err);
        this._set("error");
      }
      return;
    }
    let owned = false;
    try {
      owned = await this._sendPlayPurchase(response.details.purchaseToken);
    } finally {
      await response.complete(owned ? "success" : "fail").catch(() => {});
    }
    if (!owned) this._set("error");
  }

  /**
   * @param {string} purchaseToken
   * @returns {Promise<boolean>} Whether the backend accepted it as owned.
   */
  async _sendPlayPurchase(purchaseToken) {
    const res = await this.call("play", { purchaseToken, token: this.saved.token });
    if (!res.owned) return false;
    this._save({ token: res.token || this.saved.token, owned: true });
    this._set("owned");
    return true;
  }

  /** @returns {Promise<boolean>} Whether the page was a return from Stripe Checkout. */
  async _finishStripe() {
    const query = new URLSearchParams(this.location.search);
    const result = query.get("purchase");
    if (!result) return false;
    this._cleanUrl();
    const sessionId = query.get("session_id");
    if (result !== "success" || !sessionId || !this.saved.token) {
      this._set("cancelled");
      return true;
    }
    this._set("working");
    const { owned } = await this.call("confirm", { token: this.saved.token, sessionId });
    this._save({ owned: owned === true });
    this._set(owned ? "owned" : "error");
    return true;
  }

  /** Drop the sign-in / checkout parameters from the address bar. */
  _cleanUrl() {
    try {
      this.history.replaceState(null, "", this.location.pathname);
    } catch {
      /* ignore */
    }
  }

  /** @param {PurchaseStatus} status */
  _set(status) {
    this.status = status;
    const state = { owned: this.owned, status };
    for (const fn of this.listeners) fn(state);
  }

  /** @param {Partial<{ token: string|undefined, owned: boolean, email: string|null }>} patch */
  _save(patch) {
    this.saved = { ...this.saved, ...patch };
    if (!this.saved.token) this.saved = { owned: false };
    try {
      this.storage.setItem(CONFIG.PURCHASES.STORAGE_KEY, JSON.stringify(this.saved));
    } catch {
      /* storage unavailable: state lives for this page only */
    }
  }

  _read() {
    try {
      const value = JSON.parse(this.storage.getItem(CONFIG.PURCHASES.STORAGE_KEY) || "{}");
      return value && typeof value === "object" ? value : {};
    } catch {
      return {};
    }
  }

  /** @param {string} key */
  _sessionGet(key) {
    try {
      return this.session.getItem(key);
    } catch {
      return null;
    }
  }

  /** @param {string} key @param {string|null} value */
  _sessionSet(key, value) {
    try {
      if (value === null) this.session.removeItem(key);
      else this.session.setItem(key, value);
    } catch {
      /* ignore */
    }
  }
}

/** @type {PurchaseManager|null} */
let instance = null;

/** The page's PurchaseManager (created on first use). */
export function getPurchases() {
  if (!instance) instance = new PurchaseManager();
  return instance;
}
