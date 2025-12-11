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

## Mode 2: Worktree Workers (`parallel-worker` agent)

**Use for**: Write-capable parallel implementation, isolated task execution

### Architecture

Main agent spawns `parallel-worker` agent(s) as background Tasks. Each worker:
1. Receives isolated tasks (sequential, no external dependencies)
2. Converts tasks to mini-plan markdown
3. Spawns worktree subprocess via `envoy parallel spawn --wait --plan`
4. Blocks until subprocess completes
5. Updates main plan file with results
6. Returns to main agent

```
Main Agent
    │
    └─► Task(parallel-worker, run_in_background=true)
            │
            └─► envoy parallel spawn --plan "<mini-plan>" --branch X
                    │
                    └─► (blocks until Claude subprocess completes)
            │
            ├─► Updates main plan file
            └─► Returns {status, branch, summary}
```

### Commands

| Command | Description |
|---------|-------------|
| `envoy parallel spawn --branch X --task "Y" --plan "Z" [--from B]` | Create worktree + inject plan + run synchronous Claude |
| `envoy parallel status` | List workers and status |
| `envoy parallel results [--worker X] [--tail N]` | Get worker output (debugging) |
| `envoy parallel cleanup [--worker X] [--all] [--force]` | Remove worktrees |

### Spawn Flags

| Flag | Description |
|------|-------------|
| `--branch` | Branch name for worktree |
| `--task` | Task description/prompt for Claude |
| `--plan` | Mini-plan markdown to inject into worktree |
| `--from` | Base branch (default: HEAD) |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PARALLEL_MAX_WORKERS` | `3` | Max concurrent workers |
| `PARALLEL_WORKER_DEPTH` | (unset) | Set to `1` in subprocesses to block nesting |

### Worktree Location

Workers created in `.trees/<branch-name>/` (gitignored).

### Mini-Plan Format

```markdown
# Worker Tasks

- [ ] Task 1 description
- [ ] Task 2 description

Complete each task sequentially. Commit after each logical change.
```

### Plan File Updates

Workers update main plan at `.claude/plans/<parent-branch>/plan.md`:

```markdown
## Worker Branches
- `worker/<name>`: Summary of completed work

## Steps
- [x] Task description (branch: worker/<name>)
```

### PARALLEL_WORKER_DEPTH Effects

When `PARALLEL_WORKER_DEPTH > 0` (in subprocess):
- `/plan` command disabled
- Planning suggestions suppressed
- Subprocess uses injected mini-plan only
- Nested `envoy parallel spawn` blocked

### Workflows

**Via parallel-worker agent** (recommended):
```
Main agent:
1. Identifies isolated tasks from plan
2. Spawns: Task(parallel-worker, run_in_background=true)
   - tasks: ["task1", "task2"]
   - feature: "my-feature"
3. Continues main thread work
4. Checks AgentOutputTool when ready
5. Merges worker branches, runs /plan-checkpoint
```

**Manual spawn** (debugging):
```bash
envoy parallel spawn \
  --branch "worker/my-task" \
  --task "Implement X" \
  --plan "# Tasks\n- [ ] Do X\n- [ ] Test X" \
  --from main
```

### Important Notes

1. **Always synchronous** - `spawn` blocks until subprocess completes
2. **No orphaned processes** - Closing main Claude kills workers
3. **`.env` copied automatically** - Workers get parent's API keys
4. **STDOUT shielded** - Heartbeats only during execution, full log to `.claude-worker.log`
5. **Cleanup removes branch** - `cleanup` deletes worktree AND branch

---

## Anti-Patterns

- **Worktrees for read-only** - Use `/parallel-discovery` instead
- **Nested workers** - Blocked by `PARALLEL_WORKER_DEPTH`
- **Fire-and-forget** - Workers always synchronous now
- **Manual polling** - Use `parallel-worker` agent instead
- **Parallel for simple tasks** - Only valuable for isolated task chains
