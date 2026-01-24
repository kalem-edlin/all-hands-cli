<goal>
Analyze spec for user flow completeness without prescribing implementation. Per **Ideation First**, specs capture intent - this validates intent coverage, not implementation detail.
</goal>

<inputs>
- Spec doc path
</inputs>

<outputs>
- User flow overview (what the spec enables)
- Gap identification (what's missing or ambiguous)
- Clarifying questions for engineer
</outputs>

<constraints>
- MUST respect spec as intent document, not requirements doc
- MUST keep analysis high-level (user-observable, not implementation)
- MUST ask, not prescribe - engineer decides what to address
- NEVER add implementation details to spec
</constraints>

## Flow Discovery

Read the spec and identify:

### Primary User Journeys

| Element | Extract |
|---------|---------|
| User types | Who are the actors? (end users, admins, systems) |
| Entry points | How do users start this flow? |
| Goals | What are users trying to accomplish? |
| Exit conditions | How do users know they're done? |
| Success criteria | What defines a successful outcome? |

### Implicit Flows

Look for unstated but necessary flows:
- Error recovery paths
- Edge cases mentioned in concerns
- Dependencies on other features
- State transitions implied by descriptions

## Gap Analysis

For each discovered flow, check:

| Dimension | Question |
|-----------|----------|
| Entry | How does user start this? Is it clear? |
| Happy Path | Is the main success path defined? |
| Error States | What if things go wrong? |
| Edge Cases | First-time user? Concurrent access? Partial completion? |
| Exit | How does user know they succeeded? |

### Gap Categories

| Category | Description |
|----------|-------------|
| Missing Flow | A necessary journey not mentioned |
| Ambiguous Transition | Unclear what happens between states |
| Undefined Error | No guidance on failure handling |
| Scope Boundary | Unclear where this feature ends |

## Output Format

Present findings as questions, not mandates:

```
## User Flows Identified

### Flow 1: [Name]
- **Actor**: [Who]
- **Goal**: [What they want]
- **Path**: [High-level steps]
- **Success**: [How they know it worked]

### Flow 2: [Name]
...

## Gaps Found

### Missing Flows
- [Gap]: [Why it matters] → **Question**: [What should happen?]

### Ambiguities
- [Unclear element]: [What's ambiguous] → **Question**: [Clarify X or Y?]

### Error Handling
- [Scenario]: [What could fail] → **Question**: [How should user recover?]

## Clarifying Questions

Prioritized by impact:

### Critical (blocks understanding)
1. [Question that must be answered]

### Important (affects scope)
2. [Question that clarifies boundaries]

### Nice-to-have (edge cases)
3. [Question about rare scenarios]

## Recommendations

Based on analysis:
- [Suggestion for spec improvement]
- [Area that may need more ideation]
```

## Completion

Per **Ideation First**, present gaps as questions and let engineer decide:
- Which gaps to address in this spec
- Which gaps to leave for planning phase
- Which gaps are out of scope

Do not modify the spec directly - present findings and await engineer direction.
