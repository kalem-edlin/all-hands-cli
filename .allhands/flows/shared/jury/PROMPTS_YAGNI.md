<goal>
Review planning artifacts for YAGNI (You Ain't Gonna Need It) violations. Per **Quality Engineering**, identify over-engineering and unnecessary complexity that wastes effort.
</goal>

<inputs>
- Alignment doc path
- Prompts folder path
</inputs>

<outputs>
- YAGNI violations identified
- Recommendations for simplification, ordered by priority
</outputs>

<constraints>
- MUST give leniency to explicit engineer decisions
- MUST still offer YAGNI perspective even on engineer-decided items (lower priority)
- MUST distinguish agentic over-engineering from engineer-requested complexity
</constraints>

## Context Gathering

- Read alignment doc for engineer decisions and rationale
- Read all prompts in the prompts folder
- Identify which elements were engineer-decided vs. agent-proposed

## YAGNI Detection

Look for:

| Pattern | Description | Example |
|---------|-------------|---------|
| Premature Abstraction | Generalization before proven need | Helper class for one-time operation |
| Future-Proofing | Building for hypothetical requirements | Config for thing that won't change |
| Over-Configuration | Making unchanging things configurable | ENV var for hardcoded value |
| Defensive Complexity | Error handling for impossible scenarios | Null check on required param |
| Feature Creep | Scope beyond stated goals within planned prompts (note: `type: emergent` prompts and disposable variants are not feature creep per **Quality Engineering** - they discover which extensions are valuable) | "While we're here, let's add..." |
| Scope Bloat | 10+ files or 7+ tasks in single prompt | Split needed |

## Priority Weighting

| Source | Priority Treatment |
|--------|-------------------|
| Agent-proposed complexity | Higher priority (agents over-engineer) |
| Engineer-decided complexity | Lower priority (explicit awareness, but still offer perspective) |

This respects engineer decisions while still providing value.

## Review Process

For each prompt/alignment doc element:
- Is this necessary for stated goals?
- Could this be simpler?
- Is complexity justified by requirements?
- Was this engineer-decided or agent-proposed?

## Output Format

Return findings ordered by priority:

```
## YAGNI Review

### P1 (Agent-Proposed Over-Engineering)
- [Prompt X]: [What's unnecessary] -> [Simpler alternative]
- [Alignment decision Y]: [Why it's excessive] -> [Leaner approach]

### P2 (Questionable Complexity)
- [Element]: [What seems over-engineered] -> [Consider simplifying]

### P3 (Engineer-Decided, Worth Reconsidering)
- [Element]: [Engineer chose this, but YAGNI perspective suggests...] -> [Alternative if desired]

## Summary
- [Potential effort saved by simplification]
- [Scope reduction opportunities]
- [Complexity hotspots]
```