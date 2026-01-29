<goal>
Generate diverse hypotheses that compound alignment doc goals through iterative refinement and creative exploration. Per **Quality Engineering**, emergent work discovers which variants, improvements, and extensions are valuable—not just what was explicitly requested.
</goal>

<constraints>
- MUST spawn subtask for validation tooling discovery before creating prompt
- MUST spawn subtask for validation review after implementation
- MUST create non-overlapping hypothesis that doesn't conflict with prior prompts
- MUST use your **assigned prompt number** (from spawn message) when creating prompt file
- MUST set prompt `type: emergent` in frontmatter
- MUST include work type in prompt summary for subsequent agent awareness
- MUST commit work only after passing validation review
- NEVER frame work as "percentage complete"—emergent work compounds indefinitely
- NEVER stop because a work mode seems "done"—each mode feeds the others
</constraints>

<inputs>
- `Alignment doc`: Path to alignment doc with goals and prior prompt summaries
- `Prompts folder`: Directory where prompt files live
- `Assigned prompt number`: Your prompt number (use this when creating your prompt file)
- `Hypothesis domains`: List of allowed work types for this workflow (provided in spawn message)
</inputs>

## Step 1: Context Gathering

Emergent refinement compares **current state** (what exists) to **desired state** (what could exist):
- **Current state**: Codebase implementation, prior prompt summaries, test coverage, gaps
- **Evolved state**: Next valuable iteration (not a fixed target—per **Knowledge Compounding**, each iteration compounds indefinitely)

Your hypothesis bridges this gap.

- Read the alignment doc for:
  - Top-level goals, objectives, acceptance criteria
  - Prior prompt summaries—note work types tried and gaps remaining
- Search for relevant learnings: `ah memories search <hypothesis terms>` to gather prior spec insights
- Formulate hypothesis: implementation approach → intended outcome
- Select work type from provided domains, diversifying from prior prompts
- Verify hypothesis uniqueness via `ah knowledge docs search <query>`

**Work mode selection** (not sequential—revisit as needed):
1. **Core Consolidation** - Testing, stability, error handling. Return here when other modes reveal gaps.
2. **Adjacent Improvements** - Tangentially related enhancements that may expose new core needs.
3. **Novel Experiments** - Creative extensions (behind feature flags) that stress-test assumptions.

Check prior prompt summaries to diversify work modes. Adjacent/novel work often compounds back into core insights.

## Step 2: Validation Tooling Discovery (REQUIRED)

Spawn subtask:
```
Read `.allhands/flows/shared/UTILIZE_VALIDATION_TOOLING.md` and return validation suites for: [your hypothesis and intended files/domains]
```

Use returned `validation_suites` to inform acceptance criteria.

## Step 3: Create Prompt File

- Create prompt file in prompts folder following `.allhands/flows/shared/PROMPT_TASKS_CURATION.md`
  - Filename: `{ASSIGNED_NUMBER}-emergent-{short-title}.prompt.md`
  - Set `type: emergent` in frontmatter
  - Set `number: {ASSIGNED_NUMBER}` in frontmatter
  - Add discovered suites to `validation_suites` frontmatter
  - Target 2-5 tasks per prompt
- If tangential hypothesis: implement behind feature flag and document toggle

## Step 4: Execute Tasks

- Follow tasks in your prompt file
- Handle deviations: fix bugs and document, block on architectural changes

## Step 5: Validation Review (REQUIRED)

Spawn subtask:
```
Read `.allhands/flows/shared/PROMPT_VALIDATION_REVIEW.md` and validate prompt {ASSIGNED_NUMBER} with these validation results: [your results]
```

Act on feedback until it passes. If at attempt > 2 with real limitations, communicate compromises.

## Step 6: Completion

**CRITICAL: Follow this exact order.**

1. Run `ah schema prompt` for summary format
2. Append SUCCESS/FAILURE SUMMARY to prompt file:
   - Include **Work Type**: {your work type}
   - Include hypothesis and outcome
   - Include files affected and validation results
3. Append summary to alignment doc's "## Prompt Summaries" section
   - Include work type so subsequent agents can diversify
4. Commit all changes (implementation only - alignment and prompt files are NOT git tracked)
5. Set frontmatter `status: done` (MUST be after commit)
6. Rename prompt file to include `-DONE` suffix
7. Stop

**Note**: Alignment files and prompt files are NOT git tracked. Only commit implementation changes. Do not mention prompts or prompt numbers in commit messages.
