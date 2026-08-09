# AI Horizon

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

## Players

If you are playing the game, the main controls and scoring details are described in `about.html`.

For the best experience:

- open the game in a modern browser
- use a local server when running it from source
- try different seeds with `?seed=...` to explore different runs

For remote leaderboard support, the app should be served over HTTPS in production.

## 18. Windows specific tips

- PowerShell execution policy errors with Husky scripts: run `Set-ExecutionPolicy -Scope LocalMachine RemoteSigned` (or Bypass at session scope) if hooks fail to execute.
- Use `py -m http.server` instead of `python` if only launcher installed.
- Terminal rendering slow in some emulators? Use Windows Terminal or VS Code integrated terminal for best ANSI performance.

---

Happy hacking!
