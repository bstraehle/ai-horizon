#!/usr/bin/env node
/**
 * perf-bench – run an autopilot game in headless Chrome and print the PerfOverlay session summary.
 *
 * Usage:
 *   node --experimental-websocket scripts/perf-bench.cjs [url] [--seconds=100] [--chrome=path]
 *   npm run perf:bench -- http://localhost:8000
 *
 * The page URL gets `?seed=12345&debug=perf&autoplay=1` appended unless it already carries a
 * query string. The script drives Chrome through the DevTools protocol (no extra dependencies:
 * Node's built-in WebSocket, flagged on Node < 22), waits for the game-over console summary (or the
 * time budget), and prints it as JSON. Exit code 1 when no summary was captured.
 *
 * Numbers reflect headless software rendering: compare runs against each other (baseline vs
 * candidate) rather than against real-device targets.
 */
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith("--")) || "http://localhost:8000";
const seconds = Number((args.find((a) => a.startsWith("--seconds=")) || "").split("=")[1]) || 100;
const chromeArg = (args.find((a) => a.startsWith("--chrome=")) || "").split("=")[1];
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
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  throw new Error("Chrome/Edge not found; pass --chrome=<path> or set CHROME_PATH");
}

function targetUrl() {
  return url.includes("?") ? url : `${url.replace(/\/$/, "")}/?seed=12345&debug=perf&autoplay=1`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDebugger() {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === "page");
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
    throw new Error(
      "Global WebSocket unavailable: run with `node --experimental-websocket` (Node < 22)"
    );
  }
  const chrome = findChrome();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ai-horizon-bench-"));
  const proc = spawn(
    chrome,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--window-size=1600,900",
      "--autoplay-policy=no-user-gesture-required",
      targetUrl(),
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
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });

  const wsUrl = await waitForDebugger();
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  let summary = null;
  const errors = [];
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result);
      pending.delete(msg.id);
      return;
    }
    if (msg.method === "Runtime.consoleAPICalled") {
      const parts = (msg.params.args || []).map((a) =>
        a.value !== undefined ? String(a.value) : a.description || ""
      );
      const text = parts.join(" ");
      if (text.includes("[Perf] session summary")) {
        const json = parts.find((p) => p.trim().startsWith("{"));
        try {
          summary = JSON.parse(json);
        } catch {
          summary = { raw: text };
        }
      } else if (msg.params.type === "error") {
        errors.push(text);
      } else if (text.startsWith("[Performance]")) {
        console.error(`  ${text}`);
      }
    } else if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      errors.push((d.exception && d.exception.description) || d.text);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true });
    return r && r.result ? r.result.value : undefined;
  };

  await send("Runtime.enable");
  await send("Page.enable");
  console.error(`[bench] ${targetUrl()}`);
  const deadline = Date.now() + seconds * 1000;
  let lastOverlay = "";
  while (!summary && Date.now() < deadline) {
    await sleep(5000);
    const overlay = await evaluate(
      "(document.querySelector('.perf-overlay') || {}).textContent || ''"
    );
    if (overlay && overlay !== lastOverlay) {
      lastOverlay = overlay;
      console.error(`  ${overlay.split("\n")[0]}`);
    }
  }
  if (!summary) {
    console.error("[bench] no session summary captured (game did not finish?)");
    console.error(lastOverlay);
  }
  if (errors.length) {
    console.error(`[bench] ${errors.length} console/uncaught error(s):`);
    for (const e of errors.slice(0, 5)) console.error(`  ${e}`);
  }
  ws.close();
  cleanup();
  if (summary) {
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error("[bench] failed:", err && err.message ? err.message : err);
  process.exit(1);
});
