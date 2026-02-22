<goal>
Process PR review feedback into actionable prompts. Per **Knowledge Compounding**, engineer decisions on what NOT to address are as important as what they accept.
</goal>

<constraints>
- MUST use gh CLI to read PR comments
- MUST use gh CLI to check workflow run status
- MUST document declined review items in alignment doc
- MUST create `type: review-fix` prompts for accepted items
- MUST create `type: ci-fix` prompts for workflow failures
</constraints>

## Context Gathering

- Run `gh pr view --comments` to read PR review comments
- Aggregate all feedback from reviewers

## CI/CD Run Review

Check GitHub Actions workflow runs for the PR to catch failures early:

- Run `gh pr checks` to list all check statuses for the PR
- For any failed checks, run `gh run view <run-id> --log-failed` to get failure logs
- Categorize failures by workflow source:
  - **CI (`ci.yml`)**: lint errors, typecheck failures, test-api failures, test-engine failures
  - **PR Preview (`pr-preview.yml`)**: DB branch provisioning failures, Vercel preview deployment failures, migration push failures, IaaC configuration failures
  - **Deploy DB (`deploy-db.yml`)**: production migration failures (post-merge only)
- For each failure, identify root cause from the logs (e.g., a broken test assertion, a type error introduced by the PR, a misconfigured environment variable, a Supabase branch provisioning timeout)
- Present failures alongside review feedback in the Feedback Synthesis step

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

For accepted review items:
- Read `.allhands/flows/shared/PROMPT_TASKS_CURATION.md` for guidance
- Create `type: review-fix` prompts for each accepted item
- Include PR comment context in prompt body

For CI/CD failures:
- Create `type: ci-fix` prompts for each workflow failure
- Include the failed job name, step name, and relevant log output in prompt body
- Reference the specific workflow file (e.g., `.github/workflows/ci.yml`) so the fixing agent has context on the pipeline structure
- For test failures: include the failing test name and assertion error
- For infrastructure failures (DB provisioning, Vercel deploy): include the error output and relevant environment context

## Completion

Stop once prompts created (review-fix and ci-fix) and alignment doc updated.