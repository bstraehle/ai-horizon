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

## Store video (16:9, with game sound)

With `npm run serve` running:

1. `node --experimental-websocket scripts/record-autoplay.cjs --width=960 --height=540 --scale=2 --seed=2024 --out=store-video/_raw-1920x1080.mp4 --sfx=store-video/_sfx-1920x1080.json`
   (about 25 min; frame-stepped, so audio is captured as a sound-event log, not recorded).
2. `node --experimental-websocket scripts/render-sfx.cjs --events=store-video/_sfx-1920x1080.json`
3. `python store-video/narrate.py --raw store-video/_raw-1920x1080.mp4 --size 1920x1080 --out store-video/ai-horizon-1920x1080.mp4 --sfx store-video/_sfx-1920x1080.wav`
   (needs AWS credentials for Polly; `--sfx-lu` sets how far the game sits under the voice-over).

## Testing against production

- Running the game locally talks to the production AWS leaderboard. In automated runs, block
  `*execute-api*`, `*cognito*`, and `*amazonaws*`, and never submit initials.
