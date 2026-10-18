# AI HORIZON

**Architecture:** [watch the architecture video on YouTube](https://www.youtube.com/watch?v=zHNJO3Quy4g&list=PLJk1nicp9M5s)

An arcade-style space shooter for the browser: collect stars, blast asteroids, and beat the 90-second clock. Built with vanilla JavaScript and HTML5 Canvas, installable as a PWA, and backed by an optional serverless AWS leaderboard with AI run analysis. Controls and scoring are described on the [About page](https://www.agentmode.dev/about.html).

**Play now:** [agentmode.dev](https://www.agentmode.dev) (browser, installable) · [Google Play](https://play.google.com/store/apps/details?id=dev.agentmode.aihorizon)

Sound effects are synthesized live with the Web Audio API (no audio files): layered, distorted impacts panned to where the hit happens (the same for regular asteroids and hits on armored planets), planet explosions with sub-bass, rumble and debris (bonus planets detonate twice), star pickups that climb a musical scale on quick streaks, a brighter chime for bonus stars, and a crash when your ship is hit. When the bullet caliber upgrades at 2,500 points, a power-up cue plays and impacts get heavier for the rest of the run. With sound on, the Game Over headline is also read aloud by an Amazon Polly generative voice, alternating female and male (falling back to whichever the player's language offers, or no narration if it has none); with sound off, Polly is never called. Toggle them with **Sound: On/Off** on the start and leaderboard screens or the **M** key; the choice is remembered. The leaderboard keeps the top 10 scores.

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

Copy the contents of `dist/` to static HTTPS hosting (production uses Amazon S3 behind CloudFront). The Lambda functions for the leaderboard and run analysis live in `server/lambda/`; the client's AWS endpoints are configured in `js/adapters/awsConfig.js`. The analysis Lambda's role needs `polly:SynthesizeSpeech` (in addition to Bedrock access) for the spoken headline; without it the debrief still works, just silently.

Link previews (Open Graph / Twitter card tags in `index.prod.html` and `about.html`) point at `https://www.agentmode.dev/og-image.png`, which the build copies from `store-screenshots/ai-horizon-1024x500.png`. Update those URLs, and `CONFIG.SHARE.URL` in `js/constants.js`, if the game moves to another domain.

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
