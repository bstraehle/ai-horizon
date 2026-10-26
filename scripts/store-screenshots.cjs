#!/usr/bin/env node
/**
 * store-screenshots – regenerate the Google Play listing screenshot sets.
 *
 * Usage:
 *   node --experimental-websocket scripts/store-screenshots.cjs [url] [--out=store-screenshots]
 *       [--seed=314] [--only=1440x2880] [--size=WxH[@scale]]... [--chrome=<path>]
 *   npm run shots:store
 *
 * One debrief on every screen: the game-over shot of each size shows the same debrief (headline,
 * Well done / Next mission, commander) and HUD (score, accuracy, high score), saved in
 * `--debrief=<file>` (default store-screenshots/debrief.json, committed). Each size still flies
 * its own run behind the dialog; once its own debrief has rendered, the dialog and HUD are
 * replaced with the saved ones. When the file is missing, or with `--new-debrief`, the first
 * size's real debrief is saved instead (check its headline before re-shooting the rest, e.g. for
 * time-of-day phrases such as "Monday morning" that age badly in a store listing).
 *
 * `--size` renders an extra ad-hoc output size (repeatable) in addition to TARGETS. Without an
 * explicit `@scale` the largest integer factor of both sides that keeps the CSS width >= 360px is
 * used (1440x2960 -> 360x740 @4). Note that 1440x2960 itself breaks the Play Console 2:1 rule.
 *
 * Writes four PNGs per target size into <out>/<W>x<H>/:
 *   1-initial.png      start screen (title + Launch Mission)
 *   2-midgame.png      gameplay; the latest of several takes (~6/9/12s in) made while the run was
 *                      still alive, so a short autopilot run still yields an in-game frame
 *   3-gameover.png     post-game debrief, captured once the AI analysis has finished and its
 *                      headline has typed out
 *   4-leaderboard.png  leaderboard; initials are left empty so NO score is submitted
 *
 * Each size renders at a phone/tablet-like CSS viewport with an integer device scale, and passes the
 * same factor as `?dpr=` so the canvas is drawn at full output resolution. Play Console requires
 * 320–3840px per side and a longer side at most 2x the shorter one; keep TARGETS within that.
 *
 * The dev server must be running (`npm run serve`). Gameplay is driven by the built-in autopilot
 * (`?autoplay=1`); each target carries the seed that gave it a long run (the pilot's survival
 * depends on the viewport width, and adaptive quality makes runs only roughly repeatable), and
 * `--seed=` overrides it for every size if a take looks weak.
 */
const fs = require("node:fs");
const path = require("node:path");
const { capture } = require("./screenshot.cjs");

const TARGETS = [
  { w: 1440, h: 2880, css: [360, 720], scale: 4, seed: 17 }, // phone (2:1)
  { w: 1000, h: 1600, css: [500, 800], scale: 2, seed: 2024 }, // 7-inch tablet
  { w: 1500, h: 2400, css: [750, 1200], scale: 2, seed: 314 }, // 10-inch tablet
];
/** Seed for `--size` targets when `--seed` is not given (17 ran well at 360x740). */
const DEFAULT_SEED = 17;

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const base = (args.find((a) => !a.startsWith("--")) || "http://localhost:8000").replace(/\/$/, "");
const outRoot = opt("out", "store-screenshots");
const seedOverride = opt("seed", "");
const only = opt("only", "");
const chrome = opt("chrome", "");
const extraSizes = args.filter((a) => a.startsWith("--size=")).map((a) => parseSize(a.slice(7)));
const debriefFile = path.resolve(opt("debrief", path.join(outRoot, "debrief.json")));
const newDebrief = args.includes("--new-debrief");

/**
 * Parse `WxH[@scale]` into a target; picks the scale when omitted.
 * @param {string} spec
 * @returns {{ w:number, h:number, css:[number,number], scale:number }}
 */
