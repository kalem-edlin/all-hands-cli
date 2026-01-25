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

## Environment Variables

Check `.env.ai.example` for what you should populate `.env.ai` with.


## Quick Start

```bash
ah <command>
```

The `ah` command works from any directory within an all-hands project.

## Optional Dependencies

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

## Project Settings

Project-specific configuration lives in `.allhands/settings.json`:

```json
{
  "$schema": "./harness/src/schemas/settings.schema.json",
  "git": {
    "baseBranch": "main"
  },
  "validation": {
    "format": {
      "enabled": false,
      "command": "pnpm format"
    }
  }
}
```

See the schema for all available options.
