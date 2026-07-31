const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

function dataFile() {
  const configuredRoot = process.env.ROLEBOX_HOME;
  const configRoot = configuredRoot ||
    (process.env.XDG_CONFIG_HOME
      ? path.join(process.env.XDG_CONFIG_HOME, "rolebox")
      : path.join(app.getPath("home"), ".config", "rolebox"));
  return path.join(configRoot, "profiles.json");
}

function profileRoot(id) {
  const dataRoot = process.env.XDG_DATA_HOME ||
    path.join(app.getPath("home"), ".local", "share");
  return path.join(dataRoot, "rolebox", "profiles", id);
}

function hydrateProfile(profile) {
  const root = profileRoot(profile.id);
  return {
    vaultPath: "",
    projectPath: app.getPath("home"),
    codexHome: path.join(root, "codex"),
    claudeConfigDir: path.join(root, "claude"),
    integrations: ["Obsidian"],
    ...profile
  };
}

function initialState() {
  return {
    activeProfileId: null,
    profiles: []
  };
}

function readState() {
  try {
    const state = JSON.parse(fs.readFileSync(dataFile(), "utf8"));
    state.profiles = (state.profiles || []).map(hydrateProfile);
    for (const profile of state.profiles) ensureProfileDirs(profile);
    return state;
  } catch {
    const legacyFile = path.join(app.getPath("userData"), "profiles.json");
    try {
      const legacyState = JSON.parse(fs.readFileSync(legacyFile, "utf8"));
      legacyState.profiles = (legacyState.profiles || []).map(hydrateProfile);
      for (const profile of legacyState.profiles) ensureProfileDirs(profile);
      writeState(legacyState);
      return legacyState;
    } catch {}
    const state = initialState();
    writeState(state);
    return state;
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(dataFile()), { recursive: true, mode: 0o700 });
  fs.writeFileSync(dataFile(), JSON.stringify(state, null, 2), { mode: 0o600 });
}

