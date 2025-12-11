# Architecture

## Core Rule

**Main agent**: SOLE code modifier, delegates ALL context-consuming work
**Subagents**: READ-ONLY, return findings/implementations

## Components

| Component | Location | Role |
|-----------|----------|------|
| **Agents** | `.claude/agents/` | Specialist subagents (planner, curator, researcher, parallel-worker) |
| **Skills** | `.claude/skills/` | Knowledge modules loaded by agents |
| **Commands** | `.claude/commands/` | Slash command definitions (/plan, /parallel-discovery) |
| **Hooks** | `.claude/hooks/` | Lifecycle automation (SessionStart, PreToolUse, etc.) |
| **Envoy** | `.claude/envoy/` | External tool CLI (research, vertex, parallel) |
| **Plans** | `.claude/plans/` | Per-branch planning artifacts |

## Agents

| Agent | Role | Key Skills |
|-------|------|------------|
| **planner** | Spec-driven planning, checkpoints | git-ops, research-tools |
| **curator** | .claude/ infrastructure expert | claude-code-patterns, skill-development |
| **researcher** | Web search (sole agent allowed) | research-tools |
| **parallel-worker** | Worktree subprocess coordinator | - |

## Data Flow

```
User prompt
    │
    ├─► Hook: capture-queries.sh (log to queries.jsonl)
    │
    ├─► Hook: enforce_planning.py (trigger plan mode if feature branch)
    │
    └─► Main Agent
         │
         ├─► Delegates to subagent (Task tool)
         │    │
         │    └─► Subagent reads files, returns findings
         │
         └─► Implements changes (Write/Edit tools)
              │
              └─► Hook: PostToolUse validation
```

## Modes

| Mode | Branches | Behavior |
|------|----------|----------|
| **Plan** | feat/*, fix/*, etc. | Auto-creates plan, requires /plan workflow |
| **Direct** | main, master, quick/* | Immediate implementation, no planning |

## Envoy Commands

```bash
envoy tavily search "query"      # Web search
envoy perplexity research "q"    # Deep research + citations
envoy vertex validate            # Plan validation
envoy vertex review              # Code review
envoy parallel spawn --branch X  # Worktree worker
```

## Context Preservation

All tools minimize token usage:
- Envoy returns JSON, reads files externally
- Skills loaded on-demand via @import
- Hooks enforce constraints without loading files
