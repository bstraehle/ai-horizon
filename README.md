## AI HORIZON

Fast, responsive HTML5 Canvas space shooter written in modern (native ESM) vanilla JavaScript. Collect stars, survive escalating asteroid waves (including hardened "planet" variants), and chase a local + optional remote leaderboard.

For player‑facing controls & scoring details see `about.html`. This document is for developers: setup, architecture, configuration surface, extension points, and contribution standards.

---

## Contents

1. Quick start
2. Prerequisites & environment
3. Scripts / tooling
4. Features overview
5. Project layout
6. Architecture (loops, states, entities, managers, systems)
7. Leaderboard (async + conflict handling)
8. Determinism & seeding
9. Configuration (`CONFIG`) & tuning
10. Types & JSDoc conventions
11. Commenting style
12. Testing strategy
13. Performance & profiling notes
14. Deployment
15. Extending the game
16. Contributing & code quality
17. Troubleshooting FAQ
18. Windows specific tips

---

## 1. Quick start

Native ES modules mean you MUST serve over HTTP (no `file://`).

Development (hot iteration):

1. Install deps: `npm install`
2. Start dev server (esbuild serve on port 8000): `npm run serve`
3. Open: http://localhost:8000
4. Run tests in parallel if desired: `npm run test:watch`

Low‑friction static preview (no Node toolchain):

PowerShell (Windows): `py -m http.server 8000` then open http://localhost:8000 (ensure you first ran a build so `dist/` exists or serve root for dev bundle).

Production build:

1. `npm run build` → bundles `js/game.js` to `dist/bundle.js` (minified + sourcemap) then `postbuild` copies assets + crafts `dist/index.html`.
2. Serve the `dist/` directory from any static host.

---

## 2. Prerequisites & environment

Node: >= 20.19.0 (or 22.12.0+) per `engines`. Earlier versions may work but are not CI supported.

Browsers: Latest Chrome / Firefox / Safari / Edge. Mobile Safari & Chrome tested for DPR scaling & touch input.

Optional: Python (for the quick local static server example), AWS account (if deploying the sample Lambda leaderboard endpoint).

---

## 3. Scripts / tooling

| Script                            | Purpose                                      |
| --------------------------------- | -------------------------------------------- |
| `npm run serve`                   | Dev server (esbuild + static) on port 8000   |
| `npm run watch`                   | Rebuild on change (outputs to `dist/`)       |
| `npm run build`                   | Production bundle (minify + sourcemap)       |
| `npm run postbuild`               | Copy assets + generate `dist/index.html`     |
| `npm run lint` / `lint:fix`       | ESLint (flat config, jsdoc + prettier rules) |
| `npm run lint:ci`                 | ESLint with zero warnings allowed (CI gate)  |
| `npm run format` / `format:check` | Prettier write / verify                      |
| `npm run typecheck`               | TypeScript semantic checking of JSDoc types  |
| `npm test` / `test:watch`         | Vitest unit + edge tests                     |

Dev dependencies: esbuild, vitest, jsdom, eslint (flat), prettier, husky, lint-staged, typescript.

Git hooks: `prepare` installs husky; pre-commit runs lint-staged (ESLint + Prettier on staged files).

### Local CI parity & Git hooks

GitHub Actions (see `.github/workflows/ci.yml`) runs these steps on every push / PR:

1. `npm run lint:ci` (no warnings permitted)
2. `npm run format:check`
3. `npm run typecheck`
4. `npm test`

Run them locally in one shot:

```
npm run ci:local
```

Hooks configured via Husky:

| Hook       | Action                                      |
| ---------- | ------------------------------------------- |
| pre-commit | `lint-staged` (ESLint --fix + Prettier)     |
| pre-push   | `npm run ci:local` full gate before pushing |

Bypass (rare, last resort) with `--no-verify` on commit or push.

---

## 4. Features overview

Gameplay / visuals:

- Layered starfield + nebula fog with parallax
- Hardened planetary asteroids (shield + multi-hit) altering pacing & scoring
- Particle FX: explosions, engine trail, crater dust puffs, score popups

Systems / architecture:

- Deterministic RNG (seed via `?seed=NUMBER` OR any string hashed) for reproducibility
- Object pools for all transient entities (bullets, asteroids, particles, etc.) to minimize GC pressure
- Central `EventBus` for decoupled messaging
- Finite `GameStateMachine` driving START → PLAYING → PAUSED → GAME_OVER
- Rate limiter gating fire cadence

UX & accessibility:

