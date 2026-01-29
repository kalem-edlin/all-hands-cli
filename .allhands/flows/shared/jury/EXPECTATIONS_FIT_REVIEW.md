<goal>
Review implementation for engineer expectations fit. Per **Ideation First**, verify that implementation honors the desires, concerns, and decisions captured during ideation and planning.
</goal>

<inputs>
- Alignment doc path
- Spec doc path
</inputs>

<outputs>
- Critical review of expectations fit
- Improvements needed to better match expectations
- Summary of expectation violations, ordered by priority
</outputs>

<constraints>
- MUST read both spec doc and alignment doc completely
- MUST account for all engineer decisions in alignment doc
- MUST verify implementation against original ideation desires
</constraints>

## Context Gathering

- Read the spec doc for original engineer expectations, desires, and success criteria
- Read the alignment doc for planning decisions and engineer interjections
- Identify implementation files changed from base branch
- Read select prompts for detailed implementation context where necessary

## Expectations Extraction

From spec doc:
- Engineer desires and expectations
- Success criteria defined
- Concerns raised during ideation
- Guiding principles synthesized

From alignment doc:
- Planning decisions made
- Engineer-specific interjections
- Compromises documented
- Scope adjustments

## Review Process

Compare implementation against expectations:

| Check | Question |
|-------|----------|
| Desires | Are engineer's stated desires implemented? |
| Success Criteria | Does implementation meet defined success criteria? |
| Concerns | Were engineer's concerns addressed? |
| Decisions | Are planning decisions honored? |
| Scope | Does implementation match agreed scope? |
| Goal Achievement | Does implementation achieve goals or just complete tasks? |

Per **Quality Engineering**, task completion ≠ goal achievement. Verify implementation is substantive and connected, not placeholder-heavy.

## Output Format

Return findings ordered by priority:

```
## Expectations Fit Review

### P1 (Expectation Gaps)
- [Expectation]: [What was expected] -> [What was implemented] -> [Gap]

### P2 (Partial Fit)
- [Expectation]: [What was expected] -> [What was implemented] -> [What's missing]

### P3 (Minor Deviations)
- [Expectation]: [What was expected] -> [What was implemented] -> [Deviation]

## Summary
- [Total expectations reviewed]
- [Fit percentage]
- [Critical gaps requiring engineer attention]
```