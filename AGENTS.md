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
3. Upload `dist/` to S3 and invalidate CloudFront. Lambdas in `server/lambda/` deploy separately:
   each is a single-file zip whose entry is `index.mjs` (handler `index.handler`), e.g. copy
   `server/lambda/leaderboard.js` to `index.mjs`, zip it, and
   `aws lambda update-function-code --function-name ai-horizon-leaderboard --zip-file fileb://leaderboard.zip --region us-west-2`.
   Functions: `ai-horizon-leaderboard`, `ai-horizon-analysis` (API `0p6x6bw6c2`, stage `dev`).
   The leaderboard Lambda mirrors scoring constants (`RULES`) and the initials blocklist; when
   changing `CONFIG.GAME` scoring/spawn values, update `RULES` and redeploy the Lambda (tests fail
   until they match). Alerts go to SNS topic `ai-horizon-alerts` via env var `ALERT_TOPIC_ARN`.
   The analysis Lambda's Bedrock prompts are the `SYSTEM_PROMPT` / `PROMPT` constants in
   `server/lambda/analysis.js` (not env vars: Lambda caps all env vars at 4 KB), so prompt changes
   need a code redeploy. Its only env var is `MODEL_ID`: it calls the Converse API with a forced
   tool call, so any Converse model with tool use works (`us.anthropic.claude-haiku-4-5-20251001-v1:0`).
   The function role's inline policy must allow `bedrock:InvokeModel` on that model in every region
   its cross-region profile routes to. To try prompt changes before deploying, run the exported
   prompt helpers against `aws bedrock-runtime converse` (Windows CLI: pass `file://` JSON with
   non-ASCII escaped and set `PYTHONUTF8=1`).

## Store video (16:9, with game sound)

With `npm run serve` running:

1. `node --experimental-websocket scripts/record-autoplay.cjs --width=960 --height=540 --scale=2 --seed=2024 --out=store-video/_raw-1920x1080.mp4 --sfx=store-video/_sfx-1920x1080.json`
   (about 20-25 min; frame-stepped, so audio is captured as a sound-event log, not recorded). The
   post-run screens are real time and call the production analysis Lambda (a real AI debrief,
   never an initials submission); the debrief is captured once its headline has typed out.
2. `node --experimental-websocket scripts/render-sfx.cjs --events=store-video/_sfx-1920x1080.json`
3. `python store-video/narrate.py --raw store-video/_raw-1920x1080.mp4 --size 1920x1080 --out store-video/ai-horizon-1920x1080.mp4 --sfx store-video/_sfx-1920x1080.wav`
   (needs AWS credentials for Polly; `--sfx-lu` sets how far the game sits under the voice-over).

Only the game-over/debrief/leaderboard screens changed (UI tweak)? Run step 1 with
`--splice=store-video/_raw-1920x1080.mp4 --out=store-video/_raw-1920x1080.new.mp4` added (a few
minutes: it re-steps the run without capturing, verifies it matches the earlier raw video, and
replaces only the frames from game over on), skip step 2 (the sound timeline is unchanged), run
step 3 with `--raw` pointing at the new file, then move it over the old raw for next time. This
only works when the game-over dialog's first frame and the sounds are unchanged (the splice checks
that frame against the old video); otherwise do the full render. The 4K
landscape screenshots (`store-screenshots/3840x2160`) are frames of the 4K raw video, e.g.
`4-gameover.png` is frame 5850.

4K: same steps with `--scale=4` and `3840x2160` in the file names/`--size`. The layout (960x540
CSS) and seed are unchanged, so the run, sound timeline and narration timing match the 1080p cut.
Frames are piped to ffmpeg (no temp PNGs); the render takes about 4x as long. The 4K MP4 exceeds
GitHub's 100 MB file limit, so it is gitignored; upload it to YouTube instead of committing it.

## Testing against production

- Running the game locally talks to the production AWS leaderboard. In automated runs, block
  `*execute-api*`, `*cognito*`, and `*amazonaws*`, and never submit initials.
