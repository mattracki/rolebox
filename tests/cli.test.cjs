const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const cli = path.resolve(__dirname, "..", "cli", "rolebox.cjs");

function run(home, args, cwd = home, extraEnv = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    env: {
      ...process.env,
      ROLEBOX_HOME: path.join(home, "config"),
      XDG_DATA_HOME: path.join(home, "data"),
      ...extraEnv
    },
    encoding: "utf8"
  });
}

test("creates, selects, and resolves global and local profiles", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rolebox-test-"));
  const project = path.join(root, "project");
  const child = path.join(project, "child");
  fs.mkdirSync(child, { recursive: true });

  assert.equal(run(root, ["list"]).stdout, "");
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(root, "config", "profiles.json"), "utf8")),
    { activeProfileId: null, profiles: [] }
  );
  assert.equal(run(root, ["add", "Personal"]).status, 0);
  assert.equal(run(root, ["add", "Client A"]).status, 0);
  assert.equal(run(root, ["global", "client-a"]).status, 0);
  assert.match(run(root, ["current"]).stdout, /Client A \(client-a\) — global/);

  assert.equal(run(root, ["local", "personal"], project).status, 0);
  assert.equal(
    fs.statSync(path.join(root, "data", "rolebox", "profiles", "personal", "codex")).isDirectory(),
    true
  );
  assert.equal(
    fs.statSync(path.join(root, "data", "rolebox", "profiles", "personal", "claude")).isDirectory(),
    true
  );
  assert.match(run(root, ["current"], child).stdout, /Personal \(personal\) — local/);
  assert.equal(run(root, ["local", "--unset"], project).status, 0);
  assert.match(run(root, ["current"], child).stdout, /Client A \(client-a\) — global/);
});

test("passes explicit configuration directories to official agent commands", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rolebox-agent-test-"));
  const fakeBin = path.join(root, "fake-bin");
  fs.mkdirSync(fakeBin, { recursive: true });
  const codex = path.join(fakeBin, "codex");
  const claude = path.join(fakeBin, "claude");
  fs.writeFileSync(codex, "#!/bin/sh\nprintf '%s' \"$CODEX_HOME\"\n", { mode: 0o700 });
  fs.writeFileSync(claude, "#!/bin/sh\nprintf '%s' \"$CLAUDE_CONFIG_DIR\"\n", { mode: 0o700 });
  const env = { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` };

  assert.equal(run(root, ["add", "Personal"]).status, 0);
  const codexResult = run(root, ["codex"], root, env);
  const claudeResult = run(root, ["claude"], root, env);
  assert.equal(codexResult.status, 0);
  assert.equal(claudeResult.status, 0);
  assert.equal(
    fs.statSync(path.join(root, "data", "rolebox", "profiles", "personal", "codex")).isDirectory(),
    true
  );
  assert.equal(
    fs.statSync(path.join(root, "data", "rolebox", "profiles", "personal", "claude")).isDirectory(),
    true
  );
  assert.match(codexResult.stdout, /rolebox\/profiles\/personal\/codex$/);
  assert.match(claudeResult.stdout, /rolebox\/profiles\/personal\/claude$/);
});
