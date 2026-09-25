#!/usr/bin/env node
/**
 * screenshot – scripted headless-Chrome screenshots of the game for visual QA.
 *
 * Usage:
 *   node --experimental-websocket scripts/screenshot.cjs <url> --out=<dir> --actions="<script>"
 *   npm run shots -- "http://localhost:8000/?seed=12345&autoplay=1" --out=.shots --actions="wait 15000; shot play"
 *
 * Action script: semicolon-separated commands executed in order.
 *   wait <ms>          pause
 *   shot <name>        save <dir>/<name>.png (viewport capture)
 *   click <selector>   dispatch a click on the first matching element
 *   eval <js>          evaluate an expression in the page
 * Options: --width=1600 --height=900 --scale=1 (device scale factor) --chrome=<path>
 *
 * Shares the zero-dependency DevTools-protocol approach of perf-bench.cjs (Node's built-in
 * WebSocket; flagged on Node < 22). Rendering is software-based but visually identical.
 */
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const url = args.find((a) => !a.startsWith("--")) || "http://localhost:8000/";
const outDir = opt("out", ".shots");
const actions = opt("actions", "wait 2000; shot screen");
const width = Number(opt("width", "1600")) || 1600;
const height = Number(opt("height", "900")) || 900;
const scale = Number(opt("scale", "1")) || 1;
const chromeArg = opt("chrome", "");
const port = 9333 + Math.floor(Math.random() * 500);

const CHROME_CANDIDATES = [
  chromeArg,
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

function findChrome() {
  for (const c of CHROME_CANDIDATES) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error("Chrome/Edge not found; pass --chrome=<path> or set CHROME_PATH");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDebugger() {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const page = (await res.json()).find((t) => t.type === "page");
      if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* not ready yet */
    }
    await sleep(100);
  }
  throw new Error("DevTools endpoint did not come up");
}

async function main() {
  if (typeof WebSocket !== "function") {
    throw new Error("Global WebSocket unavailable: run with `node --experimental-websocket`");
  }
  fs.mkdirSync(outDir, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ai-horizon-shots-"));
  const proc = spawn(
    findChrome(),
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--hide-scrollbars",
      `--window-size=${width},${height}`,
      `--force-device-scale-factor=${scale}`,
      url,
    ],
    { stdio: "ignore" }
  );
  const cleanup = () => {
    try {
      proc.kill();
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };
  process.on("exit", cleanup);

  const ws = new WebSocket(await waitForDebugger());
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  let nextId = 1;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      console.error("[page error]", (d.exception && d.exception.description) || d.text);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = (expression) =>
    send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: scale,
    mobile: false,
  });

  for (const raw of actions.split(";")) {
    const cmd = raw.trim();
    if (!cmd) continue;
    const space = cmd.indexOf(" ");
    const verb = space === -1 ? cmd : cmd.slice(0, space);
    const arg = space === -1 ? "" : cmd.slice(space + 1).trim();
    if (verb === "wait") {
      await sleep(Number(arg) || 0);
    } else if (verb === "shot") {
      const res = await send("Page.captureScreenshot", { format: "png" });
      const file = path.join(outDir, `${arg || "screen"}.png`);
      fs.writeFileSync(file, Buffer.from(res.result.data, "base64"));
      console.error(`[shot] ${file}`);
    } else if (verb === "click") {
      const res = await evaluate(
        `(() => { const el = document.querySelector(${JSON.stringify(arg)}); if (!el) return "missing"; el.click(); return "clicked"; })()`
      );
      console.error(
        `[click] ${arg}: ${res.result && res.result.result && res.result.result.value}`
      );
    } else if (verb === "eval") {
      const res = await evaluate(arg);
      console.error(
        `[eval] ${JSON.stringify(res.result && res.result.result && res.result.result.value)}`
      );
    } else {
      console.error(`[skip] unknown action: ${cmd}`);
    }
  }
  ws.close();
  cleanup();
  process.exit(0);
}

main().catch((err) => {
  console.error("[screenshot] failed:", err && err.message ? err.message : err);
  process.exit(1);
});
