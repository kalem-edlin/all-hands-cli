---
name: claude-code-patterns
description: Use when building agents, skills, hooks, or tool configs. Contains Claude Code native feature documentation and structure patterns.
---

# Claude Code Best Practices

Docs auto-sync on startup at `~/.claude-code-docs/docs/`. For ANY GIVEN TASK, read local docs for authoritative reference that match the tasks use case.

## Workflow: When to Read Which Docs

| Building | Read These (in ~/.claude-code-docs/docs/) |
|----------|------------------------------------------|
| Skills | skills.md, plugins.md |
| Agents/Sub-agents | sub-agents.md |
| Hooks | hooks-guide.md, hooks.md |
| MCP/Tools | mcp.md, third-party-integrations.md |
| Memory/Context | memory.md, settings.md |
| CLI Commands | cli-reference.md, slash-commands.md |
| Enterprise/Auth | amazon-bedrock.md, google-vertex-ai.md, iam.md, security.md |
| IDE Integration | vs-code.md, jetbrains.md, devcontainer.md |
| CI/CD | github-actions.md, gitlab-ci-cd.md, headless.md |

## Doc Categories

**Core (curator priority)**: skills.md, sub-agents.md, hooks-guide.md, hooks.md, mcp.md, memory.md, plugins.md

**Config**: settings.md, model-config.md, network-config.md, terminal-config.md, output-styles.md

**IDE**: vs-code.md, jetbrains.md, devcontainer.md, desktop.md

**Enterprise**: amazon-bedrock.md, google-vertex-ai.md, microsoft-foundry.md, iam.md, security.md, llm-gateway.md

**CI/CD**: github-actions.md, gitlab-ci-cd.md, headless.md

**Reference**: cli-reference.md, common-workflows.md, troubleshooting.md, changelog.md, quickstart.md

## Extended Patterns (./docs/)

Read these for specific scenarios:
- `docs/context-hygiene.md` - CLAUDE.md priority rules, poison context detection

## Community Patterns

For advanced patterns beyond official docs:
- [claudelog.com](https://claudelog.com) - community mechanics and patterns
- [AgentDB](https://agentdb.ruv.io/) - memory management
