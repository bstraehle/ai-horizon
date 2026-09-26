#!/usr/bin/env node
/**
 * store-screenshots – regenerate the Google Play listing screenshot sets.
 *
 * Usage:
 *   node --experimental-websocket scripts/store-screenshots.cjs [url] [--out=store-screenshots]
 *       [--seed=12345] [--only=1440x2880] [--chrome=<path>]
 *   npm run shots:store
 *
 * Writes four PNGs per target size into <out>/<W>x<H>/:
 *   1-initial.png      start screen (title + Launch Mission)
 *   2-midgame.png      gameplay; the latest of several takes (~6/9/12s in) made while the run was
 *                      still alive, so a short autopilot run still yields an in-game frame
 *   3-gameover.png     post-game debrief, captured once the AI analysis has finished
 *   4-leaderboard.png  leaderboard; initials are left empty so NO score is submitted
 *
 * Each size renders at a phone/tablet-like CSS viewport with an integer device scale, and passes the
 * same factor as `?dpr=` so the canvas is drawn at full output resolution. Play Console requires
 * 320–3840px per side and a longer side at most 2x the shorter one; keep TARGETS within that.
 *
 * The dev server must be running (`npm run serve`). Gameplay is driven by the built-in autopilot
 * (`?autoplay=1`) with a fixed seed; pass `--seed=` to vary the run if a take looks weak.
 */
const path = require("node:path");
const { capture } = require("./screenshot.cjs");

const TARGETS = [
  { w: 1440, h: 2880, css: [360, 720], scale: 4 }, // phone (2:1)
  { w: 1000, h: 1600, css: [500, 800], scale: 2 }, // 7-inch tablet
  { w: 1500, h: 2400, css: [750, 1200], scale: 2 }, // 10-inch tablet
];

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const base = (args.find((a) => !a.startsWith("--")) || "http://localhost:8000").replace(/\/$/, "");
const outRoot = opt("out", "store-screenshots");
const seed = opt("seed", "12345");
const only = opt("only", "");
const chrome = opt("chrome", "");

/** Gameplay is live: the start overlay is gone and the game-over dialog has not appeared. */
const RUNNING =
  "document.getElementById('gameInfo').hidden && document.getElementById('gameOverScreen').hidden";
/** Game-over dialog is showing and the debrief has rendered (Ok re-enabled). */
const DEBRIEF_READY =
  "!document.getElementById('gameOverScreen').hidden && !document.getElementById('okBtn').disabled";
/** Skip the optional initials step without submitting: an empty entry just advances. */
const SKIP_INITIALS = `(() => {
  const screen = document.getElementById('initialsScreen');
  if (!screen || screen.hidden) return 'no-initials';
  const input = document.getElementById('initialsInput');
  if (input) input.value = '';
  document.getElementById('submitScoreBtn').click();
  return 'skipped';
})()`;
const LEADERBOARD_VISIBLE = "!document.getElementById('leaderboardScreen').hidden";

async function main() {
  const targets = TARGETS.filter((t) => !only || `${t.w}x${t.h}` === only);
  if (!targets.length) throw new Error(`no target matches --only=${only}`);
  const missing = [];
  for (const t of targets) {
    const outDir = path.join(outRoot, `${t.w}x${t.h}`);
    const common = { outDir, width: t.css[0], height: t.css[1], scale: t.scale, chrome };
    console.error(`\n== ${t.w}x${t.h} (css ${t.css[0]}x${t.css[1]} @${t.scale}x) -> ${outDir}`);

    await capture({
      ...common,
      url: `${base}/?dpr=${t.scale}`,
      actions: ["wait 3000", "shot 1-initial"],
    });

    const files = await capture({
      ...common,
      url: `${base}/?seed=${seed}&autoplay=1&dpr=${t.scale}`,
      timeoutMs: 150000,
      actions: [
        "wait 6000",
        `shotif 2-midgame ${RUNNING}`,
        "wait 3000",
        `shotif 2-midgame ${RUNNING}`,
        "wait 3000",
        `shotif 2-midgame ${RUNNING}`,
        `waitfor ${DEBRIEF_READY}`,
        "wait 500",
        "shot 3-gameover",
        "click #okBtn",
        "wait 500",
        `eval ${SKIP_INITIALS}`,
        `waitfor ${LEADERBOARD_VISIBLE}`,
        "wait 800",
        "shot 4-leaderboard",
      ],
    });
    if (!files.some((f) => f.endsWith("2-midgame.png"))) {
      missing.push(`${t.w}x${t.h}`);
      console.error(`[store] ${t.w}x${t.h}: run ended before 6s, no 2-midgame.png (try --seed=)`);
    }
  }
  if (missing.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error("[store-screenshots] failed:", err && err.message ? err.message : err);
  process.exit(1);
});