- Keyboard + mouse + touch abstraction
- Overlay focus management; ARIA labels on main interactive elements
- Responsive canvas scaling with configurable DPR caps (desktop vs mobile)

Developer ergonomics:

- Plain JS + rich JSDoc types (fast iteration, no transpilation for dev)
- Esbuild cold builds typically <100ms on modern hardware
- Comprehensive test coverage for core logic & tricky edges

---

## 5. Project layout

```
js/
  constants.js        Design tokens & tunables (deep-frozen CONFIG)
  game.js             Orchestrates loop, managers, pools, lifecycle
  core/               EventBus, GameLoop, GameContext, GameStateMachine, InputState
  entities/           Player, Asteroid, Bullet, Star, Explosion, Particle, Nebula, EngineTrail, Background
  managers/           Render, Spawn, Collision, UI, View, Leaderboard, Background, Sprite
  systems/            UpdateSystems (per-frame functions), EventHandlers (register listeners)
  adapters/           LocalStorageAdapter, RemoteStorageAdapter (leaderboard persistence abstraction)
  server/lambda/      Example AWS Lambda handler for remote leaderboard
utils/                ObjectPool, RNG, RateLimiter, etc.
tests/                Vitest specs (unit, edge, stress)
docs/                 Documentation (commenting guide)
```

Principle: entities are primarily data + update/draw; managers orchestrate lifecycles & policies; systems hold pure logic; core provides infrastructure primitives and shared context.

---

## 6. Architecture deep dive

### Core loop

`GameLoop` (RAF driven) calls `tick(deltaMs)`. `game.js` manages fixed-step-ish timing safeguards (see `CONFIG.TIME`) and processes systems in an ordered pipeline: input → spawning → movement → collisions → scoring → effects → render.

### State machine

`GameStateMachine` holds canonical states (START, PLAYING, PAUSED, GAME_OVER). Transitions emit events (`game:start`, `game:pause`, etc.) which `systems/EventHandlers.js` subscribes to for resets, overlay visibility, and pool flushes.

### Event bus

`EventBus` provides `on/off/emit/clear`. Emission snapshots handlers enabling safe unsubscription during dispatch. Consolidated registration avoids distributed side-effects.

### Entities & pooling

All ephemeral game objects implement `reset()` for reuse. `ObjectPool` supports pre-warm (tested by warmup specs) to avoid first-frame stutter. Pools cover: bullets, asteroids, explosions, particles, stars, nebula blobs, engine trail segments.

### Rendering

`RenderManager` clears & draws backgrounds, entities, FX, UI overlays. `SpriteManager` precomputes gradients & cached sprites derived from `CONFIG.COLORS` to avoid per-frame gradient creation.

### Spawning & pacing

`SpawnManager` schedules asteroids/stars with difficulty ramps (desktop vs mobile rates in `CONFIG.GAME.*_DESKTOP/MOBILE`). Planetary (hardened) asteroids inserted after a threshold (`ASTEROID_NORMAL_BEFORE_HARDENED`).

### Collision & scoring

`CollisionManager` uses a simple partition grid to test bullet–asteroid and player–asteroid overlaps; produces events for explosions, score popups, and game over transitions. Scoring constants in `CONFIG.GAME` unify tuning.

### Input

`InputManager` normalizes multi-device input into `InputState`. Movement keys & pause codes live under `CONFIG.INPUT`.

### Determinism & RNG

`RNG` seeds from query param `?seed=...` (numeric) OR any string hashed. Facilitates reproducible bug reports & consistent performance benchmarks.

### Rate limiting

`RateLimiter` ensures fire cooldown (`CONFIG.GAME.SHOT_COOLDOWN` ms) independent of frame rate.

### Constants & balancing

`constants.js` exports deeply frozen `CONFIG` (visual palettes, spawn rates, speeds, scoring). Adjust numbers centrally—avoid scattering magic values. Provide rationale comments for non-obvious balance choices.

---

## 7. Leaderboard (async + conflict resolution)

`LeaderboardManager` now exposes fully async mutating operations (`load`, `save`, `submit`). Remote mode (flag `LeaderboardManager.IS_REMOTE`, default: `true`) persists to an AWS Lambda endpoint (`REMOTE_ENDPOINT`).

Conflict handling: On HTTP 409-like responses the manager merges server + local entries (retaining higher per-id scores), re-sorts, and retries up to 3 attempts with version-aware optimistic concurrency.

Local only mode: Set `LeaderboardManager.IS_REMOTE = false;` early (e.g. in `game.js`) to avoid network usage / enable offline dev tests.

