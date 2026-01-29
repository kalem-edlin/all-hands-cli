---
description: "Terminal UI built on blessed providing a three-pane layout for agent orchestration: actions pane for spawning agents and toggling modes, prompts pane for tracking prompt status, and status pane for monitoring active agents and planning artifacts."
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
|  [2] Ideation     |  > 02: Task B     |  Branch: feat/api   |
|  [3] Planner      |  - 03: Task C     |                    |
|  [4] E2E Test     |                   |  Agents:           |
|  [5] Review Jury  |                   |  executor-01 [run]  |
|  ...              |                   |  planner [run]      |
|  -- Toggles --    |                   |                    |
|  [O] Loop         |                   |  Activity Log:     |
|  [E] Emergent     |                   |  [12:30] Index ok  |
|  [P] Parallel     |                   |  [12:31] Spawned   |
|                   |                   |                    |
+-------------------+-------------------+-------------------+
```

### Pane Components

**Actions Pane** -- [ref:.allhands/harness/src/tui/actions.ts:createActionsPane:79b9873]
Renders agent spawn buttons, toggle switches, and control actions. Items are conditionally visible based on state: planner requires a spec, E2E test and review jury require completed prompts, PR actions follow a state machine, and mark-completed only appears after compound runs. [ref:.allhands/harness/src/tui/actions.ts:buildActionItems:79b9873] constructs the item list; [ref:.allhands/harness/src/tui/actions.ts:getSelectableItems:79b9873] filters to navigable items.

**Prompts Pane** -- [ref:.allhands/harness/src/tui/prompts-pane.ts:createPromptsPane:79b9873]
Displays all prompts sorted by status: in_progress first, then pending, then done. Each prompt shows its number, title, and status icon via [ref:.allhands/harness/src/tui/prompts-pane.ts:getStatusIcon:79b9873]. Selecting a prompt opens the file viewer.

**Status Pane** -- [ref:.allhands/harness/src/tui/status-pane.ts:createStatusPane:79b9873]
Shows the current spec, branch, base branch, active agents, and a scrolling activity log. [ref:.allhands/harness/src/tui/status-pane.ts:getSelectableItems:79b9873] builds a navigable list of spec, alignment doc, E2E test plan, and running agents. [ref:.allhands/harness/src/tui/status-pane.ts:formatAgentStatus:79b9873] renders each agent's running state.

## Navigation

The TUI uses vim-style keyboard navigation defined in the [ref:.allhands/harness/src/tui/index.ts:TUI:79b9873] class:

| Key | Action |
|-----|--------|
| Tab / Shift-Tab | Cycle between panes |
| j / k | Navigate up/down within focused pane |
| u / d | Page up/down (10 items) |
| Space / Enter | Select current item |
| Escape | Close active modal or file viewer |
| x | Delete selected agent (status pane only) |
| 1-9, 0, - | Hotkeys for action items |
| O, E, P | Toggle Loop, Emergent, Parallel |
| Q, R, V, C | Quit, Refresh, View Logs, Clear Logs |

Focused pane borders highlight in bright purple (`#a78bfa`); unfocused panes use muted purple (`#4A34C5`).

## Modals and File Viewer

[ref:.allhands/harness/src/tui/modal.ts:createModal:79b9873] renders overlay modals with navigable item lists. Used for spec selection, log viewing, and flow selection. Supports optional `onClear` for deselection and `scrollable` mode for long content.

[ref:.allhands/harness/src/tui/file-viewer-modal.ts:createFileViewer:79b9873] opens files in a read-only scrollable overlay. Used for viewing prompts, specs, alignment docs, and E2E test plans. [ref:.allhands/harness/src/tui/file-viewer-modal.ts:getPlanningFilePath:79b9873] resolves planning artifacts by branch and type. [ref:.allhands/harness/src/tui/file-viewer-modal.ts:getSpecFilePath:79b9873] locates spec files by ID.

## State Management

[ref:.allhands/harness/src/tui/index.ts:TUI:79b9873] maintains a `TUIState` object tracking:
- **Toggle states**: `loopEnabled`, `emergentEnabled`, `parallelEnabled`
- **Prompt state**: Array of `PromptItem` with number, title, status, path
- **Agent state**: Array of `AgentInfo` with name, type, running status
- **Spec/branch context**: Current spec ID, branch name, base branch
- **PR workflow**: `PRActionState` progresses through `create-pr` -> `awaiting-review` -> `rerun-pr-review`
- **Compound tracking**: `compoundRun` flag gates the mark-completed action

State updates flow through `updateState()` which rebuilds action items and triggers re-render.

## Event Loop Integration

The TUI constructor starts an [ref:.allhands/harness/src/lib/event-loop.ts:EventLoop:79b9873] instance that monitors external state. Callback bindings connect event loop events to TUI state:

- `onBranchChange` -- Updates branch/spec context and reloads prompts for the new planning directory
- `onAgentsChange` -- Updates the active agents display
- `onSpawnExecutor` / `onSpawnEmergent` -- Delegates to TUI options for agent spawning
- `onPromptsChange` -- Updates prompt list and rebuilds action items
- `onPRReviewFeedback` -- Transitions PR action state and unlocks Review PR
- `onLoopStatus` -- Appends status messages to the activity log

## CLI Daemon Integration

When enabled in project settings (default: true), the TUI starts a [ref:.allhands/harness/src/lib/cli-daemon.ts:CLIDaemon:79b9873] for fast hook execution. This eliminates Node.js startup overhead for every hook invocation during active development.

## Launch and Teardown

[ref:.allhands/harness/src/commands/tui.ts:launchTUI:79b9873] initializes the TUI with the working directory, loads initial state from git branch and planning directory, and starts background indexing (semantic index, call graph, knowledge bases, doc validation).

[ref:.allhands/harness/src/commands/tui.ts:handleAction:79b9873] dispatches TUI actions to their implementations: spawning agents via [ref:.allhands/harness/src/commands/tui.ts:spawnAgentsForAction:79b9873], managing PR workflows, switching specs, and running compound operations.

On destroy, the TUI kills all spawned tmux windows (tracked by the session registry), stops the event loop and CLI daemon, clears session state, and restores stdout/stderr interceptors with a 100ms delay to catch deferred terminal output.

## Background Indexing

On startup, the TUI runs a non-blocking indexing pipeline:
1. Ensures the TLDR daemon is running
2. Builds or rebuilds the semantic index (branch-aware via [ref:.allhands/harness/src/lib/tldr.ts:needsSemanticRebuild:79b9873])
3. Warms the call graph cache
4. Validates agent profiles via [ref:.allhands/harness/src/lib/opencode/profiles.ts:loadAllProfiles:1ca9f06]
5. Indexes knowledge bases (roadmap, docs) with incremental updates from git
6. Validates documentation references

All indexing errors are caught and logged to the activity pane -- they never crash the TUI.
