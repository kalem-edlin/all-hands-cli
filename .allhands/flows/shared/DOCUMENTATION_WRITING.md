<goal>
Write knowledge-base docs - capture decisions, rationale, patterns. Per **Context is Precious**, zero inline code, multiple focused files per subdomain (RAG-optimized).
</goal>

<inputs>
```yaml
domain: "<product-name>"
feature: "<feature-name>"  # cross-cutting feature this covers
doc_directory: "docs/<domain>/<feature>/"
source_directories: ["<paths>"]  # may span commands/, lib/, hooks/ for same feature
critical_technologies: ["<tech>"]
target_file_count: 1-2
notes: "<guidance>"
```
</inputs>

<outputs>
```yaml
success: true
files_created: ["docs/domain/subdomain/file1.md", ...]
coverage_gaps: []  # report any gaps
```
</outputs>

<constraints>
- MUST use `ah docs format-reference` for ALL refs
- MUST include `description` front-matter
- MUST cover ALL `source_directories` (may span multiple source paths for one feature)
- MUST cover ALL `critical_technologies`
- MUST NOT commit (taxonomist commits after all writers)
- MUST NOT create directories (taxonomist pre-creates)
- MUST NOT write README.md
- NEVER write inline code blocks
- NEVER duplicate docs for same feature across different source paths
- NEVER pad sections with hollow content just to match a template
</constraints>

## Philosophy

- Docs = KNOWLEDGE, not API coverage
- Explain WHY, not WHAT (code shows what)
- Zero inline code - every mention is a reference
- Concise > verbose - drop articles, use fragments
- Feature = unit of documentation (not source path)
- Quality > completeness - one rich doc beats many thin ones
- Value > template - omit sections with nothing meaningful to say

## What to Document

| Focus | Write |
|-------|-------|
| Design decisions | Why choices made, tradeoffs |
| Rationale | How things work and why |
| Patterns | With refs to canonical examples |
| Critical tech | Why chosen, how used |
| Use cases | Engineer-facing scenarios |

## What NOT to Document

- Capability tables (command/option lists)
- API surface coverage
- Inline code snippets
- Info obvious from reading code
- Folder structure diagrams

## Reference System

All code mentions use refs. No exceptions.

### Option A: Deferred Formatting (Recommended for Speed)

Write placeholder refs while drafting, then finalize:

```markdown
The service handles indexing via [ref:lib/knowledge.ts:KnowledgeService].
```

After writing, run `ah docs finalize <doc-path>` to:
- Batch process all placeholder refs
- Add git hashes to each ref
- Report any invalid symbols/files

This is much faster than formatting refs one-by-one during writing.

### Option B: Immediate Formatting

```bash
# Symbol reference (TS, Python, Go, etc.)
ah docs format-reference <file> <symbol>
# Output: [ref:path/file.ts:symbolName:abc1234]

# File-only reference (YAML, JSON, configs)
ah docs format-reference <file>
# Output: [ref:path/file.yaml::abc1234]
```

### Reference Rules

- NEVER use placeholder hashes in final docs (abc1234, 0000000)
- If `symbol_not_found`: retry without symbol
- If `uncommitted_file`: STOP and report

## Write Mode

### Steps

1. **Check existing docs**
   - Run `ah knowledge docs search "<domain> <subdomain>" --metadata-only`
   - Extend existing, don't duplicate

2. **Analyze sources for KNOWLEDGE**
   - Read `source_directories`
   - Find design decisions, rationale
   - Note `critical_technologies` usage

3. **Plan file breakdown**
   - 1-2 comprehensive docs per feature subdomain (prefer fewer, richer files)
   - Each doc answers specific question types about the feature
   - Source directories may span lib/, commands/, hooks/ - unify into feature docs
   - Map critical tech to relevant docs

4. **Write focused files**
   - Use `ah docs format-reference` for ALL refs
   - Focus on WHY and HOW
   - Zero code blocks

5. **Verify coverage**
   - Every source_directory has docs
   - Every critical_technology documented
   - File count meets target

## File Structure

**Front-matter (required):**
```yaml
---
description: 1-2 sentence summary for semantic search
---
```

**Sections (use as needed):**
```markdown
# Topic Name

## Overview
Why this exists, what problem it solves.

## Key Decisions
- Decision 1: Why this approach [ref:...]
- Decision 2: Tradeoffs considered [ref:...]

## Patterns
How to work with this (only if needed).

## Use Cases
- Scenario 1: Real usage at product level
- Scenario 2: Another real scenario

## Gotchas
Common mistakes, edge cases, things that surprise people.
```

**Section Guidance:**
- Omit sections that would be empty or add no value
- One valuable paragraph > four hollow sections
- Every doc MUST answer at least one of:
  - WHY was this approach chosen? (decisions, tradeoffs)
  - WHAT patterns should engineers follow? (with refs to examples)
  - HOW do components interact? (architecture, data flow)

## File Naming

- Descriptive kebab-case: `state-management.md`, `api-integration.md`
- Name indicates what questions file answers
- NEVER: `README.md` (taxonomist writes these)
- NEVER: `docs/domain/index.md` (only `docs/domain/subdomain/index.md` allowed)

## Example Breakdown

For a `semantic-search` feature spanning `commands/knowledge.ts`, `lib/semantic-search/`, `lib/embeddings/`:
- `architecture.md` - how indexing, embeddings, and query systems connect
- `query-patterns.md` - how to search effectively, ranking decisions
- `indexing-strategy.md` - when/how content gets indexed

For a `notifications` feature spanning `commands/notify.ts`, `lib/notifications/`, `hooks/on-complete/`:
- `delivery-system.md` - how notifications reach users
- `hook-integration.md` - lifecycle events that trigger notifications

## Fix Mode

For input `mode: "fix"` with `stale_refs` and `invalid_refs`:

1. **Stale refs:** Get updated hash via `ah docs format-reference`, update
2. **Invalid refs:**
   - Symbol renamed → update symbol name
   - File moved → update path
   - Deleted → remove ref, update prose
