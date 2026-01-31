---
title: "[ref:] anchors silently go stale in skill reference docs"
date: "2026-01-31"
milestone: refactor/harness-maintenance-skill
problem_type: agentic_issue
component: harness-maintenance-skill
symptoms:
  - "[ref:] anchors added to skill reference docs with git hashes"
  - "ah docs validate reports frontmatter errors on skill reference files"
  - "Git hashes in [ref:] anchors become stale after any source file change"
  - "ah docs finalize cannot resolve directory-level [ref:] anchors"
root_cause: wrong_api_usage
severity: medium
tags:
  - ref-anchors
  - docs-validate
  - docs-finalize
  - skill-references
  - stale-metadata
  - harness-maintenance
  - scope-limitation
  - context-is-precious
source: agent-inferred
---

## Problem

During the harness-maintenance skill restructure, an agent added `[ref:]` code reference anchors (with git hashes) to `core-architecture.md` (6 anchors) and `tools-commands-mcp-hooks.md` (10 occurrences). These anchors are designed to be validated by `ah docs validate` and finalized by `ah docs finalize`.

The problem: both `ah docs validate` and `ah docs finalize` are scoped to the `docs/` directory only (hardcoded default in `harness/src/commands/docs.ts`). Skill reference docs live in `.allhands/skills/*/references/`, which is outside the docs tooling scope. The anchors were:
- Never validated automatically
- Contained git hashes that would silently go stale on any source file change
- Created false confidence that references were current
- Added noise to files loaded every agent session (violating Context is Precious)

## Investigation

1. Agent ran `ah docs validate --path .allhands/skills/harness-maintenance/references/ --json` — it processed the files but reported frontmatter validation errors (skill references don't have standard doc frontmatter)
2. Agent ran `ah docs finalize` — it resolved 9 file-level anchors to hashed refs but failed on 8 directory-level anchors (directories don't have git blob hashes)
3. The partial success masked the fundamental issue: even "finalized" anchors would go stale because no automated pipeline re-validates skill reference docs

## Solution

Engineer directed stripping all `[ref:]` anchors and reverting to plain-text backtick paths:
- 6 anchors stripped from `core-architecture.md`
- 10 anchors stripped from `tools-commands-mcp-hooks.md`
- Scope guard added to SKILL.md maintainer checklist: "NEVER run `ah docs validate`/`finalize` on skill references — those commands are scoped to `docs/` only"

Plain backtick paths (`\`.allhands/harness/src/cli.ts\``) are more readable and don't create false freshness guarantees.

## Prevention

- **Scope guard**: The harness-maintenance SKILL.md maintainer checklist now explicitly prohibits running docs-validate/finalize on skill references
- **Rule of thumb**: Only use `[ref:]` anchors in files under `docs/` where the docs pipeline automatically validates and re-finalizes them
- **Broader principle**: Never embed metadata that requires external tooling validation in files outside that tooling's scope — the metadata will silently rot
