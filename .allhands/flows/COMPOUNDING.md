<goal>
Extract learnings from completed specs to improve the harness, skills, and validation tooling. Per **Knowledge Compounding**, everything feeds forward - decisions, pivots, limitations, and realizations become persistent improvements.
</goal>

<constraints>
- MUST ask the engineer before modifying harness files
- MUST write compounding summary to `.planning/<spec>/compounding_summary.md`
- MUST write non-trivial solutions to `docs/solutions/<category>/`
- NEVER modify harness without first principle justification
</constraints>

## Context Gathering

Read these spec artifacts to understand what happened:
- Read the alignment doc at `.planning/<spec>/alignment.md`
- Read the spec doc at `.planning/<spec>/spec.md`
- Read all prompt files in `.planning/<spec>/prompts/`
- Run `git log --oneline` to review commit history for this branch

## Signal Analysis

Identify patterns that indicate harness improvement opportunities:

**Prompt Signals**:
- Failed prompts (multiple attempts) → execution or planning issues
- Patch prompts → check `patches_prompts` field to find root cause
- Emergent refinement inclusions/exclusions → engineer intent signals
- Review prompt count → planning or review quality issues
- Blocker learnings in summaries → planning gaps that required engineer steering

**Tooling Signals**:
- Cross-reference patch prompts with their `skills` and `validation_suites` frontmatter
- Identify skills that led to bad guidance
- Identify validation suites that missed issues

**Decision Signals**:
- Design decisions made given limitations
- Engineer rejections and frustrations
- Compromises between agentic suggestions and engineer preferences

## Memory Extraction

Per **Knowledge Compounding**, capture learnings as memories:
- Write to `.allhands/memories.md`
- Format: `[Name] | [Domain] | [Source] | [Description]`
  - Domains: `planning`, `validation`, `implementation`, `harness-tooling`, `ideation`
  - Sources: `user-steering`, `agent-inferred`
  - Description: 1-3 sentences of self-contained learning

## Solution Documentation

Per **Knowledge Compounding**, document non-trivial solved problems for institutional knowledge.

### Identify Documentable Solutions

From the signal analysis, identify problems that:
- Required multiple investigation attempts
- Had non-obvious solutions
- Would benefit future sessions (similar issues likely to recur)
- Involve agentic anti-patterns (hallucinations, duplications, miscommunications)

Skip documentation for:
- Simple typos or obvious syntax errors
- Trivial fixes immediately resolved
- One-off environment issues

### Write Solution Files

For each documentable solution:
- Run `ah schema solution` for frontmatter and body section format
- Determine `problem_type` and corresponding category directory
- Generate filename: `<sanitized-symptom>-<component>-<YYYYMMDD>.md`
- Create directory if needed: `mkdir -p docs/solutions/<category>`
- Write solution file following schema

### Cross-Reference

If similar solutions exist in `docs/solutions/`:
- Add "Related" section with links to similar solutions
- Update existing similar solutions with cross-reference back

## Spec Finalization

Update the spec as a historical record:
- Amend expectations based on implementation reality
- Document decisions and their rationale
- Capture what changed and why

## Harness Improvement Handling [LAST PHASE]

**Intentionally last** - complete all other compounding before diverting to harness work.

### Classify and Interview

Classify issues from Signal Analysis:

| Signal Pattern | Action |
|----------------|--------|
| Skills/validation issues | Small fix - inline with approval |
| Flow/command/hook/planning issues | Structural - create spec |

Interview engineer:
- Present classified issues
- Ask about additional painpoints
- Validate against `.allhands/principles.md`

### Apply Changes

**Small fixes**: Make approved skill/validation changes inline.

**Structural changes**: Present options to engineer:
- **(A) Create spec** → Invoke `.allhands/flows/shared/CREATE_HARNESS_SPEC.md` with `domain_name: harness`
- **(B) Defer** → Document in `.allhands/memories.md` under "Deferred Harness Improvements"

## Completion

Write `.planning/<spec>/compounding_summary.md`:
```markdown
# Compounding Summary

## Detected Issues
- [Patterns from patches, failures, feedback]

## Tooling Fixes
- [Skill file changes]
- [Validation suite changes]

## Flow Updates
- [Flow file adjustments]

## Memories Added
- [References to .allhands/memories.md entries]

## Solutions Documented
- [docs/solutions/<category>/<filename>.md - brief description]

## Engineer Feedback Addressed
- [Specific concerns resolved]
```

This flow is idempotent - if run again without new changes, detect no work needed and stop.
