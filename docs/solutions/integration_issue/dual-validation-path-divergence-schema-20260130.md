---
description: "Documents how hooks/validation.ts and lib/schema.ts had 4 behavioral divergences in schema validation, and how consolidation by delegating hooks to lib resolved all divergences."
title: "Dual validation path divergence between hooks/validation.ts and lib/schema.ts"
date: "2026-01-30"
milestone: "feature/validation-tooling-practice"
problem_type: integration_issue
component: "schema-validation"
symptoms:
  - "Frontmatter accepted by hooks but rejected by lib (or vice versa)"
  - "Boolean/date/object fields silently pass hooks validation without type checking"
  - "extractFrontmatter returns null for content without trailing newline after closing ---"
  - "Different error shapes between validation paths (ValidationResult vs ValidationError[])"
root_cause: incomplete_implementation
severity: high
tags:
  - "schema"
  - "validation"
  - "divergence"
  - "consolidation"
  - "hooks"
  - "dual-path"
  - "frontmatter"
  - "type-checking"
  - "deduplication"
source: agent-inferred
---

# Dual Validation Path Divergence — Schema Enforcement

## Problem

Two independent implementations of schema validation existed in the harness:
- [ref:lib/schema.ts] — the canonical validation library with 7 type branches, caching, and `ValidationResult` return type
- [ref:hooks/validation.ts] — the hook enforcement layer with its own `parseFrontmatter`, `loadSchema`, and `validateFrontmatter` implementations

These paths diverged in 4 specific ways, discovered via stability tests in Prompt 10:

1. **Frontmatter regex**: lib requires trailing newline after closing `---`; hooks does not
2. **Type branch coverage**: hooks handles string/integer/enum/array but NOT boolean/date/object — these silently pass
3. **Return type shape**: lib returns `{ valid, errors }`, hooks returns `ValidationError[]`
4. **schema.fields fallback**: lib uses `schema.frontmatter || schema.fields || {}`; hooks returns empty array if `!schema.frontmatter`

## Investigation

- Prompt 04: Added array item-type validation to BOTH paths (first indication of duplication)
- Prompt 06: Unit tests for [ref:lib/schema.ts] revealed comprehensive type branch coverage
- Prompt 07: Integration tests for hooks revealed the `blockTool` format mismatch (separate issue) and hook behavior
- Prompt 10: Deliberately documented all 4 divergences with paired tests showing each path's behavior on identical input

## Solution

Jury Review item #8: Refactored [ref:hooks/validation.ts] to import and delegate to [ref:lib/schema.ts] for `loadSchema`, `extractFrontmatter`, and `validateFrontmatter`. Removed local `SchemaDefinition`, `ValidationError` types, and all local validation functions. This eliminated all 4 divergences in one consolidation.

Jury Review item #9 extended this to [ref:commands/validation-tools.ts], replacing its local `extractFrontmatter` with the lib import.

Prompt 11 (PR review fix) completed consolidation by replacing the manual `Array.isArray` guard in `listValidationSuites()` with `validateFrontmatter()` delegation.

## Prevention

- Schema validation should have a single source of truth ([ref:lib/schema.ts]). Other modules import, never reimplement.
- When adding new validation logic (like array item-type checking), the need to update multiple files is a code smell indicating duplication.
- Stability tests that document divergences between parallel implementations create a consolidation roadmap.

## Related

- See `docs/solutions/integration_issue/blocktool-output-format-mismatch-hook-runner-20260130.md` for the separate hook-runner assertion issue discovered during the same investigation chain.
