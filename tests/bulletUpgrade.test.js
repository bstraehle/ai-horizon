import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG } from "../js/constants.js";
import { PurchaseManager } from "../js/managers/PurchaseManager.js";
import { ScoringManager } from "../js/managers/ScoringManager.js";
import { formatRow, normalize } from "../js/managers/leaderboard/LeaderboardFormatter.js";
import { initUpgradeLinks } from "../js/ui/UpgradeLink.js";

/** Minimal in-memory Storage. */
function memoryStorage() {
  const map = new Map();
  return /** @type {Storage} */ (
    /** @type {unknown} */ ({
      getItem: (/** @type {string} */ k) => (map.has(k) ? map.get(k) : null),
      setItem: (/** @type {string} */ k, /** @type {string} */ v) => map.set(k, String(v)),
      removeItem: (/** @type {string} */ k) => map.delete(k),
    })
  );
}

/** @param {Partial<Location>} [over] */
const fakeLocation = (over = {}) =>
  /** @type {Location} */ (
    /** @type {unknown} */ ({
      hostname: "localhost",
      origin: "http://localhost:8000",
      pathname: "/",
      hash: "",
      search: "",
      ...over,
    })
  );

/**
 * @param {{ location?: Location, storage?: Storage, session?: Storage, referrer?: string,
 *   replies?: Record<string, any>, goods?: any, playPayment?: any }} [opts]
 */
function setup(opts = {}) {
  const calls = /** @type {Array<[string, any]>} */ ([]);
  const navigate = vi.fn();
  const replaceState = vi.fn();
  const replies = opts.replies || {};
  const pm = new PurchaseManager({
    storage: opts.storage || memoryStorage(),
    session: opts.session || memoryStorage(),
    location: opts.location || fakeLocation(),
    history: /** @type {History} */ (/** @type {unknown} */ ({ replaceState })),
    referrer: opts.referrer || "",
    navigate,
    digitalGoods: async () => opts.goods || null,
    playPayment: opts.playPayment,
    call: async (action, body) => {
      calls.push([action, body]);
      const reply = replies[action];
      if (reply instanceof Error) throw reply;
      return typeof reply === "function" ? reply(body) : reply;
    },
  });
  return { pm, calls, navigate, replaceState };
}

