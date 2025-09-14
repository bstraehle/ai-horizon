## AI HORIZON — updated

Fast, responsive space shooter built with HTML5 Canvas and vanilla JavaScript (ES modules). Collect stars, destroy asteroids, and chase a new high score — some asteroids are indestructible.

See `about.html` for controls, scoring, and gameplay tips.

## Quick start

This project uses native ES modules, so the game must be served from an HTTP server (file:// won’t work).

Recommended local flows:

- Using Node.js (recommended for development):
  - Install dependencies: `npm install`
  - Start a dev server (esbuild + serve): `npm run serve` (serves from project root on port 8000)
  - Rebuild on file changes: `npm run watch`
- Simple static preview (no Node.js required):
  - From PowerShell: `py -m http.server 8000` then open http://localhost:8000
  - Or use any static file server (e.g. `npx serve`)

Build for production:

- Run: `npm run build` — bundles `js/game.js` with esbuild into `dist/bundle.js` and runs a `postbuild` step that prepares `dist/index.html` and copies static assets.
- Preview the `dist/` output by serving the folder (e.g. `py -m http.server 8000` and open http://localhost:8000/dist/).

## Scripts and tooling

Key npm scripts (see `package.json`):

- `npm run build` — bundle and minify with esbuild
- `npm run postbuild` — copies assets and prepares `dist/index.html`
- `npm run watch` — esbuild in watch mode (writes to `dist/`)
- `npm run serve` — esbuild bundle with a built-in dev server on port 8000
- `npm run lint` / `npm run lint:fix` — eslint checks and autofix
- `npm run format` — formats files with Prettier
- `npm run typecheck` — runs TypeScript type checks (project uses JSDoc + checkJs)
- `npm test` — runs unit tests with Vitest

Dev dependencies include: esbuild, eslint, prettier, vitest, jsdom, husky, and TypeScript.

## Troubleshooting

- Blank page or “Failed to load module script/CORS” → you opened via file://. Start a server (see above).
- `python` not recognized on Windows → use `py -m http.server 8000`.
- Port already in use → try another port, e.g. `py -m http.server 5500`.
- High score not saving → Private/Incognito may block `localStorage`.

## Features

- Desktop and mobile friendly (keyboard, mouse, and touch)
- Smooth animations with requestAnimationFrame
- Starfield, nebulae, engine glow, explosions, and particle FX
- High score persisted with `localStorage` (leaderboard entries stored under `aiHorizonLeaderboard`)
- Accessibility touches: focus guards for overlays, ARIA labels, and restored focus on tab return
- Indestructible asteroids appear periodically to increase challenge

## Project structure (high-level)

- `index.html` — App shell and canvas
- `index.prod.html` — Production HTML used to create `dist/index.html` in `postbuild`
- `style.css` — Layout and responsive styles
- `js/` — game logic and modules
  - `js/constants.js` — tunable settings
  - `js/game.js` — game loop, state, and orchestration (entry point used by esbuild)
  - `js/entities/` — entity classes (Player, Asteroid, Bullet, etc.)
  - `js/managers/` — managers for input, rendering, spawning, UI, collisions, view
- `server/lambda/` — an example AWS Lambda for leaderboard (optional server-side)
- `tests/` — Vitest unit tests and edge tests

## Types and developer notes

The project uses JSDoc typedefs (see `js/types.js`) together with TypeScript's checker for stronger editor tooling without converting runtime files to TypeScript.

Where helpful, modules reference shared typedefs via JSDoc imports (e.g. `import('../types.js').TypeName`).

## Testing and CI

- Unit tests: `npm test` (Vitest)
- Lint: `npm run lint`; CI enforces `npm run lint:ci` (no warnings)
- Pre-commit hooks: husky + lint-staged are configured in `package.json` to run eslint and prettier on changed files

## Deploy

This is a static site. Options:

- GitHub Pages: push the repo and enable Pages for the repository root or deploy the `dist/` folder to your Pages site.
- Netlify / Vercel: connect the repo, or drag-and-drop the `dist/` folder for static hosting.

If you use the production build, point your hosting publish directory to `dist/`.

## Contributing

Contributions are welcome. Run the test suite and linters locally before opening a PR:

- Install deps: `npm install`
- Format: `npm run format`
- Lint: `npm run lint` (or `npm run lint:fix`)
- Test: `npm test`

Please follow existing code style (JSDoc types, small focused modules) and keep changes small and focused.

---

If you'd like, I can also:

- add a tiny example `npm start` script that runs a static server,
- add a short CONTRIBUTING.md,
- or run the formatter on the repo now.

Completion: README synchronized with current scripts and tooling.

## Refactor summary (September 2025)

Recent cleanup focused on maintainability and consistency:

- Removed overly verbose / redundant JSDoc prose while preserving type info.
- Standardized short, action‑oriented comments; eliminated stale notes.
- Simplified core systems (`EventBus`, `GameLoop`, state machine, input) and ensured safe handler iteration.
- Tightened manager/entity modules (rendering, collisions, background) without changing behavior.
- Added lightweight parameter JSDoc where implicit `any` surfaced after comment reduction.
- Ensured unsubscribe-during-emit semantics preserved via handler snapshot in `EventBus.emit`.
- Ran ESLint + Prettier to enforce style; all tests pass (`npm test`).

Guidelines going forward:

- Prefer concise comments that explain why, not what; rely on clear naming.
- Keep entities self‑contained (state + draw + reset) for pooling.
- When adding events, register side-effects in `systems/EventHandlers.js` to centralize logic.
- For new utility modules, include minimal JSDoc on public surface; skip narration.
- Run `npm run lint:ci` before PRs to catch warnings promoted to errors in CI.

Happy hacking!

### Visual tweak (September 2025)

Red bonus star palette darkened ("blackened crimson") to better match the near-black contrast of indestructible asteroid rims while remaining hue-distinct from the neutral gray stars. New values (`STAR_RED`):

- IN `#c9a2a2`
- BASE `#9f5d5d`
- MID `#6b2c2c`
- OUT `#1a0b0b`

The shift lowers saturation/brightness to avoid candy red glow and improves silhouette legibility over dark backgrounds. Previous palette kept inline in `constants.js` comment for quick A/B if needed.

Update (later September 2025): Red bonus stars converted to a monochrome palette (no hue) to fully match the indestructible asteroid aesthetic while still differentiating from normal stars via slightly brighter core and deeper outer rim. New monochrome values: IN #e0e0e0 | BASE #b8b8b8 | MID #6a6a6a | OUT #1a1a1a.
