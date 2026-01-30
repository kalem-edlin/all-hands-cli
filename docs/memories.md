---
description: "Lightweight learnings from past sessions, searchable via `ah memories search`. Captures technical patterns, engineer preferences, and harness behavior discoveries."
---

# Memories

Per **Knowledge Compounding**, this file captures lightweight learnings from past sessions. For detailed technical solutions, see `docs/solutions/`.

| Name | Domain | Source | Description |
|------|--------|--------|-------------|
| Motivation-driven suite documentation | validation | user-steering | Engineer reversed detailed CLI command documentation in browser-automation suite after hands-on testing. Commands are discoverable via `--help`; validation suite value is teaching agents HOW TO THINK about using a tool, not replicating command references. |
| Stochastic terminology preference | planning | user-steering | Engineer chose "stochastic" over "heuristic" for the validation dimension taxonomy. Deterministic/stochastic is an established CS pair. All harness docs must use this terminology consistently. |
| blockTool output format mismatch (resolved) | harness-tooling | agent-inferred | `blockTool()` in `hooks/shared.ts` outputs `{ decision: 'block', reason }`. Hook-runner now handles both `{ continue: false }` and `{ decision: 'block' }` formats for `assertHookBlocked`. Fixed during compounding. |
| Dual validation path divergence | harness-tooling | agent-inferred | Before consolidation, [ref:hooks/validation.ts] and [ref:lib/schema.ts] had 4 behavioral divergences: (1) frontmatter regex trailing newline requirement, (2) hooks missing boolean/date/object type branches, (3) return type shape differences, (4) schema.fields fallback behavior. Consolidation in Jury Review resolved all 4 by delegating hooks to lib. |
| validation-tools path resolution | harness-tooling | agent-inferred | `validation-tools list` resolves file paths relative to source code (`__dirname`), not the working directory. Fixture-based testing cannot simulate empty validation directories — use invariant tests (structure, types) instead. |
| Array item-type validation gap | harness-tooling | agent-inferred | Schema enforcement for array fields originally only checked `Array.isArray(value)` without validating item types against `items` specification. `tools: [123]` would pass when `items: string`. Fixed in both [ref:hooks/validation.ts] and [ref:lib/schema.ts]. |
| Pre-existing test failures baseline | validation | agent-inferred | 10 pre-existing test failures persisted throughout the spec: spec `branch` field validation, search-router hook contracts, command timeout. Confirmed identical across all prompts via `git stash` comparison. These are not regressions from this spec. |
| Emergent testing compounds value | implementation | agent-inferred | 5 emergent prompts (06-10) were all kept, producing 147 new tests for previously untested infrastructure. Prompt 10 divergence documentation directly enabled Jury Review dual-path consolidation. Emergent work chains (06→07→10, 08→09) compound — each builds on discoveries from prior. |
| TypeScript unit testing suite gap | validation | agent-inferred | No TypeScript unit testing validation suite exists for the harness. Flagged by Prompt 06 for CREATE_VALIDATION_TOOLING follow-up. Tests were written manually without suite guidance. |
| ENV credential guidance declined | planning | user-steering | Engineer chose not to add secret-sourcing guidance to browser-automation.md ENV Configuration section. ENV docs document variables and their purpose, not how to securely source credentials. |
