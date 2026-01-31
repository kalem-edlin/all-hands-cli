---
description: "Documents how blockTool() outputs { decision: 'block' } but hook-runner assertHookBlocked expects { continue: false }, requiring raw JSON assertions for PostToolUse tests."
title: "blockTool() output format mismatch with hook-runner assertHookBlocked helper"
date: "2026-01-30"
milestone: "feature/validation-tooling-practice"
problem_type: integration_issue
component: "hook-runner"
symptoms:
  - "assertHookBlocked assertion fails on PostToolUse hooks that correctly block"
  - "Hook blocks tool but test assertion reports allowed"
  - "PostToolUse test needs raw JSON inspection instead of helper assertions"
root_cause: wrong_api_usage
severity: medium
tags:
  - "blocktool"
  - "hook-runner"
  - "post-tool-use"
  - "assertion"
  - "test-harness"
  - "format-mismatch"
  - "integration-testing"
source: agent-inferred
---

# blockTool Output Format Mismatch — Hook Runner

## Problem

The `blockTool()` helper in [ref:hooks/shared.ts] outputs `{ decision: 'block', reason: '...' }` for PostToolUse hooks. However, the hook-runner test harness's `assertHookBlocked` helper expects `{ continue: false }`. This means PostToolUse block assertions fail even when the hook correctly blocks the tool.

Discovered in Prompt 07 (attempt 2) when writing integration tests for the `schema` PostToolUse validation hook.

## Investigation

Used `assertHookBlocked(result)` — the standard helper for verifying hook blocking behavior. This checks for `{ continue: false }` in the parsed output, which `blockTool()` does not produce. Required 3 attempts on Prompt 07 to work around this.

## Solution

Assert directly against the raw JSON output:
```typescript
expect(result.json.decision).toBe('block');
```

This bypasses the `assertHookBlocked` helper and checks the actual output format that `blockTool()` produces.

## Prevention

The hook-runner assertion helpers should be updated to handle both PostToolUse output formats (`{ decision: 'block' }` and `{ continue: false }`), or `blockTool()` should be updated to output the format the helpers expect. This is a known harness inconsistency tracked in memories.

## Related

- See `docs/solutions/integration_issue/dual-validation-path-divergence-schema-20260130.md` for the broader consolidation context that led to this discovery.
