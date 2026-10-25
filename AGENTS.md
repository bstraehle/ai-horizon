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
   The analysis Lambda's Bedrock prompts are the `PERSONAS` (one system prompt per debrief
   commander, Vega and Altair) / `PROMPT` constants in `server/lambda/analysis.js` (not env vars:
   Lambda caps all env vars at 4 KB), so prompt changes need a code redeploy. The client picks the
   commander (`js/managers/Commanders.js`) and sends it as `commander`; each persona has a fixed
   voice and its own headline shape (Vega 2 sentences, Altair 3-4, enforced by `tidyHeadline`).
   Vega speaks with a Polly generative voice; Altair with the owner's custom ElevenLabs voice
   (`PERSONAS.altair.elevenlabs`, model `ELEVENLABS.model` = `eleven_v4`, in every language),
   falling back to a male Polly voice (none in nl/pl: then the debrief is text only) when
   ElevenLabs fails or takes over `ELEVENLABS.timeoutMs`. The model writes a `draft` and then the
   proofread `feedback`; the draft is dropped before responding. Env vars: `MODEL_ID` (it calls
   the Converse API with a forced tool call, so any Converse model with tool use works:
   `us.anthropic.claude-haiku-4-5-20251001-v1:0`) and `ELEVENLABS_SECRET_ID` (the Secrets Manager
   secret `Eleven_Labs`, JSON `{ apiToken, apiTokenRegion }`; unset → Altair uses Polly). Note
   `update-function-configuration --environment` replaces all env vars, so always pass both.
   The function role's inline policies must allow `bedrock:InvokeModel` on that model in every
   region its cross-region profile routes to, `polly:SynthesizeSpeech`, and
   `secretsmanager:GetSecretValue` on the secret plus `kms:Decrypt` on its customer-managed key
   (via Secrets Manager). To try prompt changes before deploying, run the exported
   prompt helpers against `aws bedrock-runtime converse` (Windows CLI: pass `file://` JSON with
   non-ASCII escaped and set `PYTHONUTF8=1`).

## Store video (16:9 4K, with game sound)

Only the 4K cut is kept (no 1080p version). With `npm run serve` running:

1. `node --experimental-websocket scripts/record-autoplay.cjs --width=960 --height=540 --scale=4 --seed=2024 --out=store-video/_raw-3840x2160.mp4 --sfx=store-video/_sfx-3840x2160.json`
   (about 60 min; frame-stepped, so audio is captured as a sound-event log, not recorded). The
   post-run screens call the production analysis Lambda (a real AI debrief, never an initials
   submission). Once the debrief has arrived, the recorder replays the incoming transmission (2 s)
   and the headline typing out frame by frame in the game's own panel; the segments' frames are
   logged (`[record] typing from frame …`). A fresh profile flying the full mission gets Captain
   Altair's debut debrief. Keep the machine otherwise idle (no second render or other heavy
   work): CPU contention can change the seeded run (seed 2024 then crashed at about 45 s instead
   of flying the full 90 s).
   The recorder also captures the debrief's spoken clip from the AI response: the headline types
   in sync with it, the voice meters follow it, and it is logged as the timeline's `comms` track.
2. `node --experimental-websocket scripts/render-sfx.cjs --events=store-video/_sfx-3840x2160.json`
   (writes the game sounds and, with a voice clip, `_sfx-3840x2160-comms.wav`: the commander's
   voice through the game's radio chain).
3. `python store-video/narrate.py --raw store-video/_raw-3840x2160.mp4 --size 3840x2160 --out store-video/ai-horizon-3840x2160.mp4 --sfx store-video/_sfx-3840x2160.wav --comms store-video/_sfx-3840x2160-comms.wav`
   (needs AWS credentials for Polly, which voices the host, and an ElevenLabs API key for the
   narrator, the owner's custom voice on `eleven_v4`: `ELEVENLABS_API_KEY` or
   `.secrets/api_key.txt`, gitignored; clips are cached in `store-video/.elevenlabs-cache/`, so
   delete one to re-generate it; `--sfx-lu` sets how far the game sits under the voice-over).
   The commander's voice is mixed at narrator loudness and narration cues that would overlap it
   start after it, so the video's length follows the clip.

Frames are piped to ffmpeg (no temp PNGs). The MP4 exceeds GitHub's 100 MB file limit, so it is
gitignored (its `.srt` is committed); upload it to YouTube instead. Narration cue times in
`store-video/narration.json` follow the post-run timeline logged in step 1.

Only the game-over/debrief/leaderboard screens changed (UI tweak)? Run step 1 with
`--splice=store-video/_raw-3840x2160.mp4 --out=store-video/_raw-3840x2160.new.mp4` added (it
re-steps the run without capturing, verifies it matches the earlier raw video, and replaces only
the frames from game over on), skip step 2 (the sound timeline is unchanged), run step 3 with
`--raw` pointing at the new file, then move it over the old raw for next time. This only works
when the game-over dialog's first frame and the sounds are unchanged (the splice checks that frame
against the old video); otherwise do the full render. The 4K landscape screenshots
(`store-screenshots/3840x2160`) are frames of the raw video: `4-gameover.png` is frame 6620 (the
held debrief) and `5-leaderboard.png` frame 6900 (extract with
`-vf "select=eq(n\,6620)" -frames:v 1 -pix_fmt rgb24`: 24-bit, no alpha). The frames move with
the post-run timeline: pick them from the `[record] debrief / initials / leaderboard from frame …`
lines of step 1.

## Testing against production

- Running the game locally talks to the production AWS leaderboard. In automated runs, block
  `*execute-api*`, `*cognito*`, and `*amazonaws*`, and never submit initials.
