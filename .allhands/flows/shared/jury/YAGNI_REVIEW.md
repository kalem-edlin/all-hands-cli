<goal>
Review implementation for YAGNI (You Ain't Gonna Need It) violations. Per **Quality Engineering**, identify over-engineering that exceeds task requirements.
</goal>

<inputs>
- Git diff to base (implementation files)
- Alignment doc path (for engineer decisions)
- Prompts folder path (for task scope)
</inputs>

<outputs>
- YAGNI violations in implementation
- Simplification recommendations, ordered by priority
</outputs>

<constraints>
- MUST use git diff to base for implementation review
- MUST give leniency to explicit engineer decisions
- MUST still object to unnecessary complexity even post-planning decisions
- MUST distinguish agentic over-engineering from engineer-requested features
</constraints>

## Context Gathering

- Review all implementation changes from base branch
- Read prompt summaries for task scope
- Read alignment doc for engineer decisions
- Identify patch prompts and emergent prompts (post-planning decisions)

## YAGNI Detection in Implementation

Look for code that:

| Pattern | Description |
|---------|-------------|
| Beyond Scope | Implementation exceeds prompt tasks (note: `type: emergent` prompts explore extensions by design per **Quality Engineering** - YAGNI applies to implementation efficiency within the prompt, not to the emergent hypothesis itself) |
| Unused Code | Functions/classes not called anywhere |
| Over-Abstraction | Abstractions for single use cases |
| Feature Flags | Configuration for features not requested |
| Error Handling | Catching impossible error conditions |
| Premature Optimization | Performance work without proven need |
| Orphaned Artifacts | Files created but not wired into the system |
| Dead Exports | Functions exported but never imported |
| Defensive Overkill | Validation for scenarios that can't happen in internal code |

## Decision Source Tracking

| Source | Priority |
|--------|----------|
| Agentic over-reach | P1 - Agents often add unnecessary complexity |
| Post-planning engineer decision | P2 - Still offer perspective, lower priority |
| Original planning decision | P3 - Already reviewed, lowest priority |

## Review Process

For each implementation change:
- Was this in the prompt's task scope?
- Is this simpler than necessary?
- Does this exceed requirements?
- Who decided this (agent or engineer)?

## Output Format

Return findings ordered by priority:

```
## YAGNI Implementation Review

### P1 (Agentic Over-Engineering)
- [File]: [What's unnecessary] -> [What was actually needed] -> [Remove/simplify]

### P2 (Exceeds Post-Planning Decisions)
- [File]: [What was added] -> [Beyond what engineer clarified] -> [Consider removing]

### P3 (Worth Reconsidering)
- [File]: [Engineer-decided but still YAGNI perspective] -> [Alternative if desired]

## Summary
- [Lines of unnecessary code]
- [Complexity hotspots]
- [Simplification opportunities]
```