---
description: Protocol YAML structure defining reusable workflow steps with inputs, outputs, and protocol extension for debugging workflows that inherit from implementation.
---

# Protocol System

## Overview

Protocols standardize how agents execute workflows. Rather than embedding workflow logic in agent prompts or slash commands, protocols are standalone YAML files that define inputs, outputs, and numbered steps. Agents receive protocol invocations with specific inputs and follow the steps exactly. This separation means workflow logic can evolve independently of agent definitions, and the same agent can follow different protocols depending on the task.

## Key Decisions

**YAML format for machine and human readability**: Protocols use YAML because it's structured enough for programmatic parsing while remaining readable for humans editing workflows. The envoy CLI can load and validate protocols, ensuring step numbering and input/output definitions are consistent.

**Inputs and outputs as contracts**: Every protocol declares what it expects (inputs) and what it produces (outputs). This makes delegation explicit - the main agent knows exactly what to provide and what to expect back. Optional inputs have fallback behavior defined in steps.

**Protocol extension for specialized workflows**: The debugging protocol [ref:.claude/protocols/debugging.yaml::c15ff37] extends the implementation protocol [ref:.claude/protocols/implementation.yaml::c15ff37] rather than duplicating it. Extension means debugging inherits all implementation steps but can override specific ones (marked with step numbers like 6+, 6.1, 6.2) or add new ones. This prevents drift between related workflows.

**Step numbering for precise overrides**: Steps use numeric identifiers (1, 2, 3...) with decimal notation for inserted steps (6.1, 6.2) and plus notation for augmentations (6+). This allows extending protocols to surgically modify specific steps while leaving others intact.

**Gates as human checkpoints**: Protocols include blocking gates (block-plan-gate, block-prompt-testing-gate, block-prompt-variants-gate) where workflow pauses for human input. Gates return structured responses that direct subsequent workflow. This ensures humans stay in control at decision points without requiring constant interaction during routine steps.

## Patterns

**Discovery protocol pair**: The discovery protocol [ref:.claude/protocols/discovery.yaml::6607b05] handles feature requirement analysis. Specialists query documentation first, gather codebase context, then write approaches via envoy commands. The bug-discovery protocol [ref:.claude/protocols/bug-discovery.yaml::6607b05] extends this for bug investigation, adding compiler/linter checks and hypothesis-based approaches.

**Implementation protocol pair**: The implementation protocol handles prompt execution with worktree setup, iteration tracking, review cycles, and merge. The debugging protocol extends this for bug fixes, adding structured logging with DEBUG-TEMP markers that get cleaned up after fix validation.

**Variant handling**: Both discovery and implementation protocols support variants - alternative approaches or implementations for the same task. Variants execute in parallel, then a gate determines which becomes main (merged) versus alternative (preserved) versus discarded (archived). This enables exploring multiple solutions without sequential bottlenecks.

**Iteration tracking**: Implementation protocols track iteration counts and refinement reasons. Each walkthrough records whether it's initial, review-refinement, or testing-refinement. This history helps understand how a solution evolved and supports debugging if the fix later breaks.

## Use Cases

**Main agent delegates discovery**: The main agent calls envoy plan protocol discovery with specialist name and segment context. The specialist follows the protocol steps: query documentation, gather codebase context, write approaches. The specialist returns success confirmation; findings live in plan files.

**Main agent delegates implementation**: The main agent calls envoy plan protocol implementation (or debugging for debug prompts) with prompt number, variant, and feature branch. The specialist follows steps: read prompt, create worktree, implement, record walkthrough, get review, handle testing gate, handle variants gate, merge to feature branch.

**Debugging workflow with temp logging**: Debug prompts follow the debugging protocol which adds temp logging steps. The specialist implements logging with DEBUG-TEMP markers, hits a logging gate to get user feedback with logs, implements the fix, then cleanup-debug-logs removes all markers deterministically. This structured approach prevents debug code from persisting into production.

**Protocol extension for new workflow types**: If a new workflow type emerges (say, migration), it can extend implementation with migration-specific steps. The base protocol handles worktree setup, review, and merge; the extension handles migration-specific concerns like rollback plans or data validation.
