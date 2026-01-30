---
description: "Terminal UI built on blessed providing a three-pane layout for agent orchestration: actions pane with new initiative spec type selection, prompts pane for tracking prompt status, status pane for monitoring active agents, and two toggles (Loop, Parallel) for controlling the unified event loop."
---

# Terminal User Interface (TUI)

The TUI is the primary operator interface for the harness. It renders a three-pane terminal layout using the blessed library, integrates with the event loop for real-time state updates, and manages agent lifecycles through tmux window orchestration.

## Layout Architecture

```
+-------------------+-------------------+-------------------+
|     HEADER        |  ALL HANDS        |  AGENTIC HARNESS  |
+-------------------+-------------------+-------------------+
|                   |                   |                    |
|   Actions Pane    |   Prompts Pane    |   Status Pane      |
|                   |                   |                    |
|  [1] Coordinator  |  * 01: Task A     |  Spec: api-v2      |
|  [2] New Initiative  > 02: Task B     |  Branch: feat/api   |
|  [3] Planner      |  - 03: Task C     |                    |
|  [4] Review Jury  |                   |  Agents:           |
|  [5] E2E Test Plan|                   |  executor-01 [run]  |
|  [6] PR Action    |                   |  planner [run]      |
|  ...              |                   |                    |
|  -- Toggles --    |                   |  Activity Log:     |
|  [O] Loop         |                   |  [12:30] Index ok  |
|  [P] Parallel     |                   |  [12:31] Spawned   |
|                   |                   |                    |
+-------------------+-------------------+-------------------+
```

### Pane Components

**Actions Pane** -- [ref:.allhands/harness/src/tui/actions.ts:createActionsPane:e48fa30]
Renders agent spawn buttons, toggle switches, and control actions. All actions are always visible -- agents exit early if preconditions are not met. [ref:.allhands/harness/src/tui/actions.ts:buildActionItems:e48fa30] constructs the full item list; [ref:.allhands/harness/src/tui/actions.ts:getSelectableItems:e48fa30] filters to navigable items.

The complete action list:

| Key | Action | Description |
|-----|--------|-------------|
| 1 | Coordinator | Spawn coordinator agent |
| 2 | New Initiative | Spec type selection modal, routes to ideation |
| 3 | Planner | Spawn planner agent |
| 4 | Review Jury | Spawn review jury |
| 5 | E2E Test Plan | Spawn E2E test planner |
| 6 | PR Action | Create PR / Rerun PR Review (state-dependent label) |
| 7 | Address PR Review | Spawn PR review agent |
| 8 | Compound | Spawn compound operation |
| 9 | Complete | Mark spec as completed |
| 0 | Switch Workspace | Open spec selection modal |
| - | Custom Flow | Open flow selection modal |

Two toggles follow the action list:

| Key | Toggle | Description |
|-----|--------|-------------|
| O | Loop | Enable/disable the prompt execution loop |
| P | Parallel | Enable/disable multi-executor parallel mode |

**Prompts Pane** -- [ref:.allhands/harness/src/tui/prompts-pane.ts:createPromptsPane:e48fa30]
Displays all prompts sorted by status: in_progress first, then pending, then done. Each prompt shows its number, title, and status icon via [ref:.allhands/harness/src/tui/prompts-pane.ts:getStatusIcon:e48fa30]. Selecting a prompt opens the file viewer.

**Status Pane** -- [ref:.allhands/harness/src/tui/status-pane.ts:createStatusPane:e48fa30]
Shows the current spec, branch, base branch, active agents, and a scrolling activity log. [ref:.allhands/harness/src/tui/status-pane.ts:getSelectableItems:e48fa30] builds a navigable list of spec, alignment doc, E2E test plan, and running agents. [ref:.allhands/harness/src/tui/status-pane.ts:formatAgentStatus:e48fa30] renders each agent's running state.

## Navigation

The TUI uses vim-style keyboard navigation defined in the [ref:.allhands/harness/src/tui/index.ts:TUI:e48fa30] class:

| Key | Action |
|-----|--------|
| Tab / Shift-Tab | Cycle between panes |
| j / k | Navigate up/down within focused pane |
| u / d | Page up/down (10 items) |
| Space / Enter | Select current item |
| Escape | Close active modal or file viewer |
| x | Delete selected agent (status pane only) |
| 1-9, 0, - | Hotkeys for action items |
| O, P | Toggle Loop, Parallel |
| Q, R, V, C | Quit, Refresh, View Logs, Clear Logs |

Focused pane borders highlight in bright purple (`#a78bfa`); unfocused panes use muted purple (`#4A34C5`).

## Modals and File Viewer

[ref:.allhands/harness/src/tui/modal.ts:createModal:e48fa30] renders overlay modals with navigable item lists. Used for spec selection, log viewing, flow selection, and spec type selection (New Initiative). Supports optional `onClear` for deselection and `scrollable` mode for long content.

[ref:.allhands/harness/src/tui/file-viewer-modal.ts:createFileViewer:e48fa30] opens files in a read-only scrollable overlay. Used for viewing prompts, specs, alignment docs, and E2E test plans. [ref:.allhands/harness/src/tui/file-viewer-modal.ts:getPlanningFilePath:e48fa30] resolves planning artifacts by branch and type. [ref:.allhands/harness/src/tui/file-viewer-modal.ts:getSpecFilePath:e48fa30] locates spec files by ID.

