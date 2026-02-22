<goal>
Execute prompt tasks with full context, validate thoroughly, and document your work. Per **Prompt Files as Units of Work**, the prompt IS the task - complete it as a self-contained unit.
</goal>

<constraints>
- MUST read prompt file and alignment doc before implementation
- MUST pass validation before committing
- MUST append summary to prompt file on completion
- MUST document validation pain-points via threshold-based routing (see Validation Learnings Documentation)
</constraints>

## Context Gathering

- Read the prompt file for tasks and acceptance criteria
  - If FAILURE SUMMARY sections exist, adapt to their redirections / learnings
- Read the alignment doc for milestone context, prior prompt summaries, and key decisions
  - Read any relevant dependency prompt files
- Only if additional context is needed (likely not needed):
  - Run `ah knowledge docs search <descriptive_query>` for codebase information as needed
  - Run `ah solutions search "<keywords>"` for relevant past solutions

## Implementation

- Follow tasks and break them down into Todos if necessary

### Deviation Handling

Per **Frontier Models are Capable**, handle deviations automatically without engineer steering:

| Deviation Type                                                            | Action                                          |
| ------------------------------------------------------------------------- | ----------------------------------------------- |
| Bugs/errors                                                               | Fix immediately, document in summary            |
| Missing critical functionality (validation, error handling, security)     | Add immediately, document in summary            |
| Blocking issues (missing deps, broken imports, config errors)             | Fix to unblock, document in summary             |
| Architectural changes (new DB tables, major schema changes, new services) | Stop and document in prompt - requires planning |

If architectural deviation is needed, document the blocker and set `status: blocked` rather than proceeding.

### Threshold-Based Routing

Apply this routing for every validation learning, pain-point, blocker, or non-obvious pattern discovered during execution:

| Signal                       | Destination               | Criteria                                                                                                                  |
| ---------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Cross-domain learning**    | Update skill doc directly | Would this help future agents in different prompts/domains? (e.g., a missing command, incorrect flag, better ENV pattern) |
| **Prompt-specific learning** | Annotate prompt summary   | Relevant only to this task's context? (e.g., specific edge case behavior, one-off workaround)                             |

**Cross-domain examples** (update the suite):

- A missing ENV variable or setup step that any executor would hit
- A better pattern for running tests that supersedes what the suite documents
- A gap in the decision tree that caused wasted exploration time

**Prompt-specific examples** (annotate the summary):

- An endpoint returned unexpected data for this specific test case
- A workaround needed for this feature's particular data shape
- Timing-dependent behavior specific to this implementation

When in doubt about which destination, prefer updating the suite — improvements there compound for all future executors. Suite updates should be included in the same commit as implementation changes.

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
