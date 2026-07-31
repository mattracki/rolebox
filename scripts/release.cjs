#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const bump = process.argv[2] || "patch";
const allowedBumps = new Set(["patch", "minor", "major", "prepatch", "preminor", "premajor", "prerelease"]);
const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function fail(message) {
  console.error(`Release stopped: ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit"
  });
  if (result.error) fail(result.error.message);
  if (result.status !== 0) {
    if (options.capture && result.stderr) process.stderr.write(result.stderr);
    fail(`${command} ${args.join(" ")} failed`);
  }
  return options.capture ? result.stdout.trim() : "";
}

if (bump === "--help" || bump === "-h") {
  console.log(`Usage: npm run release -- [patch|minor|major|<version>]

Creates a version commit and tag, then pushes both to trigger the GitHub release workflow.
The default bump is patch.`);
  process.exit(0);
}

if (!allowedBumps.has(bump) && !exactVersion.test(bump)) {
  fail(`invalid version bump "${bump}"`);
}

if (run("git", ["branch", "--show-current"], { capture: true }) !== "main") {
  fail("switch to the main branch first");
}

if (run("git", ["status", "--porcelain"], { capture: true })) {
  fail("commit or stash all changes first");
}

const upstream = spawnSync("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], {
  cwd: root,
  encoding: "utf8",
  stdio: "pipe"
});
if (upstream.status === 0) {
  const counts = run("git", ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"], { capture: true })
    .split(/\s+/)
    .map(Number);
  if (counts[1] > 0) fail("main is behind its upstream; pull before releasing");
}

run("npm", ["run", "check"]);
run("npm", ["test"]);
run("npm", ["version", bump, "-m", "Release v%s"]);

const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const tag = `v${version}`;
const pushed = spawnSync("git", ["push", "--atomic", "origin", "main", tag], {
  cwd: root,
  encoding: "utf8",
  stdio: "inherit"
});

if (pushed.status !== 0) {
  console.error(`Release commit and ${tag} exist locally, but the push failed.`);
  console.error(`Fix the push issue, then run: git push --atomic origin main ${tag}`);
  process.exit(pushed.status || 1);
}

console.log(`Released ${tag}. GitHub Actions will build and publish the artifacts.`);