## State Management

[ref:.allhands/harness/src/tui/index.ts:TUI:e48fa30] maintains a `TUIState` object tracking:
- **Toggle states**: `loopEnabled`, `parallelEnabled`
- **Prompt state**: Array of `PromptItem` with number, title, status, path
- **Agent state**: Array of `AgentInfo` with name, type, running status
- **Spec/branch context**: Current spec ID, branch name, base branch
- **PR workflow**: `PRActionState` progresses through `create-pr` -> `awaiting-review` -> `rerun-pr-review`
- **Custom flow counter**: Tracks custom flow window numbering

State updates flow through `updateState()` which rebuilds action items and triggers re-render.

## New Initiative Action

Selecting **New Initiative** (key `2`) opens a spec type selection modal presenting 6 types:

| Type | Description |
|------|-------------|
| milestone | Feature development with deep ideation |
| investigation | Debug / diagnose issues |
| optimization | Performance / efficiency work |
| refactor | Cleanup / tech debt |
| documentation | Coverage gaps |
| triage | External signal analysis |

On selection, the TUI dispatches a `new-initiative` action with the chosen `specType`. [ref:.allhands/harness/src/commands/tui.ts:handleAction:4eddba4] routes this through the ideation agent with an optional `flowOverride`:

- **Milestone** gets `null` flow override (uses the ideation agent's default profile flow)
- **All other types** get a scoping flow path resolved via [ref:.allhands/harness/src/commands/tui.ts:SCOPING_FLOW_MAP:4eddba4]

`SCOPING_FLOW_MAP` is exported as `Record<SpecType, string | null>`:

| SpecType | Flow File |
|----------|-----------|
| milestone | `null` (profile default) |
| investigation | `INVESTIGATION_SCOPING.md` |
| optimization | `OPTIMIZATION_SCOPING.md` |
| refactor | `REFACTOR_SCOPING.md` |
| documentation | `DOCUMENTATION_SCOPING.md` |
| triage | `TRIAGE_SCOPING.md` |

[ref:.allhands/harness/src/tui/actions.ts:buildActionItems:e48fa30] is exported for testability alongside `SCOPING_FLOW_MAP`.

## Uncommitted Changes Guards

Three actions check for a dirty working tree before proceeding:
- **create-pr** -- Warns that uncommitted changes will not be included in the PR
- **rerun-pr-review** -- Warns that uncommitted changes will not be included in the PR
- **mark-completed** -- Warns that uncommitted changes will not be included in the final push

All three use the shared `confirmProceedWithUncommittedChanges()` helper in [ref:.allhands/harness/src/commands/tui.ts:handleAction:4eddba4], which calls [ref:.allhands/harness/src/lib/git.ts:hasUncommittedChanges:4eddba4] and shows a confirmation modal via `tui.showConfirmation()`. The user can press Enter to proceed or Escape to cancel.

## Event Loop Integration

The TUI constructor starts an [ref:.allhands/harness/src/lib/event-loop.ts:EventLoop:4eddba4] instance that monitors external state. Callback bindings connect event loop events to TUI state:

- `onBranchChange` -- Updates branch/spec context and reloads prompts for the new planning directory
- `onAgentsChange` -- Updates the active agents display
- `onSpawnExecutor` -- Delegates to TUI options for executor spawning
- `onSpawnEmergentPlanning` -- Delegates to TUI options for hypothesis planner spawning (no prompt argument)
- `onPromptsChange` -- Updates prompt list and rebuilds action items
- `onPRReviewFeedback` -- Transitions PR action state and unlocks Review PR
- `onLoopStatus` -- Appends status messages to the activity log

## CLI Daemon Integration

When enabled in project settings (default: true), the TUI starts a [ref:.allhands/harness/src/lib/cli-daemon.ts:CLIDaemon:4eddba4] for fast hook execution. This eliminates Node.js startup overhead for every hook invocation during active development.

## Launch and Teardown

[ref:.allhands/harness/src/commands/tui.ts:launchTUI:4eddba4] initializes the TUI with the working directory, loads initial state from git branch and planning directory, and starts background indexing (semantic index, call graph, knowledge bases, doc validation).

[ref:.allhands/harness/src/commands/tui.ts:handleAction:4eddba4] dispatches TUI actions to their implementations: spawning agents via [ref:.allhands/harness/src/commands/tui.ts:spawnAgentsForAction:4eddba4], managing PR workflows, switching specs, and running compound operations.

On destroy, the TUI kills all spawned tmux windows (tracked by the session registry), stops the event loop and CLI daemon, clears session state, and restores stdout/stderr interceptors with a 100ms delay to catch deferred terminal output.

## Background Indexing

On startup, the TUI runs a non-blocking indexing pipeline:
1. Ensures the TLDR daemon is running
2. Builds or rebuilds the semantic index (branch-aware via [ref:.allhands/harness/src/lib/tldr.ts:needsSemanticRebuild:4eddba4])
3. Warms the call graph cache
4. Validates agent profiles via [ref:.allhands/harness/src/lib/opencode/profiles.ts:loadAllProfiles:1ca9f06]
5. Indexes knowledge bases (roadmap, docs) with incremental updates from git
6. Validates documentation references

All indexing errors are caught and logged to the activity pane -- they never crash the TUI.
