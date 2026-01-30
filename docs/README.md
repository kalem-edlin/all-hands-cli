---
description: "Top-level documentation index covering all four domains of the all-hands framework: harness CLI, agent flows, agent configurations, and the sync CLI."
---

# All-Hands Documentation

Engineering knowledge for the all-hands agentic development framework. Documentation exposes code intent, key decisions, and system relationships via file references for semantic discovery.

## Domains

### Harness

The core CLI tool powering agent orchestration. Commands for planning, knowledge search, schema validation, spec management, agent spawning, MCP tooling, observability, and more. Includes the TUI, event loop, hook system, and test infrastructure.

`docs/harness/README.md`

### Flows

Workflow definitions that guide agents through tasks. Covers the full lifecycle: ideation, spec planning, prompt execution, judge reviewing, emergent refinement, compounding, coordination, and documentation generation.

`docs/flows/README.md`

### Agents

Agent configuration profiles and initiative orchestration. Defines agent types (planning, execution, quality review, orchestration, knowledge), the YAML configuration system, and how initiative types and settings.json shape agent behavior.

`docs/agents/README.md`

### Sync CLI

CLI for distributing the all-hands framework to other repositories. Handles framework syncing with conflict resolution, upstream contribution via GitHub fork/PR, manifest-based file filtering, and interactive terminal prompts.

`docs/sync-cli/README.md`

## Cross-Domain Relationships

- **Agents reference Flows**: Each agent profile in `docs/agents/README.md` points to a flow file that defines its behavior from `docs/flows/README.md`
- **Harness executes Agents**: The spawn command `docs/harness/cli/spawn-command.md` loads agent profiles, and the event loop `docs/harness/event-loop.md` orchestrates prompt dispatch
- **Hooks enforce Flows**: Context hooks `docs/harness/hooks/context-hooks.md` and validation hooks `docs/harness/hooks/validation-hooks.md` enforce flow directives at the tool level
- **Sync distributes Harness**: The sync CLI `docs/sync-cli/README.md` packages and distributes the harness to target repositories
- **Knowledge connects everything**: The knowledge command `docs/harness/cli/knowledge-command.md` indexes docs, solutions, and memories for semantic discovery across all domains