Formatting & qualification delegated to pure helpers in `js/managers/leaderboard/` for better test isolation (`LeaderboardFormatter.js`, `LeaderboardRepository.js`).

High score derivation: The displayed high score mirrors the max leaderboard entry; no separate storage key is maintained.

---

## 8. Determinism & seeding

Use query parameter: `?seed=12345` or `?seed=myPhrase`. Non-numeric seeds are hashed to a numeric seed. This affects spawn ordering, star colors, and other RNG-driven decisions enabling reproducible runs.

---

## 9. Configuration (`CONFIG`) & tuning

All gameplay + visual tuning lives centrally in `js/constants.js` exporting a deeply frozen `CONFIG` object. High‑level namespaces (ASTEROID, GAME, PLAYER, STAR, STARFIELD, NEBULA, INPUT, TIME, SPEEDS, COLORS, etc.) group related parameters.

Guidelines:

- Never sprinkle magic numbers in feature code—add or reuse a named constant.
- Favor ratios / factors (e.g. `HARDENED_SPEED_FACTOR`) over repeating absolute speeds so balance changes cascade predictably.
- Document rationale inline for non-obvious numbers (spawn pacing thresholds, performance caps) so future adjustments remain intentional.
- Use existing variation keys (`*_VAR`, `*_VARIATION`) to express randomness bounds; keep naming consistent.

Common adjustments:

| Goal                                  | Knobs                                                                                        |
| ------------------------------------- | -------------------------------------------------------------------------------------------- |
| Increase difficulty ramp              | Decrease `GAME.ASTEROID_NORMAL_BEFORE_HARDENED`, increase `GAME.ASTEROID_SPAWN_RATE_DESKTOP` |
| Shorter session                       | Lower `GAME.TIMER_SECONDS`                                                                   |
| More bonus stars                      | Decrease `GAME.STAR_NORMAL_BEFORE_BONUS`                                                     |
| Cap visual density on low-end devices | Reduce `GAME.STARFIELD_COUNT_MOBILE`, `NEBULA.COUNT_MOBILE`, adjust `VIEW.DPR_MOBILE_MAX`    |
| Faster player                         | Increase `SPEEDS.PLAYER` (watch collision balance)                                           |

Adding a new constant: add under the appropriate namespace, maintain UPPER_SNAKE_CASE, and ensure tests referencing balance still pass. Because `CONFIG` is deeply frozen, attempts to mutate at runtime will throw in strict mode, surfacing mistakes early.

Seeded determinism: Many rates combine deterministic scheduling with RNG variation; reproducibility depends on keeping ordering stable. When inserting a new system that consumes randomness, consider whether it shifts sequence for existing systems (update tests or isolate RNG usage if necessary).

---

## 10. Types & JSDoc conventions

Shared typedefs in `js/types.js`. Reference via `import('./types.js').TypeName` for structural types; avoids circular deps and enables editor IntelliSense with `// @ts-check` files. Prefer documenting intent & shape over repeating trivial param docs.

---

## 11. Commenting style

See `docs/COMMENTING_GUIDE.md` for rationale and examples. Highlights:

- Intent / rationale > narrating code
- Keep file headers only where non-trivial context matters
- Use JSDoc for public APIs & complex data structures
- Remove stale comments aggressively
- Justify perf-sensitive patterns (pooling, micro-alloc avoidance)

---

## 12. Testing strategy

Tests (Vitest + jsdom where DOM required) cover:

- Core infrastructure (event bus, state machine, RNG, rate limiter)
- Collision detection (grid partitioning + edge cases)
- ObjectPool warmup & stress
- Visual logic proxies (palette rotation, star layer distribution, nebula visibility)
- Leaderboard: formatting, qualification, conflict retries
- Reset & teardown flows (full reset / score popup clearing)

Commands:

- Single pass: `npm test`
- Watch mode: `npm run test:watch`

CI reliability: remote leaderboard calls are suppressed in tests (environment detection) to eliminate flakes.

---

## 13. Performance & profiling notes

- Object pooling eliminates the majority of GC churn during peak spawn waves.
- Precomputed gradients & sprites drastically reduce per-frame canvas state churn.
- Fixed upper bound on nebula blobs & particle counts keeps worst-case frame time predictable.
- Deterministic RNG seeds allow reproducible performance benchmarks (run with identical seed to compare changes).
- Runtime performance monitor (see `CONFIG.PERFORMANCE`) auto-scales visual density on sustained slow frames: caps DPR, trims starfield counts, reduces spawn rates, and lowers particle budgets on low-power devices while leaving high-end rigs untouched.

