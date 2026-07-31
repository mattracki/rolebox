# Rolebox

An asdf-style profile manager for AI coding agents.

> Switch roles. Keep context.

Rolebox gives consulting, client, company, and personal work separate
Codex and Claude Code configuration directories. Choose a global context or pin
one to a project folder, then use the official `codex` and `claude` commands as
usual.

## Why Rolebox

Rolebox is not another AI chat client. It is the identity and context layer
underneath the tools you already use.

Consultants and people working across multiple organizations need more than a
model switcher. Each role may have different credentials, integrations,
instructions, projects, knowledge, and billing boundaries. Rolebox answers one
question before an agent starts:

> Which organization am I working as right now?

A Rolebox profile represents a portable work identity:

```text
Client A
├── Codex credentials and configuration
├── Claude credentials and configuration
├── MCP integrations
├── Google, Jira, and GitHub accounts
├── Obsidian vault
├── project directories
├── instructions and rules
└── usage attribution
```

Your editor and terminal remain interchangeable interfaces. Cursor, VS Code,
Terminal, Warp, and other tools can launch the official agent CLIs while
Rolebox supplies the correct role-specific environment.

The goal is not merely to switch models. It is to prevent credentials and
context from crossing client boundaries while letting you use the best agent
for each task.

## Install with Homebrew

CLI:

```sh
brew install mattracki/rolebox/rolebox
```

Optional desktop manager:

```sh
brew install --cask mattracki/rolebox/rolebox-app
```

Until the first public GitHub release is published, use the packaged artifacts
from this repository instead of those commands.

## Quick start

```sh
rolebox add "Client A"
rolebox add "Client B"
rolebox add "Personal"

rolebox global personal

cd ~/work/client-a
rolebox local client-a
rolebox current
```

The shorter `rb` command is installed as an alias by Homebrew and npm.

Enable transparent shell shims:

```sh
echo 'eval "$(rolebox shell-init zsh)"' >> ~/.zshrc
exec zsh
```

Now the normal commands resolve the nearest local profile, falling back to the
global profile:

```sh
codex
claude
```

Rolebox invokes the official executables. It does not clone, proxy, or
replace either agent.

## The everyday workflow

Pin each project once:

```sh
cd ~/work/client-a
rolebox local client-a
```

From that directory and its children, supported agents automatically resolve
the Client A profile:

```sh
codex
claude
```

Use Cursor or another editor for project-specific chat history, the official
agent CLIs for role-isolated execution, and Obsidian for durable,
model-independent knowledge.

Rolebox is currently focused on Codex and Claude Code. Planned adapters include
Cursor Agent, Gemini CLI, Aider, and other tools that expose isolatable
configuration or credential boundaries.

## Profile resolution

Resolution follows the version-manager pattern:

1. The closest `.rolebox-profile` marker from the current directory upward.
2. The globally selected profile.

```sh
rolebox global personal
rolebox local client-a
rolebox local --unset
rolebox list
rolebox current
```

Each profile provides:

- `CODEX_HOME` for Codex
- `CLAUDE_CONFIG_DIR` for Claude Code
- independent login, MCP, plugin, skill, and session state
- an optional Obsidian vault, project root, and integration inventory in the
  desktop app

## Desktop app

The optional Electron app creates and activates profiles, associates Obsidian
vaults and project folders, launches the official CLIs, and reads usage totals
from local session logs.

```sh
npm install
npm start
```

## Storage

Configuration:

```text
~/.config/rolebox/profiles.json
```

Agent profile data:

```text
~/.local/share/rolebox/profiles/<profile>/
├── codex/
└── claude/
```

`ROLEBOX_HOME`, `XDG_CONFIG_HOME`, and `XDG_DATA_HOME` are respected.

## Security

Rolebox never reads or stores passwords itself. Codex, Claude Code, and
individual MCP servers remain responsible for their own credentials.

For consulting work, use distinct profiles, Obsidian vaults, and OAuth
authorizations for every client. Do not expose a cross-client vault to a
client-scoped agent.

## Homebrew release process

This repository includes:

- `homebrew/Formula/rolebox.rb.template`
- `homebrew/Casks/rolebox-app.rb.template`
- `.github/workflows/release.yml`
- `scripts/render-homebrew-files.cjs`

To publish the next patch release from a clean `main` branch:

```sh
npm run release
```

Pass `minor`, `major`, or an exact version when needed:

```sh
npm run release -- minor
npm run release -- 1.0.0
```

The script runs checks and tests, updates the package version, creates the
release commit and tag, and pushes both atomically. The tag triggers the GitHub
Actions workflow that builds and publishes the macOS archives and source
archive.

Create immutable source and app archives, then render the tap files with their
real checksums:

```sh
node scripts/render-homebrew-files.cjs \
  mattracki 0.1.0 \
  rolebox-0.1.0.tar.gz \
  Rolebox-macOS-arm64.zip \
  Rolebox-macOS-x64.zip
```

The public repository should be named `rolebox`, which enables the
short tap name `mattracki/rolebox`.

## License

MIT
