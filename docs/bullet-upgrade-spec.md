# Bullet Upgrade – specification (draft)

A one-time $0.99 purchase that gives the player upgraded bullets from the first shot of every
mission, instead of only after 2500 points. Scores flown with it carry a ⚡ badge on the
leaderboard. Real money, small amounts: the goal is to showcase commerce features (two payment
systems, one verified purchases backend, one identity across platforms), not revenue.

## 1. Product

|          |                                                                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name     | Bullet Upgrade                                                                                                                                        |
| Price    | $0.99 one-time (non-consumable, keep forever); local prices converted by Google / Stripe                                                              |
| Effect   | Upgraded bullets from the start of every mission (hardened and bonus asteroids take 50% fewer hits, the run-coloured bolts); no other gameplay change |
| Badge    | ⚡ after the initials on the leaderboard for scores flown with it                                                                                     |
| Web      | Stripe Checkout with **Managed Payments** (Stripe is merchant of record: tax, disputes, support)                                                      |
| Play app | **Google Play Billing** (Google is merchant of record)                                                                                                |
| Identity | None to play. At purchase, one tap **Sign in with Google**; the purchase belongs to that Google account on the web and in the Play app alike          |

Out of scope: subscriptions, other products, ads, refunds UI (handled by Google / Stripe).

## 2. Player experience

### 2.1 Home screen link

- A new `action-link` **"Bullet Upgrade"** left of About, Privacy, Sound, on the start and
  leaderboard screens (same style as Share).
- Not owned: opens the upgrade sheet (2.2).
- Owned: reads **"Bullet Upgrade ✓"**; opens a small sheet "Bullet Upgrade active – upgraded bullets
  from the first shot", with the signed-in account, "Manage purchase" (receipt link) and
  "Sign out".
- Purchases unavailable (offline, no backend, or the Play app before its Play Billing release): the
  link is hidden.

### 2.2 Upgrade sheet

- Title "Bullet Upgrade", one line on the effect, a note that leaderboard scores flown with it show
  ⚡, the localized price and a **Buy** button.
- Buy:
  1. If not signed in: Google's one-tap sign-in (Google Identity Services). If the account already
     owns the upgrade (bought on another device or platform), it unlocks right there – no payment.
  2. Web: redirect to Stripe Checkout, email prefilled from the Google account (cards, Apple Pay,
     Google Pay).
  3. Play app: Google's payment sheet (Payment Request API with Play Billing).
- Success: back in the game, a short confirmation "Bullet Upgrade active" and the link shows ✓.
- Cancel / failure: back to the sheet with a short message; nothing else changes.

### 2.3 In game

- With the upgrade, every mission starts with upgraded bullets; the 2500-point upgrade cue does not
  play (nothing left to upgrade).
- The HUD is unchanged.

### 2.4 Same purchase everywhere (no restore step)

- The purchase is stored against the Google account (its stable subject id), whichever platform it
  was bought on.
- Another device or browser: Google's automatic sign-in recognises the returning player on launch
  (no prompt when they have signed in before; a one-tap prompt otherwise, shown only from the
  Bullet Upgrade link, never over gameplay) and the upgrade is active.
- Play app: Play purchases also restore through Google Play itself; signing in links them to the
  account so they count on the web too.
- Clearing browser data only means one tap to sign in again.

### 2.5 Leaderboard

- Rows flown with the upgrade show ⚡ after the initials, for example
  `BJS ⚡ • 14759 • 58% • 2026-10-22`, with `title` / `aria-label` "Bullet Upgrade".
- The badge is decided by the server (section 5), never by the client alone.

## 3. Client design

- `js/managers/PurchaseManager.js` (new): owns sign-in, the entitlement state and the purchase flows.
  - `available` (purchases possible here), `owned` (entitlement verified), `price` (localized),
    `account` (signed-in email, for the sheet).
  - Sign-in: Google Identity Services (one tap / automatic sign-in); the Google ID token goes to the
    backend, which returns the account's entitlement token.
  - Platform detection: Play app = `window.getDigitalGoodsService` resolves for
    `https://play.google.com/billing`; otherwise web.
  - Web: `buy()` asks the backend for a Checkout Session URL and redirects; on return
    (`?purchase=success&session_id=…`) asks the backend to confirm and stores the entitlement token
    in localStorage (`aiHorizonEntitlement`).
  - Play app: `getDetails(["bullet_upgrade"])` for the price; `buy()` runs the Payment Request with
    the Play method; the purchase token goes to the backend, which verifies, acknowledges and
    records it for the account. On launch, `listPurchases()` re-verifies owned Play purchases.
  - Startup: a stored token is re-checked in the background; the game uses the cached result
    immediately so play is never blocked.
- `ScoringManager.isBulletUpgraded(score)` gains the entitlement: upgraded when
  `owned || score >= BULLET_UPGRADE_SCORE`. The run summary records `bulletUpgrade: true` so
  analysis and validation know.
- `js/ui/UpgradeLink.js` (new, like `Share.js` / `SoundToggle.js`): the link and the sheet.
- Analysis prompt: `bulletUpgrade` lets the debrief stop advising "reach 2500 points early to
  upgrade your bullets" for upgraded runs.
- Content-Security-Policy: allow Google Identity Services (`accounts.google.com`) and the Stripe
  redirect.

## 4. Backend design

