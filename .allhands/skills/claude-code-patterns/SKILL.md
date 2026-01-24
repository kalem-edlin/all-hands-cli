---
name: claude-code-patterns
description: Must use when building agents, skills, hooks, commands, or Claude Code tool configs. Contains Claude Code native feature documentation and structure patterns that are essential context.
globs:
  - ".allhands/**/*.ts"
  - ".allhands/**/*.md"
  - "**/CLAUDE.md"
  - ".claude/**/*"
---

<objective>
Reference for Claude Code native features. Docs auto-sync to `~/.claude-code-docs/docs/`. Read local docs for authoritative reference matching task use case.
</objective>

<quick_start>
1. Identify what you're building (skill, agent, hook, etc.)
2. MUST Read corresponding docs from `~/.claude-code-docs/docs/`
3. Apply patterns from doc categories below
</quick_start>

<success_criteria>
- Correct doc file(s) consulted for task type
- Implementation follows official patterns
- Structure matches documented conventions
</success_criteria>

<workflow>
### Doc Selection by Task

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

### Doc Categories

**Core (curator priority)**: skills.md, sub-agents.md, hooks-guide.md, hooks.md, mcp.md, memory.md, plugins.md

**Config**: settings.md, model-config.md, network-config.md, terminal-config.md, output-styles.md

**IDE**: vs-code.md, jetbrains.md, devcontainer.md, desktop.md

**Enterprise**: amazon-bedrock.md, google-vertex-ai.md, microsoft-foundry.md, iam.md, security.md, llm-gateway.md

**CI/CD**: github-actions.md, gitlab-ci-cd.md, headless.md

**Reference**: cli-reference.md, common-workflows.md, troubleshooting.md, changelog.md, quickstart.md
</workflow>

<examples>
### Extended Patterns (./docs/)
- `docs/context-hygiene.md` - CLAUDE.md priority rules, poison context detection
</examples>