function slugify(name) {
  const value = String(name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return value || `profile-${Date.now()}`;
}

function createProfile(name, color) {
  const state = readState();
  const baseId = slugify(name);
  let id = baseId;
  let suffix = 2;
  while (state.profiles.some((profile) => profile.id === id)) id = `${baseId}-${suffix++}`;
  const profile = hydrateProfile({ id, name: String(name).trim(), color: color || "#80A8FF" });
  ensureProfileDirs(profile);
  state.profiles.push(profile);
  if (!state.activeProfileId) state.activeProfileId = profile.id;
  writeState(state);
  return { state, profile };
}

function ensureProfileDirs(profile) {
  for (const dir of [profile.codexHome, profile.claudeConfigDir]) {
    if (dir) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function terminalCommand(profile, agent) {
  const cwd = profile.projectPath || app.getPath("home");
  if (agent === "codex") {
    return `cd ${shellQuote(cwd)} && CODEX_HOME=${shellQuote(profile.codexHome)} codex`;
  }
  return `cd ${shellQuote(cwd)} && CLAUDE_CONFIG_DIR=${shellQuote(profile.claudeConfigDir)} claude`;
}

function launchInTerminal(profile, agent) {
  ensureProfileDirs(profile);
  const command = terminalCommand(profile, agent);
  const script = [
    "on run argv",
    'tell application "Terminal"',
    "activate",
    "do script (item 1 of argv)",
    "end tell",
    "end run"
  ].join("\n");
  const child = spawn("/usr/bin/osascript", ["-e", script, command], {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
}

function installTerminalIntegration() {
  if (path.basename(process.env.SHELL || "") !== "zsh") {
    throw new Error("Terminal integration currently supports zsh only");
  }
  const installDir = path.join(app.getPath("home"), ".rolebox", "bin");
  fs.mkdirSync(installDir, { recursive: true, mode: 0o700 });
  const cliDir = path.join(__dirname, "..", "cli");
  fs.copyFileSync(path.join(cliDir, "rolebox.cjs"), path.join(installDir, "rolebox"));
  fs.copyFileSync(path.join(cliDir, "codex"), path.join(installDir, "codex"));
  fs.copyFileSync(path.join(cliDir, "claude"), path.join(installDir, "claude"));
  for (const name of ["rolebox", "codex", "claude"]) fs.chmodSync(path.join(installDir, name), 0o700);

  const shellFile = path.join(app.getPath("home"), ".zshrc");
  const marker = "# Rolebox terminal integration";
  const pathLine = 'export PATH="$HOME/.rolebox/bin:$PATH"';
  let shellContent = "";
  try { shellContent = fs.readFileSync(shellFile, "utf8"); } catch {}
  if (!shellContent.includes(marker)) {
    if (fs.existsSync(shellFile)) {
      fs.copyFileSync(shellFile, `${shellFile}.rolebox-backup`);
    }
    const prefix = shellContent && !shellContent.endsWith("\n") ? "\n" : "";
    fs.appendFileSync(shellFile, `${prefix}\n${marker}\n${pathLine}\n`);
  }
  return { installDir, shellFile };
}

function walkJsonl(root, result) {
  if (!root || !fs.existsSync(root)) return;
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    let stat;
    try { stat = fs.statSync(current); } catch { continue; }
    if (stat.isDirectory()) {
      let entries = [];
      try { entries = fs.readdirSync(current); } catch { continue; }
      for (const entry of entries) stack.push(path.join(current, entry));
      continue;
    }
    if (!current.endsWith(".jsonl")) continue;
    result.files += 1;
    let content = "";
    try { content = fs.readFileSync(current, "utf8"); } catch { continue; }
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      const usage = event.usage || event.message?.usage || event.response?.usage;
      if (!usage) continue;
      result.input += Number(usage.input_tokens || usage.inputTokens || 0);
      result.output += Number(usage.output_tokens || usage.outputTokens || 0);
      result.cache += Number(
        usage.cache_read_input_tokens ||
        usage.cache_creation_input_tokens ||
        usage.cacheReadInputTokens ||
        0
      );
    }
  }
}

function usageFor(profile) {
  const usage = { input: 0, output: 0, cache: 0, files: 0 };
  walkJsonl(path.join(profile.codexHome, "sessions"), usage);
  walkJsonl(path.join(profile.claudeConfigDir, "projects"), usage);
  usage.total = usage.input + usage.output + usage.cache;
  return usage;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 920,
    minHeight: 650,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0D0F14",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(() => {
  ipcMain.handle("state:get", () => readState());
  ipcMain.handle("state:save", (_event, state) => {
    writeState(state);
    return state;
  });
  ipcMain.handle("profile:activate", (_event, id) => {
    const state = readState();
    const profile = state.profiles.find((item) => item.id === id);
    if (!profile) throw new Error("Profile not found");
    ensureProfileDirs(profile);
    state.activeProfileId = id;
    writeState(state);
    return state;
  });
  ipcMain.handle("profile:create", (_event, { name, color }) => createProfile(name, color));
  ipcMain.handle("agent:launch", (_event, { id, agent }) => {
    const profile = readState().profiles.find((item) => item.id === id);
    if (!profile) throw new Error("Profile not found");
    launchInTerminal(profile, agent);
    return true;
  });
  ipcMain.handle("folder:choose", async () => {
    const result = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle("folder:open", (_event, target) => {
    const profiles = readState().profiles;
    const allowedPaths = profiles.flatMap((profile) => [profile.vaultPath, profile.projectPath]);
    if (typeof target !== "string" || !allowedPaths.includes(target)) {
      throw new Error("Folder is not associated with a saved profile");
    }
    let stat;
    try { stat = fs.statSync(target); } catch {}
    if (!stat?.isDirectory()) throw new Error("Folder does not exist");
    return shell.openPath(target);
  });
  ipcMain.handle("usage:get", (_event, id) => {
    const profile = readState().profiles.find((item) => item.id === id);
    return profile ? usageFor(profile) : null;
  });
  ipcMain.handle("terminal:install", () => installTerminalIntegration());
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
