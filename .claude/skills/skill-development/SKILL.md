---
name: skill-development
description: Use when user asks to "create a skill", "build a new skill", "write skill instructions", "improve skill description", "organize skill content", or needs guidance on skill structure, progressive disclosure, or skill development best practices. (project)
---

# Skill Development

Guide for creating effective Claude Code skills with proper structure, progressive disclosure, and validation.

## Overview

Skills extend Claude's capabilities through specialized knowledge and workflows. Each skill packages expertise into a discoverable capability that Claude invokes autonomously based on description triggers.

### Skill Anatomy

```
skill-name/
├── SKILL.md (required)
│   ├── YAML frontmatter (name, description)
│   └── Markdown body (~500-700 words target)
└── Bundled Resources (only if needed)
    ├── references/     - Detailed docs, loaded as needed
    ├── examples/       - Working code, copyable
    └── scripts/        - Utilities, executable
```

### Progressive Disclosure

Three-level loading for context efficiency:

| Level | Contents | When Loaded | Size Target |
|-------|----------|-------------|-------------|
| Metadata | name + description | Always | ~100 words |
| Body | SKILL.md content | Skill triggers | ~500-700 words |
| Resources | references/, examples/, scripts/ | As needed | Unlimited |

For detailed patterns, see `references/progressive-disclosure.md`.

## Creation Process

### Step 1: Understand Use Cases

Before writing, clarify concrete usage scenarios:

- What specific phrases trigger this skill?
- What tasks does it help accomplish?
- What would a user say to invoke it?

### Step 2: Plan Reusable Contents

Analyze each use case to identify:

1. **Scripts**: Code rewritten repeatedly or needing deterministic reliability
2. **References**: Documentation Claude should consult while working
3. **Assets**: Files used in output (templates, images)

### Step 3: Create Structure

```bash
mkdir -p .claude/skills/skill-name
touch .claude/skills/skill-name/SKILL.md
```

**Minimal by default**: Only create `references/`, `examples/`, or `scripts/` when content exceeds SKILL.md capacity or requires separate files. Most skills need only SKILL.md.

### Step 4: Write SKILL.md

#### Frontmatter Requirements

```yaml
---
name: skill-name          # lowercase-hyphenated, max 64 chars
description: [trigger description, max 1024 chars]
---
```

**Description format** (direct with triggers):
```yaml
description: Use when user asks to "create X", "configure Y", "build Z", or needs guidance on [domain]. Provides [capability summary].
```

#### Body Writing Style

Use **imperative/infinitive form** throughout:

| Correct | Incorrect |
|---------|-----------|
| Create the configuration file | You should create the configuration file |
| Validate input before processing | You need to validate input |
| Parse frontmatter using sed | Claude should parse frontmatter |

For complete style rules, see `references/writing-style.md`.

#### Body Structure

```markdown
# Skill Name

Overview (2-3 sentences).

## Quick Reference
Essential patterns, commands, key concepts.

## Key Workflows
Step-by-step procedures for main use cases.

## Additional Resources

### Reference Files
- **`references/detailed-guide.md`** - Extended documentation

### Examples
- **`examples/working-example.sh`** - Annotated example
```

**Keep body lean**: Only move to references/ when content exceeds ~700 words or requires separate file format.

### Step 5: Validate

**Structure**:
- [ ] SKILL.md exists with valid YAML frontmatter
- [ ] `name` field: lowercase-hyphenated, max 64 chars
- [ ] `description` field: max 1024 chars
- [ ] Referenced files exist

**Description Quality**:
- [ ] Direct format ("Use when...")
- [ ] Specific trigger phrases ("create X", "configure Y")
- [ ] Not vague or generic

**Content Quality**:
- [ ] Body uses imperative/infinitive form (not second person)
- [ ] Body is ~500-700 words (move excess to references/)
- [ ] Resources only created when necessary
- [ ] Resources clearly referenced in body if present

### Step 6: Iterate

After using the skill on real tasks:

1. Notice struggles or inefficiencies
2. Identify improvements to SKILL.md or resources
3. Implement changes
4. Test again

## Degrees of Freedom

Match constraint level to task criticality:

| Level | When to Use | Example |
|-------|-------------|---------|
| High (text) | Multiple valid approaches | "Generate appropriate tests" |
| Medium (parameterized) | Preferred pattern exists | Script with configurable params |
| Low (exact) | Fragile/critical ops | Exact shell commands |

## Common Mistakes

### Weak Trigger Description

**Bad**:
```yaml
description: Provides guidance for working with hooks.
```

**Good**:
```yaml
description: Use when user asks to "create a hook", "add a PreToolUse hook", "validate tool use". Provides hooks API guidance.
```

### Too Much in SKILL.md

**Bad**: 1,000+ words in SKILL.md without references

**Good**: ~500-700 words in SKILL.md, move excess to references/

### Unnecessary Reference Files

**Bad**: Creating references/ for simple skills that fit in ~500 words

**Good**: Most skills are SKILL.md only. Create subdirs only when:
- Content exceeds ~700 words
- Need executable scripts or separate file formats
- Multiple distinct reference documents required

### Second Person Writing

**Bad**: "You should start by reading the configuration."

**Good**: "Start by reading the configuration."

## Quick Reference Structures

### Minimal Skill
```
skill-name/
└── SKILL.md
```

### Standard Skill (Recommended)
```
skill-name/
├── SKILL.md
├── references/
│   └── detailed-guide.md
└── examples/
    └── working-example.sh
```

### Complete Skill
```
skill-name/
├── SKILL.md
├── references/
│   ├── patterns.md
│   └── advanced.md
├── examples/
│   ├── example1.sh
│   └── example2.json
└── scripts/
    └── validate.sh
```

## Additional Resources

### Reference Files

- **`references/progressive-disclosure.md`** - Directory structure patterns, when to use each level
- **`references/writing-style.md`** - Imperative form rules, formatting best practices

### Examples

- **`examples/complete-skill-examples.md`** - Annotated complete skills with commentary

### Scripts

- **`scripts/validate-skill.sh`** - Validate skill file structure and content
