# Claude Agent Orchestration System

Opinionated Claude Code workflow configuration with bidirectional sync. Plug-and-play for any repository.

## Quick Start

```bash
# From source repo, initialize in target
./scripts/allhands.sh init /path/to/target-repo

# In target repo, pull updates
ALLHANDS_PATH=/path/to/source ./scripts/allhands.sh update
```

## Architecture

**Main agent**: sole code modifier, delegates ALL reads to subagents
**Subagents**: read-only specialists returning findings

```
.claude/
├── agents/       # planner, curator, researcher, parallel-worker
├── skills/       # 10+ knowledge modules
├── commands/     # /plan, /parallel-discovery, /plan-checkpoint
├── hooks/        # SessionStart, PreToolUse, PostToolUse automation
├── envoy/        # External tools (tavily, perplexity, vertex, parallel)
└── plans/        # Per-branch planning artifacts
```

## Agents

| Agent | Role |
|-------|------|
| **planner** | Spec-driven planning, checkpoint workflow |
| **curator** | .claude/ infrastructure, Claude Code expert |
| **researcher** | Web search (sole agent with access) |
| **parallel-worker** | Worktree subprocess coordinator |

## Skills

| Skill | Purpose |
|-------|---------|
| **research-tools** | Web search, deep research, X/Twitter |
| **git-ops** | Commits, PRs, branch management |
| **claude-code-patterns** | Best practice documentation |
| **skill-development** | Creating new skills |
| **specialist-builder** | Creating new agents |
| **hook-development** | Creating hooks |
| **claude-envoy-usage** | Using envoy integrations |
| **orchestration-idols** | Production agent patterns |

## Commands

| Command | Description |
|---------|-------------|
| `/plan` | Begin planning workflow |
| `/plan-checkpoint` | Validate implementation against plan |
| `/parallel-discovery` | Run multiple subagents simultaneously |
| `/parallel-orchestration` | Spawn worktree workers for parallel tasks |

## Envoy (External Tools)

```bash
envoy tavily search "query"       # Web search
envoy perplexity research "q"     # Deep research + citations
envoy vertex validate             # Plan validation
envoy vertex review               # Code review
envoy parallel spawn --branch X   # Worktree worker
```

## Planning Workflow

**Plan mode** (feature branches): Auto-creates plan, requires `/plan` → implement → `/plan-checkpoint`

**Direct mode** (main, master, quick/*): Immediate implementation

## AllHands Distribution

Bidirectional sync for distributing framework across repos.

| Command | Description |
|---------|-------------|
| `allhands init <target>` | Initialize framework in target |
| `allhands update` | Pull latest from source |
| `allhands sync-back` | Sync improvements back as PR |

See `docs/allhands.md` for details.

## Configuration

- `CLAUDE.md` - Framework instructions (distributed)
- `CLAUDE.project.md` - Project-specific instructions (local)
- `.claude/settings.json` - Hooks, permissions, env vars
- `.claude/settings.local.json` - Local overrides (not distributed)
