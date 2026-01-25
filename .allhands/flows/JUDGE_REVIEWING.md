<goal>
Orchestrate a jury of specialized reviewers to judge implementation against planning files and spec. Per **Quality Engineering**, the question is "which variant is best?" - reviewers identify issues, engineer chooses which to address.
</goal>

<inputs>
- Alignment doc path
- Spec doc path
- Prompts folder path
</inputs>

<constraints>
- MUST spawn parallel jury subtasks for comprehensive review
- MUST present engineer with actionable options, not mandates
- MUST create `type: review-fix` prompts for accepted fixes
</constraints>

## Context Gathering

Read these files to understand what's being reviewed:
- Read the alignment doc
- Read the spec doc
- Run `ls <prompts_folder_path>` to see all prompts

## Jury Orchestration

Spawn parallel review subtasks, providing each with alignment doc, spec doc, and prompts folder paths:

### Domain Best Practices
For each domain touched by implementation:
- Spawn subtask to read `.allhands/flows/shared/jury/BEST_PRACTICES_REVIEW.md`
- Domains include: expo/react-native, trpc/serverless, database/drizzle/supabase, web/tanstack/nextjs, dev tooling, CI/CD
- Each covers performance, security, and code quality best practices

### Expectations Fit
- Spawn subtask to read `.allhands/flows/shared/jury/EXPECTATIONS_FIT_REVIEW.md`
- Ensures alignment doc + prompts document engineer decisions and fit original spec expectations

### Security
- Spawn subtask to read `.allhands/flows/shared/jury/SECURITY_REVIEW.md`
- Ensures implementation doesn't introduce security risks

### YAGNI
- Spawn subtask to read `.allhands/flows/shared/jury/YAGNI_REVIEW.md`
- Ensures implementation avoids over-engineering and unnecessary complexity

### Maintainability
- Spawn subtask to read `.allhands/flows/shared/jury/MAINTAINABILITY_REVIEW.md`
- Identifies agentic anti-patterns, simplification opportunities, LOC reduction

### Architecture
- Spawn subtask to read `.allhands/flows/shared/jury/ARCHITECTURE_REVIEW.md`
- Verifies SOLID principles, component boundaries, pattern compliance

### Claim Verification
- Spawn subtask to read `.allhands/flows/shared/jury/CLAIM_VERIFICATION_REVIEW.md`
- Verifies factual claims in prompts/alignment against actual codebase state

## Feedback Synthesis

After all jury subtasks complete:
- Read `.allhands/flows/shared/REVIEW_OPTIONS_BREAKDOWN.md` to structure feedback
- Break down findings into actionable options for the engineer
- Present options with tradeoffs, not mandates

### Issue Severity Classification

| Severity | Description |
|----------|-------------|
| Blocking | Prevents goal achievement - missing wiring, broken functionality |
| Recommended | Should fix - best practice violations, potential issues |
| Optional | Nice to have - style improvements, minor enhancements |

## Engineer Decision

Present synthesized feedback to engineer:
- Group by severity (blocking, recommended, optional)
- Let engineer choose which issues to address
- Per **Quality Engineering**, engineer effort goes to quality control of variants

## Prompt Creation

For accepted fixes:
- Read `.allhands/flows/shared/PROMPT_TASKS_CURATION.md` for prompt creation guidance
- Create `type: review-fix` prompts for each accepted issue
- Include review context and specific fix requirements in prompt body