describe("PurchaseManager", () => {
  it("is offered on dev hosts (test mode), not on production until LIVE, never in the Play app", () => {
    expect(setup().pm.available).toBe(true);
    const prod = fakeLocation({
      hostname: "www.agentmode.dev",
      origin: "https://www.agentmode.dev",
    });
    expect(setup({ location: prod }).pm.available).toBe(CONFIG.PURCHASES.LIVE);
    expect(setup({ referrer: "android-app://dev.agentmode.aihorizon/" }).pm.available).toBe(false);
  });

  it("buy() without an account redirects to Google sign-in with a nonce and state", async () => {
    const { pm, navigate } = setup();
    await pm.buy();
    const url = new URL(navigate.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe(CONFIG.PURCHASES.GOOGLE_CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:8000/");
    expect(url.searchParams.get("response_type")).toBe("id_token");
    expect(url.searchParams.get("nonce")).toMatch(/^[0-9a-f]{32}$/);
    expect(url.searchParams.get("state")).toMatch(/^[0-9a-f]{32}$/);
  });

  it("the Google return signs in and continues to Stripe Checkout", async () => {
    const session = memoryStorage();
    const storage = memoryStorage();
    const first = setup({ session, storage });
    await first.pm.buy();
    const auth = new URL(first.navigate.mock.calls[0][0]).searchParams;

    const back = setup({
      session,
      storage,
      location: fakeLocation({ hash: `#state=${auth.get("state")}&id_token=idt` }),
      replies: {
        signin: { token: "acct", owned: false, email: "p@example.com" },
        checkout: { url: "https://checkout.stripe.com/c/pay/cs_test_1" },
      },
    });
    await back.pm.init();
    expect(back.calls[0]).toEqual(["signin", { idToken: "idt", nonce: auth.get("nonce") }]);
    expect(back.calls[1]).toEqual([
      "checkout",
      { token: "acct", origin: "http://localhost:8000", email: "p@example.com" },
    ]);
    expect(back.navigate).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_test_1");
    expect(back.replaceState).toHaveBeenCalledWith(null, "", "/");
    expect(back.pm.token).toBe("acct");
  });

  it("an account that already owns the upgrade unlocks at sign-in without paying", async () => {
    const session = memoryStorage();
    const first = setup({ session });
    await first.pm.buy();
    const state = new URL(first.navigate.mock.calls[0][0]).searchParams.get("state");
    const back = setup({
      session,
      location: fakeLocation({ hash: `#state=${state}&id_token=idt` }),
      replies: { signin: { token: "acct", owned: true, email: null } },
    });
    await back.pm.init();
    expect(back.pm.owned).toBe(true);
    expect(back.calls.map(([a]) => a)).toEqual(["signin"]);
  });

  describe("in the Google Play app", () => {
    const PLAY = "android-app://dev.agentmode.aihorizon/";
    /** @param {Array<{ itemId: string, purchaseToken: string }>} [owned] */
    const goods = (owned = []) => ({
      getDetails: async () => [
        { itemId: "bullet_upgrade", price: { currency: "EUR", value: "0.99" } },
      ],
      listPurchases: async () => owned,
    });

    it("is offered once Play Billing is detected, with Play's local price", async () => {
      const without = setup({ referrer: PLAY });
      await without.pm.init();
      expect(without.pm.available).toBe(false);

      const { pm } = setup({ referrer: PLAY, goods: goods() });
      await pm.init();
      expect(pm.available).toBe(pm.location.hostname === "localhost" || CONFIG.PURCHASES.LIVE);
      expect(pm.priceLabel).toMatch(/0[.,]99/);
      expect(pm.priceLabel).toMatch(/€|EUR/);
    });

    it("restores an owned Play purchase on launch, without signing in", async () => {
      const { pm, calls } = setup({
        referrer: PLAY,
        goods: goods([{ itemId: "bullet_upgrade", purchaseToken: "ptok" }]),
        replies: { play: { owned: true, token: "play-acct" } },
      });
      await pm.init();
      expect(calls[0]).toEqual(["play", { purchaseToken: "ptok", token: undefined }]);
      expect(pm.owned).toBe(true);
      expect(pm.token).toBe("play-acct");
    });

    it("buys through Google Play's payment sheet when signed in", async () => {
      const storage = memoryStorage();
      storage.setItem(
        CONFIG.PURCHASES.STORAGE_KEY,
        JSON.stringify({ token: "acct", owned: false })
      );
      const complete = vi.fn(async () => {});
      const playPayment = vi.fn(async () => ({ details: { purchaseToken: "ptok" }, complete }));
      const { pm, calls, navigate } = setup({
        referrer: PLAY,
        storage,
        goods: goods(),
        playPayment,
        replies: { status: { owned: false }, play: { owned: true, token: "acct" } },
      });
      await pm.init();
      await pm.buy();
      expect(playPayment).toHaveBeenCalledTimes(1);
      expect(calls.at(-1)).toEqual(["play", { purchaseToken: "ptok", token: "acct" }]);
      expect(complete).toHaveBeenCalledWith("success");
      expect(pm.owned).toBe(true);
      expect(navigate).not.toHaveBeenCalled();
    });

    it("waits for a fresh tap after signing in, and a dismissed sheet is cancelled", async () => {
      const session = memoryStorage();
      const first = setup({ referrer: PLAY, session, goods: goods() });
      await first.pm.init();
      await first.pm.buy();
      const state = new URL(first.navigate.mock.calls[0][0]).searchParams.get("state");

      const playPayment = vi.fn(async () => {
        throw Object.assign(new Error("dismissed"), { name: "AbortError" });
      });
      const back = setup({
        session,
        goods: goods(),
        playPayment,
        location: fakeLocation({ hash: `#state=${state}&id_token=idt` }),
        replies: { signin: { token: "acct", owned: false, email: null } },
      });
      await back.pm.init();
      expect(back.pm.status).toBe("ready");
      expect(playPayment).not.toHaveBeenCalled();
      await back.pm.buy();
      expect(back.pm.status).toBe("cancelled");
    });

    it("reports why Google Play's payment sheet failed to open", async () => {
      const storage = memoryStorage();
      storage.setItem(
        CONFIG.PURCHASES.STORAGE_KEY,
        JSON.stringify({ token: "acct", owned: false })
      );
      const playPayment = vi.fn(async () => {
        throw Object.assign(new Error("The payment method is not supported"), {
          name: "NotSupportedError",
        });
      });
      const { pm } = setup({
        referrer: PLAY,
        storage,
        goods: goods(),
        playPayment,
        replies: { status: { owned: false } },
      });
      await pm.init();
      await pm.buy();
      expect(pm.status).toBe("error");
      expect(pm.lastError).toBe("NotSupportedError: The payment method is not supported");
    });
  });

  it("ignores a fragment whose state does not match", async () => {
    const { pm, calls } = setup({ location: fakeLocation({ hash: "#state=other&id_token=x" }) });
    await pm.init();
    expect(calls).toEqual([]);
  });

  it("the Stripe return confirms the session; cancel reports cancelled", async () => {
    const storage = memoryStorage();
    storage.setItem(CONFIG.PURCHASES.STORAGE_KEY, JSON.stringify({ token: "acct", owned: false }));
    const ok = setup({
      storage,
      location: fakeLocation({ search: "?purchase=success&session_id=cs_test_1" }),
      replies: { confirm: { owned: true } },
    });
    await ok.pm.init();
    expect(ok.calls).toEqual([["confirm", { token: "acct", sessionId: "cs_test_1" }]]);
    expect(ok.pm.owned).toBe(true);
    expect(JSON.parse(storage.getItem(CONFIG.PURCHASES.STORAGE_KEY) || "{}").owned).toBe(true);

    const cancel = setup({ location: fakeLocation({ search: "?purchase=cancel" }) });
    await cancel.pm.init();
    expect(cancel.pm.status).toBe("cancelled");
  });

  it("re-checks a saved account in the background; a rejected token signs out", async () => {
    const storage = memoryStorage();
    storage.setItem(CONFIG.PURCHASES.STORAGE_KEY, JSON.stringify({ token: "acct", owned: true }));
    const revoked = setup({ storage, replies: { status: { owned: false } } });
    expect(revoked.pm.owned).toBe(true);
    await revoked.pm.init();
    expect(revoked.pm.owned).toBe(false);
    expect(revoked.pm.token).toBe("acct");

    const expired = setup({
      storage,
      replies: { status: Object.assign(new Error("Sign in again"), { status: 401 }) },
    });
    await expired.pm.init();
    expect(expired.pm.token).toBeNull();
  });
});

describe("UpgradeLink", () => {
  /** @type {HTMLElement[]} */
  let links;
  /** @type {Document} */
  let doc;

  beforeEach(() => {
    vi.useFakeTimers();
    links = [0, 1].map(() => {
      /** @type {Record<string, Function>} */
      const handlers = {};
      return /** @type {any} */ ({
        hidden: true,
        textContent: "Bullet Upgrade",
        title: "",
        handlers,
        addEventListener: (/** @type {string} */ t, /** @type {Function} */ f) => (handlers[t] = f),
        removeEventListener: () => {},
      });
    });
    doc = /** @type {any} */ ({ querySelectorAll: () => links });
  });
  afterEach(() => vi.useRealTimers());

  /** @param {HTMLElement} el */
  const click = (el) => /** @type {any} */ (el).handlers.click({ preventDefault() {} });

  it("shows the links where available and asks to confirm the price before buying", () => {
    const { pm } = setup();
    const buy = vi.spyOn(pm, "buy").mockResolvedValue(undefined);
    initUpgradeLinks(pm, doc);
    expect(links.every((l) => !l.hidden && l.textContent === "Bullet Upgrade")).toBe(true);
    click(links[0]);
    expect(links[0].textContent).toBe(`Buy · ${CONFIG.PURCHASES.PRICE_LABEL}`);
    expect(buy).not.toHaveBeenCalled();
    click(links[1]);
    expect(buy).toHaveBeenCalledTimes(1);
  });

  it("the confirmation times out back to the label", () => {
    const { pm } = setup();
    const buy = vi.spyOn(pm, "buy").mockResolvedValue(undefined);
    initUpgradeLinks(pm, doc);
    click(links[0]);
    vi.advanceTimersByTime(CONFIG.PURCHASES.CONFIRM_MS);
    expect(links[0].textContent).toBe("Bullet Upgrade");
    click(links[0]);
    expect(buy).not.toHaveBeenCalled();
  });

  it("marks an owned upgrade and hides where unavailable", () => {
    const storage = memoryStorage();
    storage.setItem(CONFIG.PURCHASES.STORAGE_KEY, JSON.stringify({ token: "a", owned: true }));
    initUpgradeLinks(setup({ storage }).pm, doc);
    expect(links[0].textContent).toBe("Bullet Upgrade ✓");
    const play = setup({ referrer: "android-app://dev.agentmode.aihorizon/" }).pm;
    initUpgradeLinks(play, doc);
    expect(links.every((l) => l.hidden)).toBe(true);
  });
});

describe("upgraded bullets and the leaderboard badge", () => {
  it("a purchased upgrade is active from the first shot; otherwise from the threshold", () => {
    const threshold = CONFIG.GAME.BULLET_UPGRADE_SCORE;
    expect(ScoringManager.bulletUpgradeActive({ score: 0, bulletUpgradePurchased: true })).toBe(
      true
    );
    expect(ScoringManager.bulletUpgradeActive({ score: 0 })).toBe(false);
    expect(ScoringManager.bulletUpgradeActive({ score: threshold })).toBe(true);
    expect(ScoringManager.bulletUpgradeActive(null)).toBe(false);
  });

  it("shows ⚡ after the initials of upgraded runs only", () => {
    const [plain, upgraded] = normalize([
      { id: "AAA", score: 900, accuracy: 0.5, date: "2026-11-01" },
      { id: "BJS", score: 800, accuracy: 0.58, date: "2026-11-01", bulletUpgrade: true },
    ]);
    expect(formatRow(plain, 0).text).toBe("🥇 AAA • 900 • 50% • 2026-11-01");
    expect(formatRow(upgraded, 1).text).toBe("🥈 BJS ⚡ • 800 • 58% • 2026-11-01");
    expect(normalize([{ id: "X", score: 1, bulletUpgrade: "yes" }])[0].bulletUpgrade).toBe(
      undefined
    );
  });
});
