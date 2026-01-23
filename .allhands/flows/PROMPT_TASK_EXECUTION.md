<goal>
Execute prompt tasks with full context, validate thoroughly, and document your work.
</goal>

## Context Gathering
- Read the prompt file which includes your tasks and acceptance criteria
  - If FAILURE SUMMARY sections exist - adapt to its redirections / learnings
- Read the alignment doc for milestone context, prior prompt summaries, and key decisions
  - Read any relevant prompt files (likely your dependencies)
- Use `ah knowledge search <query>` for codebase information as needed

## Implementation
- Follow tasks and break them down into Todos if necessary
- After implementation, use validation tooling to acquire test data / information that meets acceptance criteria convincingly

## Validation
- Spin up a sub task to read `.allhands/flows/PROMPT_VALIDATION_REVIEW.md` and follow its instructions
  - Act on feedback until it passes
  - If at prompt attempt > 2 with real limitations, communicate compromises to adjust perspective - it may still reject

## Completion
- Once passed validation, commit your work
- Run `ah schema prompt body` for the success/failure summary formats and append your entry to the prompt file
- Stop