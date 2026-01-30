---
description: "Background polling daemon that monitors git branches, dispatches prompt execution, spawns hypothesis planner with exponential backoff, tracks agent windows, detects PR review feedback, and coordinates parallel agent spawning with cooldown guards."
---

# Event Loop

The event loop is a non-blocking polling daemon that bridges external state (git, tmux, GitHub) with the TUI's reactive model. It runs on a configurable tick interval and fires callbacks when state changes, enabling the TUI to stay current without blocking user interaction.

## Tick Architecture

Each tick runs four independent checks in parallel, followed by a sequential prompt loop check:

```mermaid
graph TD
    T[tick] --> P[checkPRReviewFeedback]
    T --> G[checkGitBranch]
    T --> A[checkAgentWindows]
    T --> F[checkPromptFiles]
    P & G & A & F --> L[checkPromptLoop]
```

[ref:.allhands/harness/src/lib/event-loop.ts:EventLoop:4eddba4] stores all state in an [ref:.allhands/harness/src/lib/event-loop.ts:EventLoopState:4eddba4] object that tracks the current branch, spec, PR URL, active agents, executor prompts, tick count, and hypothesis planner backoff counters (`emergentSpawnCount`, `emergentLastPromptCount`).

## Check: PR Review Feedback

[ref:.allhands/harness/src/lib/pr-review.ts:checkPRReviewStatus:4eddba4] polls GitHub for PR review comments. The event loop only runs this check every N ticks (configured via `settings.prReview.checkFrequency`, default 3) since reviews take minutes to complete.

The detection pipeline:
1. [ref:.allhands/harness/src/lib/pr-review.ts:parsePRUrl:4eddba4] validates the PR URL format
2. Reads `lastReviewRunTime` from `status.yaml` to filter old comments
3. Checks for comments matching the configured `reviewDetectionString` (default: "greptile")
4. [ref:.allhands/harness/src/lib/pr-review.ts:hasNewReview:4eddba4] compares previous and current `PRReviewState` to detect new reviews
5. On detection, fires `onPRReviewFeedback` callback and updates `status.yaml`

[ref:.allhands/harness/src/lib/pr-review.ts:triggerPRReview:4eddba4] posts a comment (default: "@greptile") to trigger a new review cycle.

## Check: Git Branch

The event loop treats the git branch as the primary context key. On each tick, it reads the current branch and compares it to stored state. When a branch change is detected:

1. Updates `currentBranch`, `planningKey` (sanitized branch name for `.planning/` lookup)
2. Resolves the new spec via `getSpecForBranch()`
3. Fires `onBranchChange` callback so the TUI reloads prompts and planning artifacts

This implements the **branch-keyed model**: no separate "active spec" tracking is needed because the branch determines the spec.

## Check: Agent Windows

Monitors tmux windows to track which agents are alive. Only considers windows that appear in the spawned agent registry (preventing pickup of unrelated tmux windows).

When agents disappear:
- Their MCP daemons are cleaned up via `shutdownDaemon()`
- They are unregistered from the spawn registry
- Active executor prompt numbers are reconciled (executor/emergent windows encode prompt numbers in their names, e.g., `executor-03`)
- The spawn cooldown timestamp is cleared when an executor or emergent window disappears, allowing new spawns immediately

The reconciliation step also runs proactively: if `activeExecutorPrompts` contains numbers with no matching running window, those entries are pruned. This handles edge cases where an agent dies before the next `checkAgentWindows` tick.

## Check: Prompt Files

[ref:.allhands/harness/src/lib/prompts.ts:loadAllPrompts:4eddba4] reads all prompt files from the current planning directory. The event loop computes a hash-based snapshot of prompt filenames, statuses, and numbers. When the hash changes, it fires `onPromptsChange` with the full prompt list and a `PromptSnapshot` containing counts by status.

When new pending prompts are detected (snapshot pending count increases), the hypothesis planner backoff resets to zero -- external prompt creation signals productive work.

This makes the harness the coordinator: it detects when agents create, modify, or complete prompts without those agents needing to know about the TUI.

## Prompt Execution Loop

The prompt loop is the sequential check that runs after all parallel checks complete, implemented in [ref:.allhands/harness/src/lib/event-loop.ts:EventLoop:4eddba4]. It implements a unified decision path:

```mermaid
stateDiagram-v2
    [*] --> CheckEnabled: loopEnabled?
    CheckEnabled --> Paused: No
    CheckEnabled --> CheckEmergent: Yes
    CheckEmergent --> Blocked: emergent planner running
    CheckEmergent --> CheckCapacity: no emergent
    CheckCapacity --> AtMax: executors >= maxParallel
    CheckCapacity --> CheckCooldown: has capacity
    CheckCooldown --> Cooling: spawned < cooldown ago
    CheckCooldown --> PickPrompt: cooldown clear
    PickPrompt --> SpawnExecutor: pending prompt found
    PickPrompt --> CheckBackoff: no pending + no in_progress
    CheckBackoff --> BackoffWait: within backoff window
    CheckBackoff --> SpawnHypothesisPlanner: backoff clear
    PickPrompt --> Wait: no pending + in_progress exist
```

