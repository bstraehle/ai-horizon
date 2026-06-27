const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const EDIT_TOOL_NAMES = new Set(["apply_patch", "create_file"]);
const PRETTIER_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".webmanifest",
  ".yml",
  ".yaml",
]);

function readStdin() {
  return new Promise((resolve, reject) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
    });
    process.stdin.on("end", () => resolve(input));
    process.stdin.on("error", reject);
  });
}

function parsePayload(rawInput) {
  if (!rawInput.trim()) {
    return {};
  }

  try {
    return JSON.parse(rawInput);
  } catch {
    return {};
  }
}

function extractPatchedFiles(patchText) {
  const matches = patchText.matchAll(/^\*\*\* (?:Add|Update) File: (.+)$/gm);
  const filePaths = [];

  for (const match of matches) {
    if (match[1]) {
      filePaths.push(match[1].trim());
    }
  }

  return filePaths;
}

function extractEditedFiles(payload) {
  const toolName = payload.tool_name;
  const toolInput = payload.tool_input || {};

  if (!EDIT_TOOL_NAMES.has(toolName)) {
    return [];
  }

  if (toolName === "create_file" && typeof toolInput.filePath === "string") {
    return [toolInput.filePath];
  }

  if (toolName === "apply_patch" && typeof toolInput.input === "string") {
    return extractPatchedFiles(toolInput.input);
  }

  return [];
}

function resolveWorkspaceFile(cwd, filePath) {
  const absolutePath = path.isAbsolute(filePath)
    ? path.normalize(filePath)
    : path.resolve(cwd, filePath);

  const relativePath = path.relative(cwd, absolutePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  return absolutePath;
}

function filterPrettierFiles(cwd, filePaths) {
  const uniqueFiles = new Set();

  for (const filePath of filePaths) {
    const absolutePath = resolveWorkspaceFile(cwd, filePath);
    if (!absolutePath) {
      continue;
    }

    if (!PRETTIER_EXTENSIONS.has(path.extname(absolutePath).toLowerCase())) {
      continue;
    }

    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      continue;
    }

    uniqueFiles.add(absolutePath);
  }

  return [...uniqueFiles];
}

function runPrettier(cwd, filePaths) {
  const prettierBin = require.resolve("prettier/bin/prettier.cjs", { paths: [cwd] });
  return spawnSync(process.execPath, [prettierBin, "--write", ...filePaths], {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });
}

async function main() {
  const rawInput = await readStdin();
  const payload = parsePayload(rawInput);
  const cwd = typeof payload.cwd === "string" && payload.cwd ? payload.cwd : process.cwd();
  const editedFiles = extractEditedFiles(payload);
  const prettierFiles = filterPrettierFiles(cwd, editedFiles);

  if (prettierFiles.length === 0) {
    return;
  }

  try {
    const result = runPrettier(cwd, prettierFiles);
    if (result.status !== 0) {
      const detail = (
        result.stderr ||
        result.stdout ||
        "Prettier exited with a non-zero status."
      ).trim();
      process.stdout.write(
        JSON.stringify({
          systemMessage: `PostToolUse Prettier hook failed: ${detail}`,
        })
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(
      JSON.stringify({
        systemMessage: `PostToolUse Prettier hook failed: ${message}`,
      })
    );
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(
    JSON.stringify({
      systemMessage: `PostToolUse Prettier hook failed: ${message}`,
    })
  );
});
