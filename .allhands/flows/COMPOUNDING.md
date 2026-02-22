<goal>
Extract learnings from completed specs to improve the harness, skills, and software validation practices. Per **Knowledge Compounding**, everything feeds forward - decisions, pivots, limitations, and realizations become persistent improvements.
</goal>

<constraints>
- MUST ask the engineer before modifying harness files
- MUST write compounding summary to `.planning/<spec>/compounding_summary.md`
- MUST write non-trivial solutions to `docs/solutions/<category>/`
- MUST add Implementation Reality section to spec in-place before completing
- NEVER set spec frontmatter `status` — spec lifecycle is engineer-controlled
- MUST interview engineer before finalizing compounding summary
- NEVER modify harness without first principle justification
- NEVER frame emergent prompt work as "scope creep" - per **Quality Engineering**, emergent work discovers valuable variants
</constraints>

## Context Gathering

Read these spec artifacts to understand what happened:

- Read the alignment doc at `.planning/<spec>/alignment.md`
- Read the spec doc at `.planning/<spec>/spec.md`
- Read all prompt files in `.planning/<spec>/prompts/`
- Run `git log --oneline` to review commit history for this branch

## Completion Assessment by Spec Type

Per **Frontier Models are Capable**, assess completion differently based on spec `type`:

- **Milestone** (or missing): Spec acceptance criteria met, all prompts complete, knowledge extraction thorough
- **Exploratory** (investigation, optimization, refactor, documentation, triage): Problem resolution assessed against original hypothesis, learnings extracted from experiment outcomes, unresolved questions documented for future work

## Signal Analysis

Identify patterns that indicate harness improvement opportunities:

**Prompt Signals**:

- Failed prompts (multiple attempts) → execution or planning issues
- Patch prompts → check `patches_prompts` field to find root cause
- Emergent refinement inclusions/exclusions → engineer intent signals
- Review prompt count → planning or review quality issues
- Blocker learnings in summaries → planning gaps that required engineer steering

**Tooling Signals**:

- Read ALL prompt files' `skills` frontmatter and acceptance criteria summaries - not just patches
- Cross-reference each prompt's summary (Limitations, Decisions, Learnings, Validation results) against the specific skills it used
- **Read every prompt's `## Validation Assessment` section** — these document curation-time confidence levels and gaps. Aggregate across prompts to identify systematic patterns: which domains consistently show low confidence? Which suites are referenced but never provide useful guidance?
- **Read executor annotations** in prompt summaries — these document execution-time pain-points and blockers. Cross-domain learnings that executors already applied to suite docs will appear in `git diff` files; prompt-specific learnings stay in summaries.
- **Check `git diff` files** — executors may have updated suite docs directly during execution (per threshold-based routing in PROMPT_TASK_EXECUTION). These changes are urgent signals that should be reviewed for quality and consistency.
- Build a per-tool impact map:
  - **Per skill**: What did it catch? What did it miss? Did limitations or decisions reveal guidance gaps?
  - **Per validation means**: What issues did it surface? What escaped to review? Did it produce false positives?

**Decision Signals**:

- Design decisions made given limitations
- Engineer rejections and preference overrides (the preference itself is a compoundable learning)
- Compromises between agentic suggestions and engineer preferences

**Emergent Work Signals**:

- Per **Quality Engineering**, emergent prompts are disposable extensions that discover which variants are valuable - they are not scope violations
- Non-goal matches in emergent work are "non-goal violations" (specific exclusion was breached), never "scope creep" (scope was not changed - emergent work extends by design)
- Reverted emergent work is expected quality control, not waste - per **Software is Cheap**, the cost of a revert is a valid cost of experimentation
- Track: which emergent work was kept vs reverted, and why - this reveals engineer quality preferences

## Memory Extraction

Per **Knowledge Compounding**, capture learnings as memories:

