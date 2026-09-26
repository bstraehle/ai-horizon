#!/usr/bin/env node
/**
 * icon-concepts – generate the AI HORIZON app-icon concepts as 512x512 SVG + PNG.
 *
 * Usage:
 *   node --experimental-websocket scripts/icon-concepts.cjs [--out=store-icons] [--no-render]
 *   npm run icons
 *
 * Five marks drawn in the game's flat-geometric language (palette from js/constants.js, shapes
 * mirrored from the Player / Star / Asteroid painters: white hull with one hard shadow facet, dark
 * outlines, pentagram stars, two-tone rocks lit from the upper left, one red or blue accent):
 *   01-fighter   the ship, large and centred, red engine flame and trail
 *   02-horizon   a planet limb across the bottom with a blue atmosphere glow, the ship climbing
 *   03-star-run  a big collectible star, the ship banking toward it with bolts in flight
 *   04-monogram  "AI": the arrowhead hull as the A, a bullet bolt as the I
 *   05-impact    a red bonus planet cracking under fire, explosion ring and shards
 *
 * Output: <out>/<name>.svg (editable source), <out>/<name>.png (512x512, Play Store icon size) and
 * <out>/preview.png (each mark at launcher sizes on light/dark tiles, with the adaptive-icon safe
 * zone). Rendering uses headless Chrome via scripts/screenshot.cjs; `--no-render` writes SVG only.
 * Key content stays inside the central 66% circle so the same art works as an adaptive-icon
 * foreground.
 */
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const outDir = path.resolve(opt("out", "store-icons"));
const render = !args.includes("--no-render");

const SIZE = 512;
const C = {
  bgTop: "#04050a",
  bgMid: "#090a12",
  bgBot: "#0c0d16",
  hull: "#f6f7fa",
  hullShade: "#c6ccd6",
  cockpit: "#15171d",
  outline: "#0a0b0f",
  red: "#ff5c5c",
  blue: "#4fb4ff",
  starFill: "#ffffff",
  starFacet: "#d9dee8",
  rock: { face: "#b9bfc9", facet: "#7e8590", crater: "#6a707a", ring: "#9aa1ab" },
  redRock: {
    face: "#ff5c5c",
    facet: "#b83a3a",
    crater: "#8f2d2d",
    ring: "#ff8a8a",
    shield: "#ffd6d6",
  },
  bullet: ["#d9dee8", "#ffffff", "#f2f5fa"],
  dots: ["#ffffff", "#dde6f4", "#f3efe6"],
};
/** Key light direction (unit vector from the upper left), as in Asteroid.js. */
const LIGHT = { x: -0.62, y: -0.78 };
const SHADOW_ANGLE = (Math.atan2(-LIGHT.y, -LIGHT.x) * 180) / Math.PI;
const f = (n) => String(Number(n.toFixed(2)));
const pt = (x, y) => `${f(x)},${f(y)}`;

/** Collects defs and body fragments for one SVG document. */
class Doc {
  constructor() {
    this.defs = [];
    this.body = [];
    this.n = 0;
  }
  id(prefix) {
    return `${prefix}${++this.n}`;
  }
  toString() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.bgTop}"/><stop offset="0.5" stop-color="${C.bgMid}"/><stop offset="1" stop-color="${C.bgBot}"/></linearGradient>
${this.defs.join("\n")}
</defs>
<rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
${this.body.join("\n")}
</svg>
`;
  }
}

/** Soft accent nebula blob (the only gradient the game uses in its background). */
function nebula(doc, cx, cy, r, color, alpha = 0.16) {
  const id = doc.id("neb");
  doc.defs.push(
    `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity="${alpha}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`
  );
  doc.body.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id})"/>`);
}

/** Sparse starfield: [x, y, r, opacity, paletteIndex]. */
function dots(doc, list) {
  doc.body.push(
    list
      .map(
        ([x, y, r, o, c = 0]) =>
          `<circle cx="${x}" cy="${y}" r="${r}" fill="${C.dots[c]}" opacity="${o}"/>`
      )
      .join("")
  );
}

/**
 * The player ship (Player._drawShip geometry): nose up, centred on (cx, cy); `u` is the design
 * unit (in-game: hitbox size * 1.1).
 */