function parseSize(spec) {
  const m = /^(\d+)x(\d+)(?:@(\d+))?$/.exec(spec);
  if (!m) throw new Error(`--size expects WxH[@scale], got "${spec}"`);
  const w = Number(m[1]);
  const h = Number(m[2]);
  const scale = m[3]
    ? Number(m[3])
    : [4, 3, 2, 1].find((s) => w % s === 0 && h % s === 0 && w / s >= 360) || 1;
  if (w % scale || h % scale) throw new Error(`${spec}: sides must be multiples of the scale`);
  return { w, h, css: [w / scale, h / scale], scale };
}

/** Start screen shows the remote top score, or 15s since navigation passed (empty/offline board). */
const START_READY =
  "performance.now() > 15000 || Number(document.getElementById('highScore').textContent) > 0";
/** Gameplay is live: the start overlay is gone and the game-over dialog has not appeared. */
const RUNNING =
  "document.getElementById('gameInfo').hidden && document.getElementById('gameOverScreen').hidden";
/** Game-over dialog is showing and the debrief has rendered, its headline fully typed out. */
const DEBRIEF_READY =
  "!document.getElementById('gameOverScreen').hidden && !document.getElementById('okBtn').disabled" +
  " && !!document.querySelector('#postGameMessage .debrief:not(.pending)')";
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
/**
 * The rendered debrief dialog and HUD, to show the same debrief on every size. The dialog is kept
 * as an element tree (`[tag, attributes, ...children]`, text as strings) rather than HTML: the
 * page enforces Trusted Types, so it is rebuilt with createElement / setAttribute, not innerHTML.
 */
const DEBRIEF_SNAPSHOT = `(() => {
  const text = (id) => document.getElementById(id).textContent;
  const tree = (n) => n.nodeType === Node.TEXT_NODE ? n.data : [n.localName,
    Object.fromEntries([...n.attributes].map((a) => [a.name, a.value])), ...[...n.childNodes]
      .filter((c) => c.nodeType === Node.ELEMENT_NODE || c.nodeType === Node.TEXT_NODE).map(tree)];
  const msg = document.getElementById('postGameMessage');
  return { title: text('gameOverTitle'), score: text('currentScore'), high: text('highScore'),
    timer: text('timer'), message: tree(msg) };
})()`;
/**
 * Expression that puts a saved {@link DEBRIEF_SNAPSHOT} into the page.
 * @param {{ title: string, score: string, high: string, timer: string, message: any[] }} d
 */
const applyDebrief = (d) => `(() => {
  const d = ${JSON.stringify(d)};
  const set = (id, v) => { document.getElementById(id).textContent = v; };
  set('gameOverTitle', d.title); set('currentScore', d.score); set('highScore', d.high);
  set('timer', d.timer);
  const build = (t) => {
    if (typeof t === 'string') return document.createTextNode(t);
    const [tag, attrs, ...kids] = t;
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.append(...kids.map(build));
    return el;
  };
  const msg = document.getElementById('postGameMessage');
  const [, attrs, ...kids] = d.message;
  msg.className = attrs.class || '';
  msg.replaceChildren(...kids.map(build));
  return 'applied';
})()`;

async function main() {
  const targets = TARGETS.filter((t) => !only || `${t.w}x${t.h}` === only).concat(extraSizes);
  if (!targets.length) throw new Error(`no target matches --only=${only}`);
  const missing = [];
  let saveDebrief = newDebrief || !fs.existsSync(debriefFile);
  for (const t of targets) {
    const debriefStep = saveDebrief
      ? `save ${debriefFile} ${DEBRIEF_SNAPSHOT}`
      : `waitfor ${applyDebrief(JSON.parse(fs.readFileSync(debriefFile, "utf8")))}`;
    saveDebrief = false;
    const outDir = path.join(outRoot, `${t.w}x${t.h}`);
    const seed = seedOverride || t.seed || DEFAULT_SEED;
    const common = { outDir, width: t.css[0], height: t.css[1], scale: t.scale, chrome };
    console.error(
      `\n== ${t.w}x${t.h} (css ${t.css[0]}x${t.css[1]} @${t.scale}x, seed ${seed}) -> ${outDir}`
    );

    await capture({
      ...common,
      url: `${base}/?dpr=${t.scale}`,
      actions: [`waitfor ${START_READY}`, "wait 1000", "shot 1-initial"],
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
        debriefStep,
        "wait 300",
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