- Run `ah solutions search "<relevant terms>"` to check for existing similar memories before writing duplicates
- Write to `docs/memories.md`
- Format: `[Name] | [Domain] | [Source] | [Description]`
  - Domains: `planning`, `implementation`, `harness-tooling`, `ideation`
  - Sources: `user-steering`, `agent-inferred`
  - Description: 1-3 sentences of self-contained learning

### Memory Capture Categories

Ensure these categories are represented when signals exist:

- **Technical learnings**: Patterns, anti-patterns, and solutions discovered during implementation
- **Engineer preference memories**: When engineer overrides agent recommendation, capture the preference itself as a memory (the override is a signal of values and priorities)
- **Systemic validation signals**: When review catches issues that implementation missed, capture as a validation coverage gap
- **Harness behavior patterns**: Document specific thresholds, behaviors, and failure modes with concrete data - not just symptoms (e.g., "7 compaction continuations at >8 files touched" not just "context loss on long prompts")

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
- **Tag expansion**: Generate tags from anti-patterns, failed approaches, and adjacent search terms beyond the solution content - ask: "What would someone search for when about to hit this problem?"

### Cross-Reference Solutions

After all solutions are written, cross-reference related solutions:

- Run `ah solutions search` with terms from each new solution to find related solutions
- For solutions sharing components, tags, or thematic overlap: add "## Related" section with links
- Update existing similar solutions with cross-reference back to new solutions

## Spec Finalization

**MUST** update the original spec file in-place as a historical record. Per **Knowledge Compounding**, finalized specs become searchable via `ah knowledge docs search` - curate content for future retrieval value.

- Add `## Implementation Reality` section documenting:
  - What was actually implemented vs originally planned
  - How engineer desires evolved during implementation (decisions, pivots, additions)
  - Key technical decisions and their rationale
- Keep content concise and decision-focused - this is indexed knowledge, not an operational dump
- Preserve the original Goals and Non-Goals sections unmodified for contrast

## Harness Improvement Handling [LAST PHASE]

**Intentionally last** - complete all other compounding before diverting to harness work.

### Classify and Interview

Classify issues from Signal Analysis:

| Signal Pattern                      | Action                                 |
| ----------------------------------- | -------------------------------------- |
| Skill guidance gaps or inaccuracies | Update skill file inline with approval |
| Flow/command/hook/planning issues   | Structural - create spec               |

**MUST interview engineer before proceeding** - the compounding summary MUST NOT be finalized without engineer sign-off on classified issues:

- Present all classified issues together
- Walk through the per-tool impact map from Tooling Signals - for each skill used, highlight where prompt-level learnings (limitations, decisions, workarounds) apply back to the tool itself
- Ask about additional painpoints
- Validate against `.allhands/principles.md`

### Apply Changes

**Skill refinements** (inline with approval):

- Update skill body with learnings discovered during execution (new patterns, anti-patterns, missing reference material)
- Add or correct guidance that would have prevented prompt failures or engineer steering

**Structural changes** (flows, commands, hooks, planning):

- Present all detected structural issues to the engineer
- Ask which issues to include in a single harness improvement spec (multi-select)
- Per **Frontier Models are Capable**, assume all engineer-confirmed issues belong in one spec - don't force individual scoping
- Include the per-tool impact map as evidence in the spec
- **(A) Create spec** → Invoke `.allhands/flows/shared/CREATE_HARNESS_SPEC.md` with `domain_name: harness` and all selected issues
- **(B) Defer unselected** → Document in `docs/memories.md` under "Deferred Harness Improvements"

## Completion

Write `.planning/<spec>/compounding_summary.md`:

```markdown
# Compounding Summary

## Detected Issues

- [Patterns from patches, failures, feedback]

## Tooling Refinements

- [Skill file changes with rationale from prompt learnings]

## Flow Updates

- [Flow file adjustments]

## Memories Added

- [References to docs/memories.md entries]

## Solutions Documented

- [docs/solutions/<category>/<filename>.md - brief description]

## Engineer Feedback Addressed

- [Specific concerns resolved]
```

This flow is idempotent - if run again without new changes, detect no work needed and stop.