function ship(doc, { cx, cy, u, accent, rot = 0, trail = 0 }) {
  const h = u / 1.1;
  const oy = -h / 2;
  const top = oy - 0.1 * u;
  const bottom = oy + h + 0.06 * u;
  const tailY = bottom - 0.2 * u;
  const hull = `M${pt(0, top)} L${pt(0.72 * u, bottom - 0.12 * u)} L${pt(0.26 * u, bottom - 0.28 * u)} L${pt(0, tailY)} L${pt(-0.26 * u, bottom - 0.28 * u)} L${pt(-0.72 * u, bottom - 0.12 * u)} Z`;
  const flame = `M${pt(-0.17 * u, tailY)} L${pt(0.17 * u, tailY)} L${pt(0, bottom + 0.26 * u)} Z`;
  const core = `M${pt(-0.07 * u, tailY)} L${pt(0.07 * u, tailY)} L${pt(0, bottom + 0.04 * u)} Z`;
  const canopy = `M${pt(0, oy + 0.22 * h)} L${pt(0.1 * u, oy + 0.52 * h)} L${pt(-0.1 * u, oy + 0.52 * h)} Z`;
  const clip = doc.id("hull");
  doc.defs.push(`<clipPath id="${clip}"><path d="${hull}"/></clipPath>`);
  let trailEl = "";
  for (let i = 0; i < trail; i++) {
    const y = bottom + 0.26 * u + (i + 1) * 0.13 * u;
    const r = 0.05 * u * (1 - i / (trail + 1));
    trailEl += `<circle cx="0" cy="${f(y)}" r="${f(r)}" fill="#ffffff" opacity="${f(0.55 * (1 - i / trail))}"/>`;
  }
  doc.body.push(`<g transform="translate(${cx} ${cy}) rotate(${rot})">
${trailEl}<path d="${flame}" fill="${accent}"/><path d="${core}" fill="#ffffff" opacity="0.9"/>
<path d="${hull}" fill="${C.hull}"/>
<rect clip-path="url(#${clip})" x="${f(0.02 * u)}" y="${f(top - u)}" width="${f(2 * u)}" height="${f(3 * u)}" fill="${C.hullShade}"/>
<path d="${hull}" fill="none" stroke="${C.outline}" stroke-width="${f(Math.max(1.2, u * 0.04))}" stroke-linejoin="round"/>
<path d="${canopy}" fill="${C.cockpit}"/>
</g>`);
}

/**
 * Five-point star with the game's 0.4 inner radius (Star.drawStar). Vertices are walked in
 * silhouette order rather than the painter's pentagram order: at icon scale the self-intersecting
 * path shows its inner lines and reads as a pentagram, and it breaks the clipped shadow facet.
 */
function starPath(cx, cy, r) {
  let d = "";
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.4;
    d += `${i === 0 ? "M" : "L"}${pt(cx + rr * Math.cos(a), cy + rr * Math.sin(a))} `;
  }
  return `${d}Z`;
}

/** Collectible star: flat fill, hard shadow facet away from the light, thin outline. */
function star(doc, { cx, cy, r, fill = C.starFill, facet = C.starFacet, rot = 0 }) {
  const d = starPath(0, 0, r);
  const clip = doc.id("star");
  doc.defs.push(`<clipPath id="${clip}"><path d="${d}"/></clipPath>`);
  doc.body.push(`<g transform="translate(${cx} ${cy}) rotate(${rot})">
<path d="${d}" fill="${fill}"/>
<rect clip-path="url(#${clip})" transform="rotate(${f(SHADOW_ANGLE - rot)})" x="${f(0.12 * r)}" y="${f(-2 * r)}" width="${f(4 * r)}" height="${f(4 * r)}" fill="${facet}"/>
<path d="${d}" fill="none" stroke="${C.outline}" stroke-width="${f(Math.max(1.2, r * 0.045))}" stroke-linejoin="round"/>
</g>`);
}

