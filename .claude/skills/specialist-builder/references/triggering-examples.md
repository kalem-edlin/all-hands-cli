# Agent Triggering Examples

Guide to writing effective `<example>` blocks in agent descriptions for reliable triggering.

## Example Block Anatomy

```markdown
<example>
Context: [Describe the situation - what led to this interaction]
user: "[Exact user message or request]"
assistant: "[How Claude should respond before triggering]"
<commentary>
[Explanation of why this agent should be triggered]
</commentary>
assistant: "[How Claude triggers the agent - 'I'll use the [agent-name] agent...']"
</example>
```

### Components

| Component | Purpose | Good | Bad |
|-----------|---------|------|-----|
| Context | Set the scene | "User just implemented auth feature" | "User needs help" |
| user | Exact triggering phrase | "Review my code for issues" | (omitted) |
| assistant | Response before trigger | "I'll analyze your implementation" | (omitted) |
| commentary | Explain WHY agent triggers | "Code review request matches expertise" | (omitted) |

## Example Types

### Type 1: Explicit Request

User directly asks for what the agent does:

```markdown
<example>
Context: User explicitly requests security analysis
user: "Check my code for security vulnerabilities"
assistant: "I'll use the security-analyzer agent to perform a thorough security review."
<commentary>
Direct security analysis request triggers the security-analyzer agent.
</commentary>
</example>
```

### Type 2: Proactive Triggering

Agent triggers after relevant work without explicit request:

```markdown
<example>
Context: User just implemented database queries
user: "I've added the user search functionality"
assistant: "Great! Let me review it for security."
<commentary>
Database code written. Proactively trigger security-analyzer to check
for SQL injection and other database security issues.
</commentary>
assistant: "I'll use the security-analyzer agent to check the database code."
</example>
```

### Type 3: Implicit Request

User implies need without stating it directly:

```markdown
<example>
Context: User mentions code is hard to understand
user: "This code is confusing and hard to follow"
assistant: "I can help improve the code clarity."
<commentary>
User indicates complexity issues. Trigger code-simplifier agent to refactor.
</commentary>
assistant: "I'll use the code-simplifier agent to suggest improvements."
</example>
```

### Type 4: Tool Usage Pattern

Agent triggers based on prior tool usage:

```markdown
<example>
Context: User made multiple edits to test files
user: "I've updated all the tests"
assistant: "Great! Let me verify test quality."
<commentary>
Multiple Edit tools used on test files. Proactively trigger test-quality-analyzer.
</commentary>
assistant: "I'll use the test-quality-analyzer agent to review the tests."
</example>
```

## Multiple Examples Strategy

### Cover Different Phrasings

```markdown
<example>
user: "Review my code"
[...]
</example>

<example>
user: "Can you check my implementation?"
[...]
</example>

<example>
user: "Look over my changes"
[...]
</example>
```

### Cover Proactive and Reactive

Include at least one explicit request and one proactive trigger:

```markdown
<example>
Context: User explicitly requests review
user: "Review my code for issues"
[...]
</example>

<example>
Context: After user writes code
user: "I've implemented the feature"
assistant: "Great! Now let me review it."
<commentary>
Code written, proactively review.
</commentary>
[...]
</example>
```

## How Many Examples?

| Count | Coverage |
|-------|----------|
| 2 (minimum) | Explicit + one variation |
| 3-4 (recommended) | Explicit + implicit + proactive + edge case |
| 6 (maximum) | More makes description too long |

## Common Mistakes

### Missing Context

```markdown
<!-- BAD -->
<example>
user: "Review my code"
assistant: "I'll use the code-reviewer agent."
</example>

<!-- GOOD -->
<example>
Context: User just finished implementing authentication
user: "Review my code"
assistant: "I'll use the code-reviewer agent to analyze the auth implementation."
<commentary>
Auth code written, review for security and best practices.
</commentary>
</example>
```

### No Commentary

```markdown
<!-- BAD -->
<example>
Context: User requests review
user: "Check my changes"
assistant: "I'll use the reviewer agent."
</example>

<!-- GOOD - explains WHY -->
<example>
Context: User requests review after making changes
user: "Check my changes"
assistant: "I'll use the code-reviewer agent to analyze the modifications."
<commentary>
Code review request triggers agent to check quality, security, and standards.
</commentary>
</example>
```

### Agent Responds Directly

```markdown
<!-- BAD - shows agent output, not triggering -->
<example>
user: "Review my code"
assistant: "I found the following issues: [lists issues]"
</example>

<!-- GOOD - shows triggering -->
<example>
user: "Review my code"
assistant: "I'll use the code-reviewer agent to perform the review."
<commentary>
Review request triggers the agent.
</commentary>
</example>
```

## Template Library

### Code Review Agent

```markdown
<example>
Context: User just implemented a new feature
user: "I've added the user registration feature"
assistant: "Great! Let me review the code quality."
<commentary>
Code written, proactively trigger code-reviewer agent.
</commentary>
assistant: "I'll use the code-reviewer agent to analyze the implementation."
</example>

<example>
Context: User explicitly requests review
user: "Can you review my changes for issues?"
assistant: "I'll use the code-reviewer agent to perform a thorough review."
<commentary>
Explicit review request triggers the agent.
</commentary>
</example>
```

### Test Generation Agent

```markdown
<example>
Context: User implemented functions without tests
user: "I've added the data processing functions"
assistant: "Great! Let me generate tests for these."
<commentary>
New code without tests, proactively trigger test-generator agent.
</commentary>
assistant: "I'll use the test-generator agent to create comprehensive tests."
</example>

<example>
Context: User explicitly asks for tests
user: "Generate tests for my code"
assistant: "I'll use the test-generator agent to create a complete test suite."
<commentary>
Direct test generation request triggers the agent.
</commentary>
</example>
```

## Debugging Triggering Issues

| Problem | Check | Fix |
|---------|-------|-----|
| Agent not triggering | Examples include relevant keywords? | Add examples with different phrasings |
| Triggers too often | Examples too broad? | Make examples more specific |
| Triggers wrong scenarios | Examples match intended use? | Revise examples for correct scenarios |

## Best Practices Summary

**DO:**
- Include 2-4 concrete, specific examples
- Show both explicit and proactive triggering
- Provide clear context for each example
- Explain reasoning in commentary
- Vary user message phrasing

**DON'T:**
- Use generic, vague examples
- Omit context or commentary
- Show only one type of triggering
- Skip the agent invocation step
- Make examples too similar
