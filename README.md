## AI HORIZON

Fast, responsive HTML5 Canvas space shooter written in modern (ESM) vanilla JavaScript. Collect stars, survive waves of asteroids (some indestructible), and push the global / local high score.

See `about.html` for controls, scoring, and gameplay tips. This README focuses on development, architecture, and extension guidance.

## Quick start

Native ES modules mean you MUST use an HTTP server (no `file://`).

Development (recommended):

1. Install deps: `npm install`
2. Start dev server (esbuild + live serve, port 8000): `npm run serve`
3. Iterate. Tests: `npm test`.

Low‑friction static preview (no Node required):

PowerShell: `py -m http.server 8000` then browse to http://localhost:8000

Production build:

1. `npm run build` → bundles `js/game.js` to `dist/bundle.js` (minified + sourcemap) and runs `postbuild` (copies assets + crafts `dist/index.html`).
2. Serve the `dist/` directory (e.g. `py -m http.server 8000` and visit http://localhost:8000/dist/).

## Tooling & scripts

Core scripts (see `package.json`):

| Script                      | Purpose                                    |
| --------------------------- | ------------------------------------------ |
| `npm run serve`             | Dev server (esbuild + static) on port 8000 |
| `npm run watch`             | Rebuild on change (writes to `dist/`)      |
| `npm run build`             | Production bundle + minify + sourcemap     |
| `npm run postbuild`         | Copy assets + generate `dist/index.html`   |
| `npm run lint` / `lint:fix` | ESLint (with jsdoc + prettier rules)       |
| `npm run format`            | Prettier write                             |
| `npm run typecheck`         | TypeScript checker over JSDoc types        |
| `npm test` / `test:watch`   | Vitest unit + edge tests                   |

Other dev dependencies: esbuild, vitest, jsdom, eslint (flat config), prettier, husky, lint-staged, typescript.

## Troubleshooting

| Symptom                           | Likely cause                | Fix                                                               |
| --------------------------------- | --------------------------- | ----------------------------------------------------------------- |
| Blank page / CORS module errors   | Using `file://`             | Run any HTTP server (see Quick start)                             |
| `python` not recognized (Windows) | Python launcher only        | Use `py -m http.server 8000`                                      |
| Port 8000 busy                    | Another process             | Pick another port (e.g. 5500)                                     |
| High score not persisting         | Incognito / storage blocked | Use normal window; check console for storage errors               |
| Leaderboard remote empty          | Remote disabled / network   | See `LeaderboardManager.IS_REMOTE`; check network tab             |
| JSDoc types ignored in editor     | Type checking off           | Ensure editor uses workspace TypeScript & run `npm run typecheck` |

## Features

Gameplay / visuals:

- Layered starfield & nebula fog with parallax cues
- Indestructible (planetary) asteroid variant introducing pacing & scoring spikes
- Compact particle FX: explosions, engine trail, crater puffs, score popups

Systems / architecture:

- Deterministic RNG (seed via `?seed=NUMBER` or string hashed) for reproducible runs
- Object pools for bullets, particles, asteroids, stars, explosions (reduced GC churn)
- Central `EventBus` decoupling systems & UI
- Finite `GameStateMachine` governing menu, playing, paused, game over
- Rate limiter for fire cadence (prevents burst spam)

UX & accessibility:

- Keyboard, mouse, and touch input abstraction
- Focus management across overlays; ARIA labels on prominent interactive elements
- Responsive canvas scaling with DPR caps for mobile

Dev ergonomics:

- Pure JS with rich JSDoc typedefs + TypeScript checking (no build step for types)
- Fast esbuild bundling; <100ms cold builds on modern hardware
- Extensive Vitest coverage for core logic & edge cases

## Project layout (high level)

```
js/
  constants.js        Core tunables & palettes (deep-frozen)
  game.js             Entry point: orchestrates managers, systems, state
  core/               Event bus, loop, context, state machine, input snapshot
  entities/           Render/update units (Player, Asteroid, Bullet, Star, ...)
  managers/           Higher-order orchestration (Render, Spawn, Collision, UI, View, Leaderboard)
  systems/            Pure update & event reaction helpers (UpdateSystems, EventHandlers)
  utils/              ObjectPool, RNG, RateLimiter, etc.
  adapters/           Storage & Remote leaderboard adapter abstractions
  server/lambda/      Optional AWS Lambda (example remote leaderboard handler)
tests/                Vitest specs (unit + stress + edge)
```

Key separation: entities are data + draw/update; managers coordinate groups & policies; systems hold pure functions; core supplies infrastructure primitives.

## Architecture overview

### Core loop

`GameLoop` drives a `tick(deltaMs)` using `requestAnimationFrame`. `game.js` maintains accumulated time, converts to seconds for timers, and updates systems in a deterministic order: input → spawning → movement → collisions → scoring → effects → render.

### State machine

`GameStateMachine` implements a minimal finite set: START, PLAYING, PAUSED, GAME_OVER (exact enum in `types.js`). Transitions emit events consumed by `EventHandlers` (e.g. to reset pools, show overlays, stop timers).

### Events

`EventBus` offers `on/off/emit/clear`. Emission snapshots handlers to allow safe unsubscribe during iteration. Events include gameplay transitions, scoring, entity lifecycle notifications. Central registration lives in `systems/EventHandlers.js` to avoid scattered side-effects.

### Entities & pooling

Entities (asteroids, bullets, explosions, particles, stars, nebula blobs, engine trail segments) are lightweight objects with `reset()` for reuse. `ObjectPool` prefers instance-level `reset` when present, otherwise uses a provided `resetFn`. Pools are pre‑warmed in `game.js` for smooth first engagement.

### Rendering

`RenderManager` clears / draws background layers, entities, FX, and UI overlays. Sprites are precomputed by `SpriteManager` from palette constants to minimize per-frame gradient creation.

### Spawning & pacing

`SpawnManager` schedules asteroid & star spawn cadence based on dynamic difficulty ramps and RNG. Indestructible asteroids spawn at configured intervals and carry higher point value / visual distinctness.

### Collision & scoring

`CollisionManager` partitions space (simple grid) & resolves bullet–asteroid and player–asteroid intersections. Score popups & explosions are emitted via events; `LeaderboardManager` tracks high score and (optionally) remote persistence.

### Input

`InputManager` normalizes keyboard, mouse, and touch into an `InputState` consumed each frame. Pausing uses a whitelist of key codes to avoid accidental triggers.

### Determinism & RNG

`RNG` provides seeded pseudorandom values. Accepts numeric seed via query param or string hashed to seed. Great for reproducing bugs / speedrun seeds.

### Rate limiting

`RateLimiter` enforces fire cooldown, sourced from `CONFIG.GAME.SHOT_COOLDOWN` and supplied current time provider.

### Constants & balancing

`constants.js` exports a deeply frozen `CONFIG`. Palettes include dated commentary for art direction audit trail. When adjusting numbers, favor adding short rationale comments to assist future balancing.

### Leaderboard

`LeaderboardManager` composes adapters: local storage by default; optional remote via `RemoteAdapter` (fetch) and example AWS Lambda (`server/lambda/ai-horizon-leaderboard.js`). Repository + formatter modules handle persistence normalization and display formatting.

## Types & JSDoc

`js/types.js` defines shared typedefs (events, states, shapes). Runtime code remains plain JS for minimal friction while still enjoying IDE intellisense through `// @ts-check` (selectively disabled in a few high-churn files). Prefer referencing shared types via `import('./types.js').TypeName` to avoid circular imports.

## Commenting style

See `docs/COMMENTING_GUIDE.md` for the full style guide. Core principles:

- Describe intent & rationale, not the literal code.
- Keep top-of-file headers only for non-trivial modules (purpose, responsibilities, key decisions).
- Public methods documented with succinct JSDoc (`@param`, `@returns`) – omit boilerplate for trivially obvious void setters.
- Reference shared typedefs instead of re-declaring shapes.
- Remove stale comments aggressively; correctness > quantity.
- Justify performance-sensitive patterns (pooling, defensive clamps) with a short note.

## Testing

Vitest is configured (see `tests/`). Categories:

- Core correctness (event bus, state machine, RNG, rate limiter)
- Collision accuracy & edge conditions
- ObjectPool stress & warmup behavior
- Visual logic proxies (palette rotation, star layers) via deterministic assertions
- Leaderboard formatting & qualification rules

Run: `npm test` (single run) or `npm run test:watch`.

Lint before commit: `npm run lint` (CI uses `lint:ci`). Formatting enforced via pre-commit (husky + lint-staged).

## Deployment

Pure static output. Any static host works:

- GitHub Pages: enable Pages (root) or publish only `dist/`.
- Netlify / Vercel: connect repo (build command: `npm run build`; publish dir: `dist`) or drag‑drop the built folder.
- S3 + CloudFront (or similar): upload contents of `dist/` with correct `Content-Type` headers.

Cache hint: you can add a simple query param bust (`?v=TIMESTAMP`) to script tag if doing manual CDN uploads.