/** Asteroid._paintRock: irregular 12-vertex silhouette, lit face, hard shadow plane, outline. */
function rock(doc, { cx, cy, r, factors, palette = C.rock, rot = 0 }) {
  let d = "";
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const rr = r * factors[i % factors.length];
    d += `${i === 0 ? "M" : "L"}${pt(rr * Math.cos(a), rr * Math.sin(a))} `;
  }
  d += "Z";
  const clip = doc.id("rock");
  doc.defs.push(`<clipPath id="${clip}"><path d="${d}"/></clipPath>`);
  doc.body.push(`<g transform="translate(${cx} ${cy}) rotate(${rot})">
<path d="${d}" fill="${palette.face}"/>
<rect clip-path="url(#${clip})" transform="rotate(${f(SHADOW_ANGLE - rot)})" x="${f(0.12 * r)}" y="${f(-2 * r)}" width="${f(4 * r)}" height="${f(4 * r)}" fill="${palette.facet}"/>
<path d="${d}" fill="none" stroke="${C.outline}" stroke-width="${f(Math.max(1.25, r * 0.06))}" stroke-linejoin="round"/>
</g>`);
}

/**
 * Asteroid._paintPlanet: disc with a crescent shadow on the far side, flat craters, outline;
 * optional bonus halo ring and damage cracks. `cracks` are polylines in planet units (fractions of
 * r from the centre), drawn in the palette's shield colour like Asteroid._drawDamage.
 */
function planet(doc, { cx, cy, r, palette = C.rock, craters = [], ring = false, cracks = [] }) {
  const clip = doc.id("planet");
  doc.defs.push(`<clipPath id="${clip}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>`);
  const craterEls = craters
    .map(
      ([dx, dy, cr]) =>
        `<circle cx="${f(cx + dx * r)}" cy="${f(cy + dy * r)}" r="${f(cr * r)}" fill="${palette.crater}" opacity="0.8"/>`
    )
    .join("");
  const crackEls = cracks
    .map(
      (line) =>
        `<polyline clip-path="url(#${clip})" points="${line.map(([dx, dy]) => pt(cx + dx * r, cy + dy * r)).join(" ")}" fill="none" stroke="${palette.shield || "#ffffff"}" stroke-width="${f(r * 0.035)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.95"/>`
    )
    .join("");
  doc.body.push(`<g clip-path="url(#${clip})">
<rect x="${cx - r}" y="${cy - r}" width="${2 * r}" height="${2 * r}" fill="${palette.facet}"/>
<circle cx="${f(cx + LIGHT.x * r * 0.16)}" cy="${f(cy + LIGHT.y * r * 0.16)}" r="${f(r * 0.9)}" fill="${palette.face}"/>
${craterEls}
</g>
<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${C.outline}" stroke-width="${f(Math.max(1.5, r * 0.045))}"/>
${crackEls}${ring ? `<circle cx="${cx}" cy="${cy}" r="${f(r * 1.17)}" fill="none" stroke="${palette.ring}" stroke-width="${f(Math.max(2, r * 0.025))}" opacity="0.75"/>` : ""}`);
}

/** Bullet bolt: white capsule with the game's soft vertical gradient. */
function bolt(doc, { cx, cy, w, h, rot = 0, colors = C.bullet }) {
  const id = doc.id("bolt");
  doc.defs.push(
    `<linearGradient id="${id}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${colors[0]}"/><stop offset="0.5" stop-color="${colors[1]}"/><stop offset="1" stop-color="${colors[2]}"/></linearGradient>`
  );
  doc.body.push(
    `<rect transform="translate(${cx} ${cy}) rotate(${rot})" x="${f(-w / 2)}" y="${f(-h / 2)}" width="${w}" height="${h}" rx="${f(w / 2)}" fill="url(#${id})"/>`
  );
}

