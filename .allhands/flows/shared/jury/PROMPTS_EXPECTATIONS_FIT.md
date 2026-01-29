<goal>
Review planning artifacts for engineer expectations fit. Per **Ideation First**, verify that prompts and alignment doc fully capture engineer desires from spec with no gaps or inconsistencies.
</goal>

<inputs>
- Alignment doc path
- Spec doc path
- Prompts folder path
</inputs>

<outputs>
- Review of expectations fit for planning artifacts
- Improvements needed (by prompt number / alignment doc section)
- Summary of expectation gaps, ordered by priority
</outputs>

<constraints>
- MUST treat spec doc engineer expectations as ground truth
- MUST identify inconsistencies between spec and planning artifacts
- MUST find holes missed during planning consolidation
</constraints>

## Context Gathering

- Read the spec doc for engineer expectations (ground truth)
- Read the alignment doc for planning decisions
- Read all prompts in the prompts folder

## Expectations Comparison

| Spec Element | Check |
|--------------|-------|
| Desires | Are they reflected in prompts? |
| Success Criteria | Do prompts collectively achieve them? |
| Concerns | Are they addressed in tasks? |
| Assumptions | Are they validated by prompt dependencies? |
| Open Questions | Were they resolved in alignment doc? |

## Inconsistency Detection

Look for:
- Spec desires not covered by any prompt
- Prompts that contradict spec expectations
- Alignment doc decisions that deviate from spec without explanation
- Holes in coverage (engineer expected X, nothing implements X)

## Review Process

For each spec expectation:
- Trace to prompts that address it
- Verify alignment doc documents any deviations
- Flag gaps where planning missed expectations

## Output Format

Return findings ordered by priority:

```
## Prompts Expectations Fit Review

### P1 (Missing Coverage)
- [Spec expectation]: [What was expected] -> [No prompt addresses this]

### P2 (Inconsistencies)
- [Spec expectation]: [What was expected] -> [Prompt X says Y instead]

### P3 (Clarification Needed)
- [Spec element]: [Ambiguous] -> [Prompts interpret as X, but could be Y]

## Summary
- [Total spec expectations reviewed]
- [Coverage percentage]
- [Critical gaps requiring planner attention]
```