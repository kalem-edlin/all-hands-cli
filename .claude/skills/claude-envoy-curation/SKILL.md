---
name: claude-envoy-curation
description: Use when adding new external tool integrations to claude-envoy (replaces MCP servers). Contains command patterns and auto-discovery requirements.
---

# claude-envoy Curation

For extending claude-envoy with new commands.

## Architecture

```
.claude/envoy/
├── envoy              # Bash wrapper (auto-creates venv, loads .env)
├── envoy.py           # CLI with auto-discovery
├── commands/          # Command modules (auto-discovered)
│   ├── base.py        # BaseCommand class
│   └── {group}.py     # COMMANDS = {"cmd": Class, ...}
└── requirements.txt
```

## Adding a Command

### 1. Read existing patterns

```bash
# See current commands
envoy info

# Read base class
cat .claude/envoy/commands/base.py

# Read example module
cat .claude/envoy/commands/perplexity.py
```

### 2. Create or edit command module

In `.claude/envoy/commands/{group}.py`:

```python
from __future__ import annotations
from typing import Optional
from .base import BaseCommand

class MyCommand(BaseCommand):
    name = "mycommand"
    description = "What it does"

    def add_arguments(self, parser) -> None:
        parser.add_argument("query", help="Required arg")
        parser.add_argument("--optional", help="Optional flag")

    def execute(self, *, query: str, optional: Optional[str] = None, **kwargs) -> dict:
        # Implementation
        return self.success({"result": "..."})

# Auto-discovered by envoy.py
COMMANDS = {
    "mycommand": MyCommand,
}
```

### 3. Add dependencies

If new packages needed, add to `.claude/envoy/requirements.txt` and delete `.claude/envoy/.venv/` to trigger reinstall.

## Standards

- All commands output JSON to stdout
- Use `self.success(data, metadata)` and `self.error(type, message)`
- Use `self.read_file()` / `self.read_files()` for file access
- Use `self.timed_execute()` for timing API calls
- Python 3.9 compat: use `Optional[]` not `|`, add `from __future__ import annotations`
- Opinionated defaults: minimize exposed params, hardcode sensible values

## Base Command Helpers

```python
self.success(data, metadata=None)  # Return success response
self.error(type, message, suggestion=None)  # Return error response
self.read_file(path)  # Read file, returns None if not found
self.read_files(paths)  # Read multiple files
self.timed_execute(func, *args)  # Returns (result, duration_ms)
self.timeout_ms  # From ENVOY_TIMEOUT_MS env var
```

## Testing

```bash
# Test command
envoy {group} {command} "test"

# Verify registration
envoy info

# Check help
envoy {group} {command} --help
```
