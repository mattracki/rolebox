#!/usr/bin/env node
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const configRoot = process.env.ROLEBOX_HOME ||
  (process.env.XDG_CONFIG_HOME
    ? path.join(process.env.XDG_CONFIG_HOME, "rolebox")
    : path.join(os.homedir(), ".config", "rolebox"));
const dataRoot = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
const dataFile = path.join(configRoot, "profiles.json");

function slugify(name) {
  const value = String(name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return value || `profile-${Date.now()}`;
}

function profileRoot(id) {
  return path.join(dataRoot, "rolebox", "profiles", id);
}

function hydrateProfile(profile) {
  const root = profileRoot(profile.id);
  return {
    vaultPath: "",
    projectPath: os.homedir(),
    codexHome: path.join(root, "codex"),
    claudeConfigDir: path.join(root, "claude"),
    integrations: ["Obsidian"],
    color: "#80A8FF",
    ...profile
  };
}

function ensureProfileDirs(profile) {
  for (const dir of [profile.codexHome, profile.claudeConfigDir]) {
    if (dir) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

function defaultState() {
  return {
    activeProfileId: null,
    profiles: []
  };
}

function readState() {
  try {
    const state = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    state.profiles = (state.profiles || []).map(hydrateProfile);
    for (const profile of state.profiles) ensureProfileDirs(profile);
    return state;
  } catch {
    const state = defaultState();
    for (const profile of state.profiles) ensureProfileDirs(profile);
    writeState(state);
    return state;
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true, mode: 0o700 });
  fs.writeFileSync(dataFile, JSON.stringify(state, null, 2), { mode: 0o600 });
}

function findProfile(state, query) {
  const normalized = String(query || "").toLowerCase();
  return state.profiles.find((profile) =>
    profile.id.toLowerCase() === normalized || profile.name.toLowerCase() === normalized
  );
}

function localProfileId(startDir = process.cwd()) {
  let current = path.resolve(startDir);
  while (true) {
    const marker = path.join(current, ".rolebox-profile");
    try {
      const value = fs.readFileSync(marker, "utf8").trim();
      if (value) return { id: value, marker };
    } catch {}
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function resolvedProfile(state) {
  const local = localProfileId();
  const profile = findProfile(state, local?.id || state.activeProfileId);
  return { profile, source: local ? "local" : "global", marker: local?.marker };
}

function findRealCommand(command) {
  const ownDir = path.dirname(process.argv[1]);
  const filteredPath = (process.env.PATH || "")
    .split(path.delimiter)
    .filter((entry) => path.resolve(entry) !== path.resolve(ownDir))
    .join(path.delimiter);
  const result = spawnSync("/usr/bin/which", [command], {
    env: { ...process.env, PATH: filteredPath },
    encoding: "utf8"
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function usage() {
  console.log(`Rolebox

  rolebox current                Show the resolved context
  rolebox list                   List contexts
  rolebox add <name>             Create a context
  rolebox remove <profile>       Remove a context (configuration is preserved)
  rolebox global <profile>       Set the default context
  rolebox local <profile>        Pin the current folder to a context
  rolebox local --unset          Remove the current folder override
  rolebox use <profile>          Alias for "rolebox global"
  rolebox shell-init <shell>     Print shell integration for zsh or bash
  rolebox codex [arguments...]   Run the official Codex CLI in the resolved context
  rolebox claude [arguments...]  Run the official Claude CLI in the resolved context`);
}

const [command, ...args] = process.argv.slice(2);
const state = readState();

if (!command || command === "help" || command === "--help") {
  usage();
  process.exit(0);
}

if (command === "list") {
  for (const profile of state.profiles) {
    console.log(`${profile.id === state.activeProfileId ? "●" : "○"} ${profile.id}\t${profile.name}`);
  }
  process.exit(0);
}

if (command === "add") {
  const name = args.join(" ").trim();
  if (!name) {
    console.error("Provide a profile name.");
    process.exit(1);
  }
  const baseId = slugify(name);
  let id = baseId;
  let suffix = 2;
  while (state.profiles.some((profile) => profile.id === id)) id = `${baseId}-${suffix++}`;
  const profile = hydrateProfile({ id, name });
  ensureProfileDirs(profile);
  state.profiles.push(profile);
  if (!state.activeProfileId) state.activeProfileId = profile.id;
  writeState(state);
  console.log(`Created context: ${profile.name} (${profile.id})`);
  process.exit(0);
}

if (command === "remove") {
  const profile = findProfile(state, args[0]);
  if (!profile) {
    console.error(`Unknown context: ${args[0] || "(missing)"}`);
    process.exit(1);
  }
  state.profiles = state.profiles.filter((item) => item.id !== profile.id);
  if (state.activeProfileId === profile.id) state.activeProfileId = state.profiles[0]?.id || null;
  writeState(state);
  console.log(`Removed context: ${profile.name}`);
  console.log(`Configuration preserved at ${path.dirname(profile.codexHome)}`);
  process.exit(0);
}

if (command === "status" || command === "current") {
  const { profile, source, marker } = resolvedProfile(state);
  console.log(profile ? `${profile.name} (${profile.id}) — ${source}${marker ? ` via ${marker}` : ""}` : "No active context");
  process.exit(profile ? 0 : 1);
}

if (command === "use" || command === "global") {
  const profile = findProfile(state, args[0]);
  if (!profile) {
    console.error(`Unknown context: ${args[0] || "(missing)"}`);
    process.exit(1);
  }
  ensureProfileDirs(profile);
  state.activeProfileId = profile.id;
  writeState(state);
  console.log(`Active context: ${profile.name}`);
  process.exit(0);
}

if (command === "local") {
  const marker = path.join(process.cwd(), ".rolebox-profile");
  if (args[0] === "--unset") {
    try { fs.unlinkSync(marker); } catch {}
    console.log(`Removed local context from ${process.cwd()}`);
    process.exit(0);
  }
  const profile = findProfile(state, args[0]);
  if (!profile) {
    console.error(`Unknown context: ${args[0] || "(missing)"}`);
    process.exit(1);
  }
  ensureProfileDirs(profile);
  fs.writeFileSync(marker, `${profile.id}\n`, { mode: 0o600 });
  console.log(`Local context: ${profile.name} (${process.cwd()})`);
  process.exit(0);
}

if (command === "shell-init") {
  const shell = args[0] || "zsh";
  if (!["zsh", "bash"].includes(shell)) {
    console.error("Supported shells: zsh, bash");
    process.exit(1);
  }
  const executable = process.argv[1];
  console.log(`function codex() { ${JSON.stringify(executable)} codex "$@"; }
function claude() { ${JSON.stringify(executable)} claude "$@"; }`);
  process.exit(0);
}

if (command === "codex" || command === "claude") {
  const { profile } = resolvedProfile(state);
  if (!profile) {
    console.error("No active Rolebox context.");
    process.exit(1);
  }
  ensureProfileDirs(profile);
  const executable = findRealCommand(command);
  if (!executable) {
    console.error(`The official ${command} CLI was not found outside the Rolebox wrapper directory.`);
    process.exit(1);
  }
  const env = { ...process.env };
  if (command === "codex") env.CODEX_HOME = profile.codexHome;
  if (command === "claude") env.CLAUDE_CONFIG_DIR = profile.claudeConfigDir;
  const result = spawnSync(executable, args, { env, stdio: "inherit" });
  process.exit(result.status ?? 1);
}

usage();
process.exit(1);
