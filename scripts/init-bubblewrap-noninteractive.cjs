const path = require("path");
const {
  init,
} = require("C:/Users/bstra/AppData/Roaming/npm/node_modules/@bubblewrap/cli/dist/lib/cmds/init.js");
const {
  loadOrCreateConfig,
} = require("C:/Users/bstra/AppData/Roaming/npm/node_modules/@bubblewrap/cli/dist/lib/config.js");
const {
  ConsoleLog,
} = require("C:/Users/bstra/AppData/Roaming/npm/node_modules/@bubblewrap/cli/node_modules/@bubblewrap/core");

class NonInteractivePrompt {
  printMessage(message) {
    console.log(message);
  }

  async promptInput(message, defaultValue, validateFunction) {
    let value = defaultValue;
    if (/Application ID/i.test(message)) value = "dev.agentmode.aihorizon";
    if (/Name/i.test(message) && !/Launcher/i.test(message)) value = defaultValue || "AI HORIZON";
    if (/Launcher name/i.test(message)) value = defaultValue || "AI HORIZON";
    if (/URL path/i.test(message)) value = defaultValue || "/";
    if (/Domain/i.test(message)) value = defaultValue || "www.agentmode.dev";
    if (/Signing key path/i.test(message) || /Key store location/i.test(message))
      value = defaultValue || path.resolve(process.cwd(), "android-keystore");
    if (/Key alias/i.test(message)) value = defaultValue || "android";
    if (/First and Last/i.test(message)) value = "AI Horizon Builder";
    if (/Organizational Unit/i.test(message)) value = "Engineering";
    if (/Organization/i.test(message)) value = "AI Horizon";
    if (/Country/i.test(message)) value = "US";
    console.log(`AUTO ${message}: ${value ?? ""}`);
    return (await validateFunction(String(value ?? ""))).unwrap();
  }

  async promptChoice(message, choices, defaultValue, validateFunction) {
    const value = defaultValue || choices[0];
    console.log(`AUTO ${message}: ${value}`);
    return (await validateFunction(String(value))).unwrap();
  }

  async promptConfirm(message, defaultValue) {
    const value = Boolean(defaultValue);
    console.log(`AUTO ${message}: ${value ? "yes" : "no"}`);
    return value;
  }

  async promptPassword(message) {
    console.log(`AUTO ${message}: [local build password]`);
    return "aihorizon-local-build-only";
  }

  async downloadFile(url, filename) {
    const {
      fetchUtils,
    } = require("C:/Users/bstra/AppData/Roaming/npm/node_modules/@bubblewrap/cli/node_modules/@bubblewrap/core");
    console.log(`Downloading ${url} -> ${filename}`);
    return fetchUtils.downloadFile(url, filename);
  }
}

(async () => {
  const target = process.argv[2] || "c:/temp/ai-horizon-android-build";
  process.chdir(target);
  const prompt = new NonInteractivePrompt();
  const config = await loadOrCreateConfig(new ConsoleLog("config"), prompt);
  const ok = await init(
    { manifest: "https://www.agentmode.dev/manifest.webmanifest" },
    config,
    prompt
  );
  process.exit(ok ? 0 : 1);
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
