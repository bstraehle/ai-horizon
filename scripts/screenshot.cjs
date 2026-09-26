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
 *   shotif <name> <js> like shot, but only when the expression is truthy (overwrites earlier takes)
 *   click <selector>   dispatch a click on the first matching element
 *   eval <js>          evaluate an expression in the page
 *   waitfor <js>       poll (every 250ms) until the expression is truthy or --timeout elapses
 * Options: --width=1600 --height=900 --scale=1 (device scale factor) --timeout=120000 --chrome=<path>
 *
 * Programmatic use (see store-screenshots.cjs): `require("./screenshot.cjs").capture(options)` with
 * `actions` as an array of single commands, which lets `eval`/`waitfor` expressions contain
 * semicolons. `connect(options)` exposes the underlying DevTools session (send / evaluate / event
 * subscription) for tools that need more than screenshots, e.g. record-autoplay.cjs's screencast.
 *
 * Shares the zero-dependency DevTools-protocol approach of perf-bench.cjs (Node's built-in
 * WebSocket; flagged on Node < 22). Rendering is software-based but visually identical.
 */
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

function findChrome(explicit) {
  for (const c of [explicit, ...CHROME_CANDIDATES].filter(Boolean)) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error("Chrome/Edge not found; pass --chrome=<path> or set CHROME_PATH");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDebugger(port) {
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

/**
 * Launch headless Chrome at `url` with the viewport emulated, and open a DevTools-protocol session.
 * @param {{ url: string, width?: number, height?: number, scale?: number, chrome?: string }} options
 * @returns {Promise<{ send: (method: string, params?: object) => Promise<any>,
 *   evaluate: (expression: string) => Promise<any>,
 *   on: (method: string, handler: (params: any) => void) => void, close: () => void }>}
 *  `send` resolves with the raw protocol response (`result` / `error`); `evaluate` returns the
 *  expression value (promises awaited); `on` subscribes to protocol events such as
 *  `Page.screencastFrame`; `close` ends the session and kills Chrome.
 */
async function connect(options) {
  if (typeof WebSocket !== "function") {
    throw new Error("Global WebSocket unavailable: run with `node --experimental-websocket`");
  }
  const width = options.width || 1600;
  const height = options.height || 900;
  const scale = options.scale || 1;
  const port = 9333 + Math.floor(Math.random() * 500);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ai-horizon-shots-"));
  const proc = spawn(
    findChrome(options.chrome),
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
      options.url,
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

  let ws;
  try {
    ws = new WebSocket(await waitForDebugger(port));
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", reject, { once: true });
    });
  } catch (err) {
    cleanup();
    throw err;
  }
  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      console.error("[page error]", (d.exception && d.exception.description) || d.text);
    } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
      const text = (msg.params.args || [])
        .map((a) => (a.value !== undefined ? String(a.value) : a.description || ""))
        .join(" ");
      console.error("[page console.error]", text.slice(0, 400));
    }
    if (msg.method && listeners.has(msg.method)) {
      for (const handler of listeners.get(msg.method)) handler(msg.params);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const res = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result && res.result.result ? res.result.result.value : undefined;
  };
  const on = (method, handler) => {
    if (!listeners.has(method)) listeners.set(method, []);
    listeners.get(method).push(handler);
  };

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: scale,
    mobile: false,
  });
  return {
    send,
    evaluate,
    on,
    close() {
      ws.close();
      cleanup();
    },
  };
}

/**
 * Launch headless Chrome at `url`, run the action list, write PNGs into `outDir`.
 * @param {{ url: string, outDir: string, actions: string[], width?: number, height?: number,
 *   scale?: number, timeoutMs?: number, chrome?: string }} options
 * @returns {Promise<string[]>} Paths of the screenshots written.
 */
async function capture(options) {
  const { outDir, actions } = options;
  const timeoutMs = options.timeoutMs || 120000;
  const written = [];
  fs.mkdirSync(outDir, { recursive: true });
  const { send, evaluate, close } = await connect(options);
  try {
    for (const raw of actions) {
      const cmd = raw.trim();
      if (!cmd) continue;
      const space = cmd.indexOf(" ");
      const verb = space === -1 ? cmd : cmd.slice(0, space);
      const arg = space === -1 ? "" : cmd.slice(space + 1).trim();
      if (verb === "wait") {
        await sleep(Number(arg) || 0);
      } else if (verb === "shot" || verb === "shotif") {
        let name = arg || "screen";
        if (verb === "shotif") {
          const split = arg.indexOf(" ");
          name = split === -1 ? arg : arg.slice(0, split);
          const condition = split === -1 ? "true" : arg.slice(split + 1).trim();
          if (!(await evaluate(condition))) {
            console.error(`[shotif] ${name}: condition false, skipped`);
            continue;
          }
        }
        const res = await send("Page.captureScreenshot", { format: "png" });
        const file = path.join(outDir, `${name}.png`);
        fs.writeFileSync(file, Buffer.from(res.result.data, "base64"));
        if (!written.includes(file)) written.push(file);
        console.error(`[${verb}] ${file}`);
      } else if (verb === "click") {
        const value = await evaluate(
          `(() => { const el = document.querySelector(${JSON.stringify(arg)}); if (!el) return "missing"; el.click(); return "clicked"; })()`
        );
        console.error(`[click] ${arg}: ${value}`);
      } else if (verb === "eval") {
        console.error(`[eval] ${JSON.stringify(await evaluate(arg))}`);
      } else if (verb === "waitfor") {
        const deadline = Date.now() + timeoutMs;
        let ok = false;
        while (!ok && Date.now() < deadline) {
          ok = !!(await evaluate(arg));
          if (!ok) await sleep(250);
        }
        console.error(`[waitfor] ${ok ? "ok" : "TIMED OUT"}: ${arg.slice(0, 80)}`);
        if (!ok) throw new Error(`waitfor timed out after ${timeoutMs}ms: ${arg}`);
      } else {
        console.error(`[skip] unknown action: ${cmd}`);
      }
    }
  } finally {
    close();
  }
  return written;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name, fallback) => {
    const hit = args.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
  };
  await capture({
    url: args.find((a) => !a.startsWith("--")) || "http://localhost:8000/",
    outDir: opt("out", ".shots"),
    actions: opt("actions", "wait 2000; shot screen").split(";"),
    width: Number(opt("width", "1600")) || 1600,
    height: Number(opt("height", "900")) || 900,
    scale: Number(opt("scale", "1")) || 1,
    timeoutMs: Number(opt("timeout", "120000")) || 120000,
    chrome: opt("chrome", ""),
  });
  process.exit(0);
}

module.exports = { capture, connect, findChrome, sleep };

if (require.main === module) {
  main().catch((err) => {
    console.error("[screenshot] failed:", err && err.message ? err.message : err);
    process.exit(1);
  });
}
