import { CONFIG } from "../constants.js";

/**
 * UpgradeLink – the "Bullet Upgrade" links on the start and leaderboard screens.
 *
 * Links (not buttons) for the same reason as the Sound and Share controls: the overlays' focus
 * locks only let links take focus besides their primary button. Hidden where the upgrade cannot
 * be bought (see `PurchaseManager.available`).
 *
 * Labels: "Bullet Upgrade" → first click asks "Buy · $0.99" (the Play app shows Play's local
 * price; a second click within `CONFIG.PURCHASES.CONFIRM_MS` starts Google sign-in, then Stripe
 * Checkout or Google Play's payment sheet) → "Opening…" while working → "Bullet Upgrade ✓" once
 * owned (clicking it then just confirms it is active). Back from sign-in in the Play app the link
 * keeps asking "Buy · …" until tapped, since the payment sheet needs a fresh tap.
 * Cancelled or failed purchases show a short message for `CONFIG.SHARE.FEEDBACK_MS`.
 *
 * @param {import('../managers/PurchaseManager.js').PurchaseManager} purchases
 * @param {Document} [doc]
 * @returns {() => void} Teardown that removes all listeners.
 */
export function initUpgradeLinks(purchases, doc = document) {
  const links = /** @type {HTMLElement[]} */ (Array.from(doc.querySelectorAll(".upgrade-link")));
  const P = CONFIG.PURCHASES;
  /** @type {ReturnType<typeof setTimeout>|null} */
  let timer = null;
  let confirming = false;

  /** @param {string} text */
  const show = (text) => {
    for (const el of links) {
      el.hidden = !purchases.available;
      el.textContent = text;
    }
  };
  const label = () => (purchases.owned ? "Bullet Upgrade ✓" : "Bullet Upgrade");
  const buyLabel = () => `Buy · ${purchases.priceLabel || P.PRICE_LABEL}`;
  /** @param {string} text @param {number} ms */
  const flash = (text, ms) => {
    if (timer) clearTimeout(timer);
    show(text);
    timer = setTimeout(() => {
      confirming = false;
      show(label());
    }, ms);
  };

  /** @param {import('../managers/PurchaseManager.js').PurchaseState} state */
  const render = ({ status }) => {
    confirming = false;
    if (status === "cancelled") flash("Purchase cancelled", CONFIG.SHARE.FEEDBACK_MS);
    else if (status === "error") {
      const reason = purchases.lastError;
      flash(
        reason ? `Purchase failed (${reason})` : "Purchase failed",
        reason ? 8000 : CONFIG.SHARE.FEEDBACK_MS
      );
    } else {
      if (timer) clearTimeout(timer);
      // "ready": signed in inside the Play app; the payment sheet needs a fresh tap.
      confirming = status === "ready";
      show(status === "working" ? "Opening…" : confirming ? buyLabel() : label());
    }
  };

  /** @param {Event} e */
  const onClick = (e) => {
    e.preventDefault();
    if (purchases.status === "working") return;
    if (purchases.owned) {
      flash("Upgrade active", CONFIG.SHARE.FEEDBACK_MS);
    } else if (!confirming) {
      flash(buyLabel(), P.CONFIRM_MS);
      confirming = true;
    } else {
      if (timer) clearTimeout(timer);
      confirming = false;
      purchases.buy();
    }
  };
  /** @param {KeyboardEvent} e */
  const onKey = (e) => {
    if (e.key !== " " && e.code !== "Space") return;
    e.stopPropagation();
    onClick(e);
  };

  for (const el of links) {
    el.title = "Upgraded bullets from the first shot of every mission";
    el.addEventListener("click", onClick);
    el.addEventListener("keydown", onKey);
  }
  const unsubscribe = purchases.onChange(render);
  render({ owned: purchases.owned, status: purchases.status });

  return () => {
    if (timer) clearTimeout(timer);
    for (const el of links) {
      el.removeEventListener("click", onClick);
      el.removeEventListener("keydown", onKey);
    }
    unsubscribe();
  };
}
