<goal>
Review implementation for architectural compliance and system design quality. Per **Quality Engineering**, ensure changes align with established patterns and maintain proper component boundaries.
</goal>

<inputs>
- Git diff to base (implementation files)
- Alignment doc path (for architectural decisions)
</inputs>

<outputs>
- Architectural compliance assessment
- SOLID principle violations
- Component boundary issues
- Recommendations ordered by priority
</outputs>

<constraints>
- MUST use git diff to base for implementation review
- MUST compare against documented and implicit architecture
- MUST verify component boundaries are respected
</constraints>

## Context Gathering

- Run `ah git diff-base` to review all implementation changes
- Run `ah knowledge docs search "architecture"` for established patterns
- Read alignment doc for architectural decisions made during planning

## Architectural Analysis

### Component Relationships

| Check | Question |
|-------|----------|
| Dependency Direction | Do dependencies flow toward stable abstractions? |
| Circular Dependencies | Are there any import cycles introduced? |
| Layer Violations | Does UI import from data layer directly? |
| Boundary Crossing | Are module boundaries respected? |

### SOLID Principles

| Principle | Check |
|-----------|-------|
| Single Responsibility | Does each module/class have one reason to change? |
| Open/Closed | Can new behavior be added without modifying existing code? |
| Liskov Substitution | Are derived types truly substitutable? |
| Interface Segregation | Are interfaces minimal and focused? |
| Dependency Inversion | Do high-level modules depend on abstractions? |

### Pattern Compliance

For each changed file:
- Identify expected architectural patterns from existing codebase
- Compare implementation against those patterns
- Flag deviations that aren't justified in alignment doc

## Review Process

For each changed file:
- Map its role in the architecture (UI, service, data, infrastructure)
- Check import statements for dependency direction
- Verify naming follows established conventions
- Ensure abstraction level matches its layer

## Output Format

Return findings ordered by priority:

```
## Architecture Review

### P1 (Critical - Architectural Violations)
- [File]: [Violation] -> [Impact] -> [Fix]

### P2 (Important - Pattern Deviations)
- [File]: [Deviation] -> [Expected pattern] -> [Recommendation]

### P3 (Suggestions - Minor Improvements)
- [File]: [Observation] -> [Improvement opportunity]

## SOLID Analysis
- [Principle violations found with specific examples]

## Boundary Assessment
- [Component boundaries respected/violated]
- [Coupling concerns identified]

## Summary
- [Overall architectural health]
- [Key risks introduced]
```
