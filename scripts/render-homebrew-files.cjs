#!/usr/bin/env node
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function render(source, destination, values) {
  let content = fs.readFileSync(source, "utf8");
  for (const [key, value] of Object.entries(values)) {
    content = content.replaceAll(`__${key}__`, value);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, content);
}

const [owner, version, sourceArchive, arm64Archive, x64Archive] = process.argv.slice(2);
if (!owner || !version || !sourceArchive || !arm64Archive || !x64Archive) {
  console.error("Usage: render-homebrew-files <github-owner> <version> <source-archive> <arm64-app-archive> <x64-app-archive>");
  process.exit(1);
}

const root = path.resolve(__dirname, "..");
render(
  path.join(root, "homebrew", "Formula", "rolebox.rb.template"),
  path.join(root, "homebrew", "dist", "Formula", "rolebox.rb"),
  {
    GITHUB_OWNER: owner,
    VERSION: version,
    SOURCE_SHA256: sha256(sourceArchive)
  }
);
render(
  path.join(root, "homebrew", "Casks", "rolebox-app.rb.template"),
  path.join(root, "homebrew", "dist", "Casks", "rolebox-app.rb"),
  {
    GITHUB_OWNER: owner,
    VERSION: version,
    APP_ARM64_SHA256: sha256(arm64Archive),
    APP_X64_SHA256: sha256(x64Archive)
  }
);
console.log("Rendered Homebrew files in homebrew/dist");
