# All Hands CLI

Internal CLI for the All Hands agentic harness.

## Installation

```bash
cd .allhands/harness
npm install
```

The `ah` command is automatically installed to `~/.local/bin/ah` when you run `npx all-hands init`. This shim finds and executes the project-local `.allhands/harness/ah` from any subdirectory.

For local development, copy the shim to your PATH:
```bash
cp .allhands/harness/ah ~/.local/bin/ah
```

### Universal Ctags (for `ah docs` command)

```bash
# macOS
brew install universal-ctags

# Ubuntu/Debian
sudo apt install universal-ctags
```

### AST-grep (for advanced code search)

```bash
# macOS
brew install ast-grep

# cargo
cargo install ast-grep --locked
```

### Desktop Notifications (macOS)

```bash
brew install --cask notifier
```

## Language Servers (for LSP tool)

```bash
npm install -g typescript-language-server typescript pyright
brew install swift  
```

## Environment Variables

Check `.env.ai.example` for what you should populate `.env.ai` with.


## Quick Start

```bash
ah <command>
```

The `ah` command works from any directory within an all-hands project.


## Syncing to Target Repos

The `sync` command distributes harness files from this repo to target repositories:

```bash
ah sync /path/to/target-repo
```

By default, sync preserves configuration files that target repos customize (settings, hooks, validation suites). These "init-only" files are only included during first-time setup or when explicitly requested.

### The `--init` Flag

Use `--init` to include init-only files — configuration defaults like `docs.json` that are normally withheld to avoid overwriting target-repo customizations:

```bash
# First-time setup — include all defaults
ah sync /path/to/target-repo --init

# Regular update — preserves target-repo configuration
ah sync /path/to/target-repo
```

Use `--init` when setting up a new repo or resetting configuration to harness defaults. Omit it for routine updates. See `ah sync --help` for full options.

## Project Settings

Project-specific configuration lives in `.allhands/settings.json`:

```json
{
  "$schema": "./harness/src/schemas/settings.schema.json",
}
```
