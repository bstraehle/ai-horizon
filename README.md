# AI Horizon

![AI Horizon system architecture](docs/architecture.svg)

AI Horizon is a fast, responsive HTML5 Canvas space shooter built with vanilla JavaScript and ES modules. It combines arcade action, particle-heavy visuals, deterministic seeded runs, and a local/remote leaderboard.

## Quick start

Requirements: Node 20.19+ or 22.12+.

1. Install dependencies: `npm install`
2. Start the dev server: `npm run serve`
3. Open http://localhost:8000

For a production build, run `npm run build` and serve the generated `dist/` folder.

> The game must be served over HTTP because it uses ES modules.

## Current highlights

- Fast gameplay with layered starfields, nebula effects, and asteroid waves
- Hardened planetary asteroids, score popups, and impact effects
- Deterministic runs via `?seed=...`
- Local and optional remote leaderboard support with conflict retry
- PWA-friendly assets and mobile-friendly controls

## Visual design

The look is a "deep-space neon" system: a near-black indigo field with a soft vignette, cyan for everything that belongs to the player (ship, bolts, UI accent), warm gold for pickups, hot orange/red for danger, and violet/pink vs. cyan/teal nebulae that alternate between runs.

- Colours live in one place: `CONFIG.COLORS` in `js/constants.js` for the canvas, mirrored by the CSS custom properties at the top of `style.css` for the HUD and screens. Change a token there rather than hard-coding a colour.
- Entities are procedural "lit vector" art (irregular rocks with rim light, shaded planets with atmosphere and glowing cracks, a delta-wing ship with engine glow, glowing bolts and stars) rendered once into cached sprites; per-frame cost stays a `drawImage`.
- Motion flourishes — ship banking, asteroid spin, pickup pulse, explosion shockwave, hit flash, brief screen shake on big impacts — are render-only (the fixed-step simulation and seeded runs are unaffected) and are switched off when the OS requests `prefers-reduced-motion`.
- `npm run shots -- "<url>" --actions="wait 3000; shot name"` captures headless-Chrome screenshots for visual QA (see `scripts/screenshot.cjs` for the action syntax).

## Project structure

- `js/` — game loop, entities, managers, systems, adapters, and constants
- `tests/` — Vitest coverage for gameplay logic and edge cases
- `server/lambda/` — example remote leaderboard endpoint
- `docs/` — architecture and supporting documentation

## Development commands

- `npm run serve` — start the dev server
- `npm run build` — create the production bundle
- `npm run test` / `npm run test:watch` — run tests
- `npm run lint` / `npm run lint:fix` — lint and fix issues
- `npm run typecheck` — validate JSDoc-based type checking
- `npm run ci:local` — run the full local verification suite
- `npm run perf:bench -- http://localhost:8000` — headless-Chrome benchmark run (see below)

The production build produces two flat script files in `dist/`: `bundle.js` (the game) and `Cognito.js` (the AWS SDK used for the remote leaderboard, loaded on demand via `import()` the first time a signed request is needed). The initial download therefore contains game code only, and deploying is still a plain copy of the `dist/` folder contents.

### Profiling flags

Diagnostics are opt-in via query parameters and cost nothing when absent:

- `?debug=perf` — on-screen frame diagnostics (fps, update/draw ms with p95, entity and pool counts, sprite cache sizes, adaptive performance level, canvas resolution). A JSON session summary is logged to the console at game over.
- `?autoplay=1` — a scripted pilot drives the ship and auto-starts the game, for reproducible profiling runs.

Combine them with a fixed seed for before/after comparisons, e.g. `http://localhost:8000/?seed=12345&debug=perf&autoplay=1`.

`npm run perf:bench -- <url>` automates this: it launches headless Chrome (or Edge) against the URL with those flags, waits for the game-over summary and prints it as JSON. Runs use software rendering, so compare two runs against each other rather than against real-device targets. Node 22+ has the required WebSocket built in; the script passes `--experimental-websocket` for Node 20/21.

## Players

If you are playing the game, the main controls and scoring details are described in `about.html`.

For the best experience:

- open the game in a modern browser
- use a local server when running it from source
- try different seeds with `?seed=...` to explore different runs

For remote leaderboard support, the app should be served over HTTPS in production.

---

Happy hacking!