1. **Loop enabled + pending prompts** -- Pick next eligible prompt, spawn executor
2. **Loop enabled + no pending + no in_progress** -- Spawn hypothesis planner (with backoff)
3. **Loop enabled + no pending + in_progress exist** -- Wait for running executors
4. **Loop disabled** -- Nothing happens

### Parallel Execution Rules

1. **One agent per tick** -- Only one agent spawns per event loop cycle, preventing thundering herds
2. **Hypothesis planner singleton** -- At most one emergent planner runs at a time; the planner spawns only when all prompts are done (none pending, none in_progress)
3. **Parallel executors** -- When parallel mode is enabled, up to `settings.spawn.maxParallelPrompts` (default 3) executors can run simultaneously
4. **10-second base cooldown** -- [ref:.allhands/harness/src/lib/event-loop.ts:SPAWN_COOLDOWN_MS:4eddba4] prevents race conditions where tmux hasn't registered the new window yet
5. **Prompt exclusion** -- `activeExecutorPrompts` tracks which prompts have running agents, preventing duplicate assignment

Two toggles control execution: **Loop** (O) enables/disables the entire prompt loop, **Parallel** (P) toggles multi-executor mode.

### Prompt Selection

[ref:.allhands/harness/src/lib/prompts.ts:pickNextPrompt:4eddba4] selects the next prompt to execute:
- Filters to `pending` status only
- Checks dependency satisfaction via [ref:.allhands/harness/src/lib/prompts.ts:dependenciesSatisfied:4eddba4] -- all dependency prompt numbers must be `done`
- Excludes prompts already being worked on (`excludePrompts` parameter)
- Returns the lowest-numbered eligible prompt (FIFO ordering)

[ref:.allhands/harness/src/lib/prompts.ts:markPromptInProgress:4eddba4] atomically updates the prompt's frontmatter status to `in_progress` using file locking via [ref:.allhands/harness/src/lib/prompts.ts:withFileLock:4eddba4].

## Hypothesis Planner Backoff

When no pending or in-progress prompts remain, the event loop spawns a hypothesis planner to generate new work. To avoid wasteful respawning when the planner fails to produce prompts, exponential backoff is applied.

### Tracking Productivity

[ref:.allhands/harness/src/lib/event-loop.ts:EventLoopState:4eddba4] tracks two fields:

| Field | Purpose |
|-------|---------|
| `emergentSpawnCount` | Consecutive unproductive spawns (planner ran but did not create new prompts) |
| `emergentLastPromptCount` | Total prompt count at time of last planner spawn -- compared against current count to detect new prompt creation |

After each spawn, if `currentPromptCount <= emergentLastPromptCount`, the spawn was unproductive and `emergentSpawnCount` increments. If the planner produced new prompts, the count resets to zero.

### Backoff Formula

```
cooldown = SPAWN_COOLDOWN_MS * 2^min(emergentSpawnCount, 4)
```

| Unproductive Spawns | Cooldown |
|---------------------|----------|
| 0 | 10s |
| 1 | 20s |
| 2 | 40s |
| 3 | 80s |
| 4+ | 160s (cap) |

The base cooldown is [ref:.allhands/harness/src/lib/event-loop.ts:SPAWN_COOLDOWN_MS:4eddba4] (10 seconds). The exponent caps at 4, giving a maximum wait of 160 seconds.

### Backoff Resets

The backoff counter resets to zero when:
- **Loop toggle** -- `setLoopEnabled()` resets `emergentSpawnCount` on any toggle
- **New pending prompt detection** -- `checkPromptFiles()` resets when `snapshot.pending > previousSnapshot.pending`

Backoff status is traced via the `onLoopStatus` callback, logging messages like `Emergent planner backoff: waiting 40s (2 unproductive spawns)`.

## Event Loop Callbacks

[ref:.allhands/harness/src/lib/event-loop.ts:EventLoopCallbacks:4eddba4] defines the callback interface:

| Callback | Trigger |
|----------|---------|
| `onPRReviewFeedback` | New PR review detected |
| `onBranchChange` | Git branch changed |
| `onAgentsChange` | Agent windows appeared or disappeared |
| `onSpawnExecutor` | Pending prompt picked for execution |
| `onSpawnEmergentPlanning` | Hypothesis planner spawn triggered (no arguments -- planner uses profile defaults) |
| `onLoopStatus` | Status messages for activity log |
| `onPromptsChange` | Prompt files created, modified, or completed |

## Configuration

All timing and behavior is configurable via `.allhands/settings.json`:

| Setting | Path | Default | Purpose |
|---------|------|---------|---------|
| Tick interval | `eventLoop.tickIntervalMs` | 5000 | Milliseconds between ticks |
| PR check frequency | `prReview.checkFrequency` | 3 | Check PR every N ticks |
| Review detection | `prReview.reviewDetectionString` | "greptile" | Comment substring to detect |
| Rerun comment | `prReview.rerunComment` | "@greptile" | Comment to post for rerun |
| Max parallel | `spawn.maxParallelPrompts` | 3 | Max concurrent executors |

## Lifecycle

- **Start**: `start()` begins the interval timer and runs an initial tick
- **Stop**: `stop()` clears the interval
- **Force tick**: `forceTick()` triggers an immediate tick, used when enabling parallel mode to spawn without waiting
- **Branch sync**: `setBranchContext()` manually overrides branch state after TUI-initiated changes, preventing the event loop from re-detecting the change and overwriting TUI state
