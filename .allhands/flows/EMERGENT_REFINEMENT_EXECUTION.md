<goal>
Create a hypothesis of implementation that iteratively solves, improves, or converges on alignment doc goals. Per **Prompt Files as Units of Work**, implement and document the hypothesis as a self-contained unit.
</goal>

<constraints>
- MUST create non-overlapping hypothesis that doesn't conflict with prior prompts
- MUST set prompt `type: emergent` in frontmatter
- MUST commit work only after passing validation
</constraints>

## Context Gathering

- Read the alignment doc for top-level goal, objectives, acceptance criteria, and prior prompt summaries
- Formulate a non-overlapping hypothesis of implementation → intended outcome
- Verify hypothesis doesn't conflict with prior work:
  - Read relevant prompt files and check their code references if relevant
  - Run `ah knowledge search <query>` for documented features
  - Check recently changed files on this branch
- If more context is needed, run `ah solutions search "<keywords>"` for relevant past solutions

## Implementation

- Create a new prompt file following `.allhands/flows/shared/PROMPT_TASKS_CURATION.md`
  - Use next available number
  - Set `type: emergent` in frontmatter
- Follow tasks and break into Todos if necessary
- Use validation tooling to acquire test data meeting acceptance criteria

### Deviation Handling

Handle deviations automatically:
- Bugs, missing critical functionality, blocking issues → Fix and document in summary
- Architectural changes → Stop, document blocker in prompt, set `status: blocked`

## Validation

- Spawn subtask to read `.allhands/flows/shared/PROMPT_VALIDATION_REVIEW.md` and follow its instructions
- Act on feedback until it passes
- If at prompt attempt > 2 with real limitations, communicate compromises - reviewer may still reject

## Completion

- Commit your work
- Run `ah schema prompt` for success/failure summary format
- Append summary to prompt file
  - Include deviations handled during implementation
  - If blockers required engineer steering, document as learnings to prevent recurrence
- Set frontmatter `status: done`
- Rename prompt file to include `-DONE` suffix
- Stop