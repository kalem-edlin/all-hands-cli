<goal>
Build an E2E test plan that convinces the engineer of milestone implementation efficacy. Per **Agentic Validation Tooling**, because engineers are excluded from prompt-by-prompt validation, one comprehensive E2E test plan demonstrates the milestone works as expected.
</goal>

<inputs>
- Alignment doc path
- E2E test plan output path
</inputs>

<outputs>
- E2E test plan document at specified output path
</outputs>

<constraints>
- MUST prioritize product-focused, end-user experience tests over internal validation
- MUST reference existing validation suites where applicable
- NEVER create a test plan without reading the alignment doc first
</constraints>

## Context Gathering

- Read the alignment doc for top-level goal, objectives, acceptance criteria, and prompt execution summaries
- Review changed files from base branch (careful with information overload on full diffs)
- Run `ah validation-tools list` to see available validation suites
- Investigate validation tooling methods used in prompts and their consequences on E2E product flows

## E2E Test Plan Structure

### Primary Test Flow (Core)

Design the most critical test flow:
- Target end-user experience and product-focused scenarios
- Cover areas where changes are focused
- Include regression paths that may have been affected
- Surface edge-case behavior within actual product functionality

This is the most important section - the engineer's confidence depends on it.

### Secondary Validation (Supplementary)

Supplement the main flow with secondary methods from prompt-level validation:
- Specific test invocations agents ran during implementation
- CLI args for targeted validation
- Profiling tool usage
- Read `.allhands/flows/shared/UTILIZE_VALIDATION_TOOLING.md` for suite selection guidance

These demonstrate what agents verified but are less critical than the primary flow.

## Completion

Write the E2E test plan to the E2E Test Plan Output Path.