Potential future optimizations (not yet implemented):

- OffscreenCanvas adoption for background layers
- Web Worker for collision partition rebuild in very dense fields
- Sprite atlas extraction for reduced draw calls if moving beyond vector/gradient approach

---

### Lightweight profiling

Use a fixed seed (e.g. `?seed=bench`) when profiling to eliminate run‑to‑run variance. Capture performance in Chrome Performance panel during a consistent time slice (e.g. first 30s). Compare flame charts across changes while holding seed + window size constant. Avoid enabling DevTools throttling unless evaluating worst‑case scenarios.

Micro‑alloc tracking: Enable the Allocation instrumentation on timeline; object pooling should yield stable low churn after warmup. Unexpected spikes typically indicate: forgotten pool reuse, creation inside hot loops, or inadvertent array growth.

Canvas overdraw: Toggle paint flashing to ensure large fills (background gradients) are not redrawn more than necessary. `RenderManager` batches layered draws intentionally; keep new effects similarly batched.

Potential next optimizations (tracked): OffscreenCanvas for background, Worker for collision partition, sprite atlas if moving toward bitmap sprites.

---

## 14. Deployment

Any static host works:

- GitHub Pages: build then either serve from root (dev server friendly) or push only `dist/`.
- Netlify / Vercel: build command `npm run build`, publish directory `dist`.
- S3 + CloudFront: upload `dist/` contents with proper `Content-Type`. Add cache bust query param (`?v=TIMESTAMP`) on manual updates if not using hashed filenames.

No server logic required except optional remote leaderboard Lambda.

---

## 15. Extending the game

Adding a new entity:

1. Create file in `entities/` implementing `reset()` and `update(dt, ctx)` + `draw(ctx2d)`.
2. Add pool logic in `game.js` (pre-warm if spawn-heavy) or extend an existing manager.
3. Emit / listen to events via `EventBus` instead of tight coupling where possible.
4. Add tests (behavioral + edge) under `tests/` focusing on logic, not rendering fidelity.

Adding a new system:

1. Add pure function(s) in `systems/UpdateSystems.js` (or new module) operating on plain objects.
2. Register side-effect handlers (if needed) in `systems/EventHandlers.js`.
3. Insert invocation in the ordered pipeline inside `game.js` (maintain determinism ordering comment block if present).

Remote leaderboard customization:

- Adjust `LeaderboardManager.REMOTE_ENDPOINT` for your deployed API.
- Consider toggling `IS_REMOTE` false in forks without remote infra.

---

## 16. Contributing & code quality

Style & linting:

- ESLint (flat config) + Prettier: run `npm run lint:fix` before pushing.
- Pre-commit hook auto-formats staged files.

Types:

- Run `npm run typecheck` to surface structural issues early.

Commits:

- Keep messages imperative ("Add X", "Fix Y") and reference rationale if non-obvious.

PR expectations:

- Include or update tests when altering logic.
- Avoid regressions in existing Vitest suite.
- Document new configuration flags in this README.

---

## 17. Troubleshooting FAQ

| Symptom                                  | Likely cause                    | Fix                                                   |
| ---------------------------------------- | ------------------------------- | ----------------------------------------------------- |
| Blank page / CORS module errors          | Launched via `file://`          | Serve over HTTP (see Quick start)                     |
| `python` not recognized (Windows)        | Python launcher only            | Use `py -m http.server 8000`                          |
| Port 8000 busy                           | Another process bound           | Use different port (e.g. 5500) or kill process        |
| High score not persisting                | Incognito / blocked storage     | Use normal window; check console for storage errors   |
| Remote leaderboard empty                 | Remote disabled / network issue | Verify `LeaderboardManager.IS_REMOTE` and network tab |
| JSDoc types not showing                  | Editor using bundled TS         | Switch to workspace TS + run `npm run typecheck`      |
| Unexpected leaderboard order             | Async merge after conflict      | Check devtools console for conflict retries           |
| Inconsistent behavior vs another machine | Different RNG seed              | Pass `?seed=XYZ` to reproduce                         |

---

## 18. Windows specific tips

- PowerShell execution policy errors with Husky scripts: run `Set-ExecutionPolicy -Scope LocalMachine RemoteSigned` (or Bypass at session scope) if hooks fail to execute.
- Use `py -m http.server` instead of `python` if only launcher installed.
- Terminal rendering slow in some emulators? Use Windows Terminal or VS Code integrated terminal for best ANSI performance.

---

Happy hacking!
