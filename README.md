# AI HORIZON

**Play now:** [agentmode.dev](https://www.agentmode.dev) (browser, installable) · [Google Play](https://play.google.com/store/apps/details?id=dev.agentmode.aihorizon)

**Architecture:** [watch the architecture video on YouTube](https://www.youtube.com/watch?v=zHNJO3Quy4g&list=PLJk1nicp9M5s)

An arcade-style space shooter for the browser: collect stars, blast asteroids, and beat the 90-second clock. Built with vanilla JavaScript and HTML5 Canvas, installable as a PWA, and backed by an optional serverless AWS leaderboard with AI run analysis.

After a run, **Share** on the leaderboard screen sends your score and the game link via the device's share sheet, or copies them to the clipboard where sharing isn't supported.

## Quick start

Requires Node 24+ (see `.nvmrc`; CI uses the same version).

```bash
npm install
npm run serve   # http://localhost:8000
```

## Commands

| Command            | Purpose                                   |
| ------------------ | ----------------------------------------- |
| `npm run serve`    | Dev server at http://localhost:8000       |
| `npm run build`    | Production build into `dist/`             |
| `npm test`         | Unit tests (Vitest)                       |
| `npm run ci:local` | Lint, format check, type check, and tests |

## Deploy

Copy the contents of `dist/` to static HTTPS hosting (production uses Amazon S3 behind CloudFront). The Lambda functions for the leaderboard and run analysis live in `server/lambda/`; the client's AWS endpoints are configured in `js/adapters/awsConfig.js`.

The leaderboard API accepts one score per request (`PUT ?id=1` with `{ "entry": { id, score, accuracy?, game-summary?, ai-analysis? } }`). The Lambda validates it (1–3 letter initials not on the blocklist, integer score up to `MAX_SCORE`), sets the date, ranks the top 10 and returns the authoritative list; it rejects full-list payloads from older clients with HTTP 400. Each entry must carry its `game-summary`, and the Lambda checks that the stats are physically possible (spawn rates, fire cooldown, hits per kill) and add up to the score using the game's scoring rules; the rules are mirrored in the Lambda and kept in sync with `js/constants.js` by a unit test. When `ALERT_TOPIC_ARN` is set, a new #1 and rejected run summaries (at most one per Lambda instance every 10 minutes) are e-mailed through SNS. Remove an entry with `node scripts/leaderboard-remove.cjs ABC` (dry run) and add `--yes` to apply. The initials blocklist exists both in `server/lambda/leaderboard.js` and `js/utils/initials.js`; a unit test keeps the two in sync. API Gateway stage throttling and reserved concurrency on the analysis Lambda are configured in AWS, not in this repo.

## URL flags

- `?seed=12345` — reproducible run
- `?autoplay=1` — autopilot plays the game
- `?debug=perf` — on-screen performance overlay

## Project layout

- `js/` — game source (core, entities, managers, systems, UI, AWS adapters)
- `server/lambda/` — AWS Lambda functions
- `tests/` — Vitest unit tests
- `scripts/` — headless-Chrome tooling (benchmarks, screenshots, recordings)
- `docs/` — architecture diagram (`architecture.drawio` is the editable source)
