---
name: spec-branching
domain_name: infrastructure
status: roadmap
dependencies: []
branch: fix/spec-branching
---

# Fix: Consolidate Branch Change State Updates in TUI

## Motivation

The TUI's branch-change handling had a race condition pattern: individual `this.state.*` property mutations followed by separate render and event-loop sync calls. When a branch change triggered spec, prompt, and loop-state updates, these fired as discrete mutations rather than a single atomic state transition. This caused redundant renders and potential UI flicker as intermediate states became visible.

The `updateState` method already exists to batch state changes and trigger a single render pass, but the `onBranchChange` callback and the `branch-changed` action handler both bypassed it with direct property assignments.

## Goals

- Consolidate all branch-change state mutations into a single `updateState` call
- Remove the redundant `branch-changed` action handler in `tui.ts` (the `onBranchChange` callback already handles the logic)
- Eliminate manual `buildActionItems` and `render` calls that `updateState` handles automatically
- Ensure event-loop toggle sync happens via `updateState` reactivity rather than manual calls

## Non-Goals

- Changing branch-change detection logic
- Modifying the spec resolution or planning directory lookup behavior
- Altering the event loop or agent spawning mechanics

## Technical Considerations

- Two files affected: `.allhands/harness/src/tui/index.ts` and `.allhands/harness/src/commands/tui.ts`
- The `branch-changed` action case in `handleAction` is dead code once `onBranchChange` uses `updateState` directly — safe to remove
- `updateState` already calls `buildActionItems` and `render`, so removing those manual calls is safe
