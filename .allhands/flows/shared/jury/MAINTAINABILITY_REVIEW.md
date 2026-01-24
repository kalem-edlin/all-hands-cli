<goal>
Review implementation for maintainability, code simplicity, and agentic anti-patterns. Per **Frontier Models are Capable**, identify hallucinations, duplications, and inter-prompt miscommunications. Per **Quality Engineering**, estimate simplification opportunities with LOC reduction.
</goal>

<inputs>
- Git diff to base (implementation files)
</inputs>

<outputs>
- Areas for improvement, ordered by priority
- Simplification recommendations with before/after
- LOC reduction estimates
- Complexity score assessment
- Agentic issues detected
</outputs>

<constraints>
- MUST use git diff to base for implementation review
- MUST compare against established codebase patterns
- MUST identify agentic-specific anti-patterns
</constraints>

## Context Gathering

- Review all implementation changes from base branch
- Run `ah knowledge docs search "architecture"` for established patterns
- Run `ah knowledge docs search "conventions"` for codebase standards

## Agentic Anti-Patterns to Detect

| Pattern | Description |
|---------|-------------|
| **Hallucination** | Imports that don't exist, APIs used incorrectly, made-up patterns |
| **Duplication** | Re-implementing existing utilities, duplicate logic across prompts |
| **Miscommunication** | Prompt A establishes pattern, Prompt B ignores it |
| **Inconsistency** | Different approaches for same problem in different files |
| **Over-abstraction** | Unnecessary wrappers, premature generalization |
| **Orphaned Artifacts** | Files created but never imported or connected |

## Design Quality Checks

| Check | Question |
|-------|----------|
| Composability | Can components be reused independently? |
| Naming | Are names descriptive and consistent? |
| Structure | Does organization follow codebase conventions? |
| Readability | Is the code self-documenting? |
| Simplicity | Is this the simplest solution that works? |

## Simplification Analysis

For each file, identify:
- **Unnecessary complexity** - Logic that could be simpler
- **Redundant code** - Duplicate checks, repeated patterns
- **Over-engineering** - Abstractions for single use cases
- **Dead code** - Unused functions, unreachable branches

Estimate LOC reduction for each simplification opportunity.

## Review Process

For each changed file:
- Compare against similar existing code
- Identify deviations from established patterns
- Flag probable agentic issues
- Note design inefficiencies
- Estimate simplification potential (LOC)

## Output Format

Return findings ordered by priority:

```
## Maintainability Review

### P1 (Critical)
- [File:lines]: [Issue] -> [Impact] -> [Fix]

### P2 (Important)
- [File:lines]: [Issue] -> [Impact] -> [Fix]

### P3 (Polish)
- [File:lines]: [Issue] -> [Impact] -> [Fix]

## Simplification Recommendations

### 1. [Most impactful simplification]
- **File**: [path:lines]
- **Current**: [Brief description of current approach]
- **Proposed**: [Simpler alternative]
- **LOC reduction**: ~X lines

### 2. [Next simplification]
...

## Agentic Issues Detected

| Type | Count | Examples |
|------|-------|----------|
| Hallucinations | X | [Brief examples of made-up APIs/patterns] |
| Duplications | X | [Brief examples of redundant code] |
| Miscommunications | X | [Brief examples of inter-prompt conflicts] |

## Complexity Assessment

- **Total LOC added**: X
- **Potential LOC reduction**: ~Y (Z%)
- **Complexity score**: [High/Medium/Low]
- **Recommendation**: [Proceed as-is / Minor simplifications / Significant refactoring needed]
```