New Lambda `ai-horizon-purchases` behind the existing API Gateway (IAM / SigV4 like the others),
plus a public Stripe webhook route.

| Route                      | Purpose                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /purchases/signin`   | Verify a Google ID token; return the account's entitlement token (owned or not)                                                                         |
| `POST /purchases/checkout` | Create a Stripe Checkout Session (Managed Payments, the `bullet_upgrade` price, the account as `client_reference_id`, email prefilled); returns its URL |
| `POST /purchases/confirm`  | After the redirect: look up the session, return the entitlement token if paid                                                                           |
| `POST /purchases/play`     | Verify a Play purchase token with the Play Developer API, acknowledge it, record it for the account, return the entitlement token                       |
| `POST /purchases/status`   | Validate an entitlement token (owned or revoked)                                                                                                        |
| `POST /stripe/webhook`     | Stripe events: `checkout.session.completed` (record), refunds / disputes (revoke); signature verified                                                   |

- **Entitlement token:** server-signed (HMAC, secret in Secrets Manager), naming the account and
  product, short-lived and refreshed by `/status`; sent with leaderboard submissions.
- **DynamoDB table `ai-horizon-purchases`:** keyed by Google account subject id; product, status
  (`active` / `revoked`), platform and purchase id (Stripe session / Play order id), Play purchase
  token (for re-verification), created / updated time. No card data and no email stored (Stripe
  keeps the receipt email).
- **Secrets (Secrets Manager):** Stripe secret key and webhook secret, Play service-account key,
  entitlement signing secret. The Google OAuth client id is public configuration.
- **Refunds:** the Stripe webhook and Google's voided-purchases API mark purchases `revoked`; the
  next status check removes the upgrade. Already submitted scores keep ⚡ (they were flown upgraded).

## 5. Leaderboard changes

- Submission carries the entitlement token when the run was upgraded; the leaderboard Lambda checks
  it (signature and status) and stores `bulletUpgrade: true` on the entry. Without a valid token,
  an upgraded run summary is rejected.
- `RULES` gains the purchase case: hardened and bonus hits use `UPGRADED_HITS_FACTOR` for the whole
  run when `bulletUpgrade` is set (today only after the 2500-point crossing), so the plausibility
  checks accept upgraded runs and reject faked ones. `tests/leaderboard.runSummary.test.js` covers it.
- Responses include `bulletUpgrade` per entry; the client renders ⚡.
- One shared leaderboard (⚡ makes upgraded scores visible); no separate board.

## 6. Pages, policy and docs

- `about.html`: scoring line "Bullet upgrade (after 2500 points, or from the start with the Bullet
  Upgrade): …", a short "Bullet Upgrade" section (price, what it does, works on every device signed
  in with the same Google account, refunds via Google / Stripe), and Stripe in the Technology line.
- `privacy.html`: Google sign-in (only for the Bullet Upgrade; the game keeps the account's id, not
  its profile), purchases (Stripe or Google process payment; the game stores the purchase id and
  status).
- A short terms / refund note (linked from the sheet and About), as Stripe and Play require.
- Play Console: Data safety form (purchase history, account identifier), the in-app product listing.
- Architecture diagram and narrated video: Google sign-in, Stripe, the purchases Lambda and table,
  the Play Developer API; a request-flow step for the purchase.
- `AGENTS.md`: deploy steps for the new Lambda, secrets, webhook, OAuth client and the Play product id.

## 7. Testing

- Unit tests: PurchaseManager (sign-in and both platforms with fakes), upgraded-from-start scoring,
  the link / sheet states, the purchases Lambda routes (Google token, Stripe and Play clients
  mocked), token signing and expiry, cross-platform ownership, the leaderboard's upgraded-run
  validation and ⚡.
- Stripe: test mode during development (test cards, webhook via the Stripe CLI), then a real $0.99
  purchase and refund in live mode before announcing.
- Play: license testers on the internal testing track, then one real purchase; check that a Play
  purchase unlocks the web for the same account and the reverse.

## 8. Setup you do (outside the code)

| Where           | What                                                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stripe          | Account with identity and bank verification; activate Managed Payments; product "Bullet Upgrade" $0.99 with an eligible video-game tax code; webhook endpoint (URL from us); keys into Secrets Manager |
| Google Cloud    | OAuth client (web) for Sign in with Google with `https://www.agentmode.dev` as origin; service account with the Play Developer API, invited in Play Console; its key into Secrets Manager              |
| Play Console    | Payments profile; in-app product `bullet_upgrade` $0.99, activated; license testers                                                                                                                    |
| Android wrapper | Enable Play Billing (Bubblewrap `playBilling`), rebuild, release                                                                                                                                       |

## 9. Phases

1. Web: Sign in with Google, Stripe Managed Payments, the purchases Lambda (signin / checkout /
   confirm / status / webhook), the link and sheet, upgraded-from-start scoring, leaderboard
   validation and ⚡, pages.
2. Play app: Play verification route, Digital Goods / Payment Request flow, wrapper release; the same
   account unlocks both.
3. Showcase: architecture diagram and video, About page section, store listing mention.

## 10. Decisions

- Badge: ⚡ after the initials.
- One purchase across the web and the Play app, tied to the Google account; no restore step.
- `noreply@agentmode.dev` was the planned restore-email sender; with Google sign-in no emails are
  sent by the game (Stripe and Google send the receipts), so no email setup is needed.