/** Explosion: white ring plus radiating flat shards (the game's spark particles, frozen). */
function explosion(doc, { cx, cy, r, shards = 7, seed = 0 }) {
  let els = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#ffffff" stroke-width="${f(r * 0.1)}" opacity="0.9"/>`;
  for (let i = 0; i < shards; i++) {
    const a = seed + (i / shards) * Math.PI * 2;
    const d1 = r * 1.25;
    const d2 = r * (1.7 + 0.35 * ((i * 7) % 3));
    const w = r * 0.14;
    const x1 = cx + Math.cos(a) * d1;
    const y1 = cy + Math.sin(a) * d1;
    const x2 = cx + Math.cos(a) * d2;
    const y2 = cy + Math.sin(a) * d2;
    const nx = -Math.sin(a) * w;
    const ny = Math.cos(a) * w;
    els += `<path d="M${pt(x1 + nx, y1 + ny)} L${pt(x2, y2)} L${pt(x1 - nx, y1 - ny)} Z" fill="#ffffff" opacity="${f(0.55 + 0.4 * (i % 2 ? 1 : 0.4))}"/>`;
  }
  doc.body.push(els);
}

const FIELD = [
  [48, 62, 2.2, 0.85],
  [130, 38, 1.6, 0.6, 1],
  [430, 54, 2.6, 0.9],
  [470, 150, 1.5, 0.55, 2],
  [36, 220, 1.8, 0.7, 1],
  [488, 300, 2, 0.6],
  [80, 420, 1.6, 0.55, 2],
  [420, 452, 2.4, 0.8, 1],
  [330, 486, 1.4, 0.5],
  [200, 470, 1.8, 0.6],
  [250, 30, 1.4, 0.5, 1],
  [380, 120, 1.2, 0.45],
];

const CONCEPTS = {
  "01-fighter": () => {
    const d = new Doc();
    nebula(d, 340, 330, 250, C.red, 0.18);
    nebula(d, 150, 130, 170, C.red, 0.08);
    dots(d, FIELD);
    ship(d, { cx: 256, cy: 228, u: 232, accent: C.red, trail: 4 });
    return d;
  },
  "02-horizon": () => {
    const d = new Doc();
    dots(
      d,
      FIELD.filter(([, y]) => y < 300)
    );
    // Atmosphere: blue glow hugging the planet limb.
    const glow = d.id("glow");
    d.defs.push(
      `<radialGradient id="${glow}" cx="256" cy="640" r="420" gradientUnits="userSpaceOnUse"><stop offset="0.78" stop-color="${C.blue}" stop-opacity="0"/><stop offset="0.86" stop-color="${C.blue}" stop-opacity="0.35"/><stop offset="1" stop-color="${C.blue}" stop-opacity="0"/></radialGradient>`
    );
    d.body.push(`<circle cx="256" cy="640" r="420" fill="url(#${glow})"/>`);
    planet(d, {
      cx: 256,
      cy: 640,
      r: 330,
      craters: [
        [-0.42, -0.86, 0.075],
        [0.1, -0.93, 0.05],
        [0.44, -0.8, 0.09],
        [-0.12, -0.76, 0.04],
      ],
    });
    bolt(d, { cx: 256, cy: 78, w: 12, h: 46 });
    ship(d, { cx: 256, cy: 205, u: 150, accent: C.blue, trail: 3 });
    return d;
  },
  "03-star-run": () => {
    const d = new Doc();
    nebula(d, 330, 190, 240, C.red, 0.16);
    dots(d, FIELD);
    star(d, { cx: 118, cy: 112, r: 40, fill: C.red, facet: "#d94848", rot: -12 });
    star(d, { cx: 318, cy: 196, r: 152 });
    bolt(d, { cx: 214, cy: 300, w: 12, h: 44, rot: 28 });
    ship(d, { cx: 160, cy: 392, u: 128, accent: C.red, rot: 28 });
    return d;
  },
  "04-monogram": () => {
    const d = new Doc();
    nebula(d, 256, 300, 300, C.red, 0.12);
    dots(d, FIELD);
    ship(d, { cx: 216, cy: 256, u: 168, accent: C.red });
    bolt(d, { cx: 392, cy: 250, w: 46, h: 236 });
    d.body.push(
      `<rect x="${392 - 23}" y="${250 - 118}" width="46" height="236" rx="23" fill="none" stroke="${C.outline}" stroke-width="6.7"/>`
    );
    return d;
  },
  "05-impact": () => {
    const d = new Doc();
    nebula(d, 300, 200, 250, C.red, 0.2);
    dots(d, FIELD);
    // Impact point on the planet's lower-left rim; cracks radiate inward from it.
    planet(d, {
      cx: 312,
      cy: 196,
      r: 128,
      palette: C.redRock,
      ring: true,
      craters: [
        [0.4, -0.3, 0.13],
        [-0.05, 0.3, 0.08],
        [0.5, 0.42, 0.07],
        [-0.45, -0.45, 0.06],
      ],
      cracks: [
        [
          [-0.72, 0.7],
          [-0.42, 0.42],
          [-0.3, 0.1],
          [-0.02, -0.06],
        ],
        [
          [-0.7, 0.72],
          [-0.35, 0.68],
          [0.02, 0.5],
        ],
        [
          [-0.74, 0.66],
          [-0.62, 0.3],
          [-0.7, -0.05],
        ],
      ],
    });
    rock(d, {
      cx: 84,
      cy: 112,
      r: 34,
      factors: [1, 0.86, 0.94, 0.8, 1, 0.9, 0.84, 1, 0.88, 0.96, 0.82, 0.92],
      rot: 20,
    });
    explosion(d, { cx: 220, cy: 284, r: 38, shards: 7, seed: 0.4 });
    bolt(d, { cx: 220, cy: 356, w: 12, h: 44 });
    ship(d, { cx: 220, cy: 420, u: 100, accent: C.red });
    return d;
  },
};

