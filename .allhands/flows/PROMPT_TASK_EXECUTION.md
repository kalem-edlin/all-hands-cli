<goal>
Execute prompt tasks with full context, validate thoroughly, and document your work. Per **Prompt Files as Units of Work**, the prompt IS the task - complete it as a self-contained unit.
</goal>

<constraints>
- MUST read prompt file and alignment doc before implementation
- MUST pass validation before committing
- MUST append summary to prompt file on completion
- NEVER commit without passing validation review
</constraints>

## Context Gathering

- Read the prompt file for tasks and acceptance criteria
  - If FAILURE SUMMARY sections exist, adapt to their redirections / learnings
- Read the alignment doc for milestone context, prior prompt summaries, and key decisions
  - Read any relevant dependency prompt files
- Only if additional context is needed (likely not needed):
  - Run `ah knowledge docs search <descriptive_query>` for codebase information as needed
  - Run `ah solutions search "<keywords>"` for relevant past solutions
  - Run `ah memories search "<keywords>"` for relevant learnings and engineer preferences

## Implementation

- Follow tasks and break them down into Todos if necessary
- After implementation,
  - Read `validation_suites` frontmatter entries. During implementation, follow the **Stochastic Validation** section for exploratory validation — use model intuition to probe edge cases, test user flows, and verify quality beyond what deterministic checks cover.
  - Use validation tooling to acquire test data meeting acceptance criteria

### Deviation Handling

Per **Frontier Models are Capable**, handle deviations automatically without engineer steering:

| Deviation Type | Action |
|----------------|--------|
| Bugs/errors | Fix immediately, document in summary |
| Missing critical functionality (validation, error handling, security) | Add immediately, document in summary |
| Blocking issues (missing deps, broken imports, config errors) | Fix to unblock, document in summary |
| Architectural changes (new DB tables, major schema changes, new services) | Stop and document in prompt - requires planning |

If architectural deviation is needed, document the blocker and set `status: blocked` rather than proceeding.

## Validation

- Acceptance criteria validation uses the **Deterministic Integration** section of referenced suites — these are binary pass/fail commands that gate completion. Stochastic exploration during implementation informs quality but does not replace deterministic acceptance criteria.
- Spawn subtask to read `.allhands/flows/shared/PROMPT_VALIDATION_REVIEW.md` and follow its instructions
  - Include validation results and `validation_suites` file paths in subtask inputs
- Act on feedback until it passes
- If at prompt attempt > 2 with real limitations, communicate compromises - reviewer may still reject

## Completion

**CRITICAL: Follow this exact order to prevent race conditions with parallel agents.**

1. Run `ah schema prompt` for summary format
2. Append success summary to prompt file
   - Include any deviations handled during implementation
   - If blockers required engineer steering, document as learnings to prevent recurrence
3. Run `ah schema alignment body` for alignment doc summary format
4. Append prompt summary to alignment doc's "## Prompt Summaries" section
   - Per **Knowledge Compounding**, this enables other agents to see completed work without reading each prompt
   - If section doesn't exist, create it
5. Commit all changes (implementation only - alignment and prompt files are NOT git tracked)
6. Set frontmatter `status: done` - **MUST be after summaries are written**
7. Rename prompt file to include `-DONE` suffix
8. Stop

**Note**: Alignment files and prompt files are NOT git tracked. Only commit implementation changes. Do not mention prompts or prompt numbers in commit messages.