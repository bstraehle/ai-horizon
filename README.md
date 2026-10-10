# AI HORIZON

<video src="docs/architecture.drawio.mp4" title="AI HORIZON architecture" controls autoplay loop muted playsinline></video>

An arcade-style space shooter for the browser: collect stars, blast asteroids, and beat the 90-second clock. Built with vanilla JavaScript and HTML5 Canvas, installable as a PWA, and backed by an optional serverless AWS leaderboard with AI run analysis. Controls and scoring are described in [`about.html`](about.html).

## Quick start

Requires Node 20.19+ or 22.12+.

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
