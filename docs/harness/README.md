---
description: "Harness domain documentation covering the ah CLI commands, hook system, TUI, event loop, agent profiles, CLI daemon, and test infrastructure."
---

# Harness

The `ah` CLI is the core tool for agent orchestration. It provides commands, hooks, a terminal UI, and supporting systems.

## CLI Commands

Commands registered via filesystem auto-discovery. See `docs/harness/cli/README.md` for the full list.

## Hooks

Pre/post tool hooks that inject context, validate schemas, enforce rules, and manage agent lifecycle. See `docs/harness/hooks/README.md`.

## Systems

- **TUI** — Blessed-based terminal interface with three-pane layout, modal system, and vim-style navigation: `docs/harness/tui.md`
- **Event Loop** — Background polling for prompt dispatch, agent monitoring, PR review detection, and branch state: `docs/harness/event-loop.md`
- **Agent Profiles** — YAML profile loading, template resolution, and invocation building: `docs/harness/agent-profiles.md`
- **CLI Daemon** — Unix socket server for fast hook execution, bypassing CLI startup overhead: `docs/harness/cli-daemon.md`
- **Test Harness** — E2E test infrastructure with fixtures, runners, and assertions: `docs/harness/test-harness.md`
