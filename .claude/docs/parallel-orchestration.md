# Parallel Orchestration

Two modes for parallel execution.

## Mode 1: In-Session Discovery (`/parallel-discovery`)

**Use for**: Read-only exploration, multi-perspective analysis, planning research

```
/parallel-discovery <task description>
```

Spawns multiple subagents (explorer, curator, researcher) simultaneously within current session. Results aggregated and returned.

**When to use**:
- Planning phase - gather specialist + explorer context in parallel
- Codebase questions - get structure + patterns + external docs simultaneously
- Research tasks - multiple sources at once

**Anti-patterns**:
- Don't use for simple single-file questions
- Don't use when you need write operations

---

## Mode 2: Worktree Workers (`envoy parallel`)

**Use for**: Write-capable parallel implementation, side fixes, long-running tasks

### Commands

| Command | Description |
|---------|-------------|
| `envoy parallel spawn --branch X --task "Y" [--from Z]` | Create worktree + headless session |
| `envoy parallel status` | List workers and status |
| `envoy parallel results [--worker X] [--tail N]` | Get worker output |
| `envoy parallel cleanup [--worker X] [--all] [--force]` | Remove worktrees |

### Environment Variables

Configure in `.claude/settings.json` under `env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `PARALLEL_MAX_WORKERS` | `3` | Max concurrent workers |
| `PARALLEL_WORKER_PREFIX` | `claude-worker-` | Worktree directory prefix |

### Workflows

**Side-fix pattern** (fix unrelated issue while on feature branch):
```bash
# From feature branch, spawn quick fix on main
envoy parallel spawn --branch quick/hook-fix --from main --task "Fix hook validation in .claude/hooks/scripts/validate_skill.py"

# Continue feature work...

# Check status
envoy parallel status

# Get results when done
envoy parallel results --worker quick-hook-fix

# Cleanup
envoy parallel cleanup --worker quick-hook-fix
```

**Parallel feature streams**:
```bash
# Spawn multiple workers from same base
envoy parallel spawn --branch feat/api-endpoints --task "Implement REST endpoints per spec"
envoy parallel spawn --branch feat/db-models --task "Create database models per spec"
envoy parallel spawn --branch feat/frontend --task "Build React components per spec"

# Monitor all
envoy parallel status

# Get all results
envoy parallel results
```

### Important Notes

1. **`.env` copied automatically** - Workers get copy of parent's `.env`
2. **Workers detached** - Continue working while workers run
3. **Cleanup removes branch** - `cleanup` deletes worktree AND branch
4. **Force for uncommitted** - Use `--force` if worker has uncommitted changes

---

## Anti-Patterns

- **Worktrees for read-only** - Use `/parallel-discovery` instead
- **Specialists without skills** - All agents same model, skills differentiate
- **Verbose subagent output** - Defeats context preservation
- **Direct agent communication** - Use coordinator (main agent aggregates)
- **Parallel for simple tasks** - Only valuable when multi-perspective needed
