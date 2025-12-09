# Skill Writing Style Guide

Rules for consistent, effective skill documentation.

## Imperative/Infinitive Form

Write using verb-first instructions, not second person.

### Correct Examples

```markdown
Create the configuration file.
Validate input before processing.
Parse frontmatter using sed.
Start by reading the existing code.
```

### Incorrect Examples

```markdown
You should create the configuration file.
You need to validate input.
Claude should parse frontmatter.
If you want to start, read the existing code.
```

### Why This Matters

1. **Consistency**: Uniform tone across all skills
2. **Clarity**: Direct instructions are unambiguous
3. **AI consumption**: Imperative form processes more reliably

### Quick Test

Read each sentence aloud. If it starts with:
- A verb (Create, Validate, Parse) - Correct
- "You" or agent name - Incorrect
- "If you" or "When you" - Rephrase

## Third-Person Description Format

The frontmatter `description` field uses third person.

### Correct Format

```yaml
description: This skill should be used when the user asks to "create X", "configure Y", "build Z". Provides [capability].
```

### Incorrect Formats

```yaml
# Wrong: Second person
description: Use this skill when you want to create X.

# Wrong: First person
description: I help with creating X.

# Wrong: Imperative (body style, not description style)
description: Create X, configure Y, build Z.
```

### Description Structure

```
This skill should be used when the user asks to [TRIGGERS]. [CAPABILITY SUMMARY].
```

## Word Count Guidance

### SKILL.md Body

| Target | Max | Notes |
|--------|-----|-------|
| 1,500-2,000 words | 3,000 words | Move excess to references/ |

### How to Count

```bash
# Quick word count
wc -w SKILL.md

# Exclude frontmatter
tail -n +$(grep -n "^---$" SKILL.md | sed -n '2p' | cut -d: -f1) SKILL.md | wc -w
```

### When Over Limit

Identify sections to extract:
1. Detailed patterns → `references/patterns.md`
2. Advanced techniques → `references/advanced.md`
3. Long examples → `examples/`
4. API reference → `references/api-reference.md`

### Description Length

- Target: 150-300 characters
- Max: 1024 characters
- Include: Trigger phrases, capability summary
- Exclude: Implementation details

## Formatting Best Practices

### Headers

Use Markdown headers for structure:

```markdown
# Skill Name (H1 - one per file)

## Major Section (H2)

### Subsection (H3)

#### Detail Level (H4 - use sparingly)
```

### Tables for Quick Reference

Prefer tables over prose for scannable information:

```markdown
| Command | Purpose | Example |
|---------|---------|---------|
| `create` | New resource | `create user` |
| `delete` | Remove resource | `delete user 123` |
```

### Code Blocks

Always specify language for syntax highlighting:

````markdown
```python
def example():
    pass
```
````

### Lists

Use bullets for unordered items, numbers for sequences:

```markdown
Required components:
- SKILL.md
- references/ (if detailed content)

To create a skill:
1. Plan the structure
2. Write SKILL.md
3. Add resources
4. Validate
```

## Common Style Mistakes

### Passive Voice

**Avoid**: "The configuration file should be created."

**Use**: "Create the configuration file."

### Hedging Language

**Avoid**: "You might want to consider validating the input."

**Use**: "Validate the input."

### Unnecessary Qualifiers

**Avoid**: "It's generally a good idea to test the script first."

**Use**: "Test the script before deployment."

### Conversational Tone

**Avoid**: "So basically, you'll want to..."

**Use**: "Start by..."