function previewHtml(names) {
  const tile = (name, bg) =>
    `<div class="tile" style="background:${bg}">
  <img class="rounded" src="${name}.png" width="192" height="192" alt="">
  <div class="col"><img class="circle" src="${name}.png" width="96" height="96" alt=""><img class="rounded" src="${name}.png" width="48" height="48" alt=""></div>
  <div class="safe"><img src="${name}.png" width="192" height="192" alt=""><div class="zone"></div></div>
</div>`;
  return `<!doctype html><meta charset="utf-8"><title>AI HORIZON icon concepts</title>
<style>
body{margin:0;padding:24px;background:#1b1d22;color:#eee;font:14px/1.4 system-ui,sans-serif}
h1{font-size:18px;margin:0 0 16px}
.row{display:flex;align-items:center;gap:20px;margin-bottom:18px}
.label{width:118px;font-weight:600}
.tile{display:flex;align-items:center;gap:20px;padding:14px 18px;border-radius:12px}
.col{display:flex;flex-direction:column;gap:12px;align-items:center}
img{display:block}
.rounded{border-radius:20%}
.circle{border-radius:50%}
.safe{position:relative;width:192px;height:192px}
.zone{position:absolute;left:17%;top:17%;width:66%;height:66%;border:2px dashed rgba(255,92,92,.85);border-radius:50%;box-sizing:border-box}
.note{color:#aaa;margin-top:8px}
</style>
<h1>AI HORIZON icon concepts (512x512, Play Store icon size)</h1>
${names.map((n) => `<div class="row"><div class="label">${n}</div>${tile(n, "#f1f3f5")}${tile(n, "#0f1014")}</div>`).join("\n")}
<p class="note">Left tile: light launcher; right: dark launcher. Sizes 192 / 96 (circle mask) / 48. Dashed circle = adaptive-icon safe zone (66%).</p>
`;
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const names = Object.keys(CONCEPTS);
  for (const name of names) {
    fs.writeFileSync(path.join(outDir, `${name}.svg`), CONCEPTS[name]().toString());
    console.error(`[svg] ${name}.svg`);
  }
  fs.writeFileSync(path.join(outDir, "preview.html"), previewHtml(names));
  if (!render) return;
  const { capture } = require("./screenshot.cjs");
  for (const name of names) {
    await capture({
      url: pathToFileURL(path.join(outDir, `${name}.svg`)).href,
      outDir,
      width: SIZE,
      height: SIZE,
      scale: 1,
      actions: ["wait 400", `shot ${name}`],
    });
  }
  await capture({
    url: pathToFileURL(path.join(outDir, "preview.html")).href,
    outDir,
    width: 1420,
    height: 1330,
    scale: 1,
    actions: ["wait 800", "shot preview"],
  });
}

main().catch((err) => {
  console.error("[icon-concepts] failed:", err && err.message ? err.message : err);
  process.exit(1);
});
