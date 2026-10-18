# AGENTS.md

## Environment

- Node 24 (`.nvmrc`); CI reads the same file.

## Verify

- `npm run ci:local` (eslint, prettier check, tsc, vitest).

## Deploy (static site)

1. `npm run build`. This is the only command that writes `dist/` to disk; `npm run serve` / `watch`
   serve the bundle from memory, so `dist/` stays stale after dev-server sessions.
2. Bump `CACHE_VERSION` in `sw.js` whenever cached assets change (HTML, JS, CSS). Otherwise
   returning PWA / Play Store (TWA) users can get fresh HTML with a stale cached `bundle.js`.
3. Upload `dist/` to S3 and invalidate CloudFront. Lambdas in `server/lambda/` deploy separately.

## Testing against production

- Running the game locally talks to the production AWS leaderboard. In automated runs, block
  `*execute-api*`, `*cognito*`, and `*amazonaws*`, and never submit initials.
