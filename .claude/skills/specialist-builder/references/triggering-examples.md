# Agent Triggering Examples

Guide to writing effective `<example>` blocks in agent descriptions for reliable triggering.

## Example Block Format (Compressed)

Use ONE `<example>` block with `|` separating trigger phrase variants:

```markdown
description: |
  [Role description with trigger keywords].

  <example>
  user: "trigger1 | trigger2 | trigger3"
  </example>
```

### Key Rules

| Rule | Do | Don't |
|------|-----|-------|
| Example blocks | ONE per agent | Multiple blocks |
| Trigger phrases | Separate with `|` | Separate blocks |
| Context/commentary | Omit (description conveys) | Include verbose explanations |
| Assistant lines | Omit | Include response lines |

## Trigger Types

Include multiple trigger types in your `|` separated list:

### Explicit + Proactive + Implicit

```markdown
description: |
  Security specialist for vulnerability scanning and security audits.

  <example>
  user: "Check for security vulnerabilities | I've added database queries | This code handles sensitive data"
  </example>
```

- **Explicit**: "Check for security vulnerabilities" (direct request)
- **Proactive**: "I've added database queries" (triggers review after risky code)
- **Implicit**: "This code handles sensitive data" (implies need without asking)

## Phrasing Variants

Combine phrasings in ONE example with `|`:

```markdown
<example>
user: "Review my code | Can you check my implementation? | Look over my changes"
</example>
```

## How Many Triggers?

| Count | Coverage |
|-------|----------|
| 2-3 (minimum) | Explicit + variation |
| 3-5 (recommended) | Explicit + implicit + proactive |
| 6+ (avoid) | Makes description too long |

## Common Mistakes

### Using Multiple Example Blocks

```markdown
<!-- BAD - multiple blocks -->
<example>
user: "Review my code"
</example>
<example>
user: "Check my implementation"
</example>

<!-- GOOD - one block with variants -->
<example>
user: "Review my code | Check my implementation"
</example>
```

### Including Context/Commentary

```markdown
<!-- BAD - verbose format -->
<example>
Context: User requests review
user: "Check my changes"
<commentary>
Review request triggers agent.
</commentary>
</example>

<!-- GOOD - compressed -->
<example>
user: "Check my changes"
</example>
```

### Including Assistant Lines

```markdown
<!-- BAD -->
<example>
user: "Review my code"
assistant: "I'll use the code-reviewer agent."
</example>

<!-- GOOD -->
<example>
user: "Review my code"
</example>
```

## Template Library

### Code Review Agent

```markdown
description: |
  Use when code needs quality review, security check, or best practices validation.

  <example>
  user: "Review my code | Can you check my implementation? | I've added the user registration feature"
  </example>
```

### Test Generation Agent

```markdown
description: |
  Use when tests need to be created for new or existing code.

  <example>
  user: "Generate tests for my code | I've added the data processing functions | We need better test coverage"
  </example>
```

## Debugging Triggering Issues

| Problem | Check | Fix |
|---------|-------|-----|
| Agent not triggering | Triggers include relevant keywords? | Add more variant phrasings with `\|` |
| Triggers too often | Triggers too broad? | Make trigger phrases more specific |
| Triggers wrong scenarios | Triggers match intended use? | Revise trigger phrases |

## Best Practices Summary

**DO:**
- Use ONE `<example>` block per agent
- Separate triggers with `|`
- Include 3-5 trigger variants
- Mix explicit + proactive + implicit triggers
- Keep description concise

**DON'T:**
- Use multiple `<example>` blocks
- Include Context or `<commentary>`
- Include assistant response lines
- Use generic triggers
- Exceed 6 trigger variants
