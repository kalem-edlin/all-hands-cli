<goal>
Process PR review feedback into actionable prompts. Per **Knowledge Compounding**, engineer decisions on what NOT to address are as important as what they accept.
</goal>

<constraints>
- MUST use gh CLI to read PR comments
- MUST document declined review items in alignment doc
- MUST create `type: review-fix` prompts for accepted items
</constraints>

## Context Gathering

- Run `gh pr view --comments` to read PR review comments
- Aggregate all feedback from reviewers

## Feedback Synthesis

- Read `.allhands/flows/shared/REVIEW_OPTIONS_BREAKDOWN.md` for structuring feedback
- Present actionable options to engineer
- Group by severity and effort

## Engineer Decision

- Present options and let engineer choose which to address
- Track both accepted AND declined items

## Decision Documentation

Per **Knowledge Compounding**, declined items matter for future context:
- Run `ah schema alignment` to review alignment doc structure
- Add declined review items to alignment doc (captures engineer's reasoning)
- This prevents future agents from re-suggesting rejected approaches

## Prompt Creation

For accepted items:
- Read `.allhands/flows/shared/PROMPT_TASKS_CURATION.md` for guidance
- Create `type: review-fix` prompts for each accepted item
- Include PR comment context in prompt body

## Completion

Stop once prompts created and alignment doc updated.