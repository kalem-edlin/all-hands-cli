---
name: command-development
description: Use when user asks to "create a slash command", "add a command", "write custom command", or needs guidance on command frontmatter, dynamic arguments, or bash execution.
---

# Command Development

Guide for creating Claude Code slash commands with proper structure, frontmatter, and dynamic features.

## Overview

Slash commands are Markdown files containing prompts that Claude executes when invoked. Commands provide reusability, consistency, and quick access to complex workflows.

**Key principle**: Commands are instructions FOR Claude (agent consumption), not messages TO users.

## Command Locations

| Type | Location | Scope | Label |
|------|----------|-------|-------|
| Project | `.claude/commands/` | Shared with team | (project) |
| Personal | `~/.claude/commands/` | All your projects | (user) |
| Plugin | `plugin/commands/` | Plugin users | (plugin-name) |

Project commands take precedence over personal commands with same name.

## File Format

Commands are `.md` files. The filename (minus extension) becomes the command name.

**Minimal command** (no frontmatter):
```markdown
Review this code for security vulnerabilities including:
- SQL injection
- XSS attacks
- Authentication issues
```

**With frontmatter**:
```markdown
---
description: Review code for security issues
allowed-tools: Read, Grep, Bash(git:*)
model: sonnet
argument-hint: [file-path]
---

Review @$1 for security vulnerabilities...
```

## YAML Frontmatter Fields

| Field | Purpose | Default |
|-------|---------|---------|
| `description` | Brief description for `/help` | First line of prompt |
| `allowed-tools` | Tools command can use | Inherits from conversation |
| `model` | Model to use (sonnet/opus/haiku) | Inherits from conversation |
| `argument-hint` | Document expected arguments | None |
| `disable-model-invocation` | Prevent SlashCommand tool from calling | false |

For detailed field specifications, see `references/frontmatter-reference.md`.

## Dynamic Arguments

### $ARGUMENTS - All arguments

```markdown
---
argument-hint: [issue-number]
---
Fix issue #$ARGUMENTS following coding standards.
```

Usage: `/fix-issue 123 high-priority` expands `$ARGUMENTS` to "123 high-priority"

### Positional - $1, $2, $3...

```markdown
---
argument-hint: [pr-number] [priority] [assignee]
---
Review PR #$1 with priority $2, assign to $3.
```

Usage: `/review-pr 456 high alice`

## File References

Use `@` prefix to include file contents:

```markdown
# Static reference
Review @src/utils/helpers.js for issues.

# Dynamic with argument
Generate docs for @$1
```

## Bash Execution

Execute bash commands inline with exclamation-backtick syntax. Requires `allowed-tools` with Bash.

```markdown
---
allowed-tools: Bash(git:*)
---

Current branch: !`git branch --show-current`
Recent commits: !`git log --oneline -5`
Status: !`git status --short`

Review changes and suggest commit message.
```

**Tool patterns**:
- `Bash(git:*)` - Only git commands
- `Bash(npm:*)` - Only npm commands
- `Bash(kubectl:*), Bash(helm:*)` - Multiple specific tools

## Command Organization

### Flat (5-15 commands)

```
.claude/commands/
├── build.md
├── test.md
├── deploy.md
└── review.md
```

### Namespaced (15+ commands)

```
.claude/commands/
├── ci/
│   ├── build.md    # /build (project:ci)
│   └── test.md     # /test (project:ci)
├── git/
│   ├── commit.md   # /commit (project:git)
│   └── pr.md       # /pr (project:git)
└── docs/
    └── generate.md # /generate (project:docs)
```

Subdirectory appears in `/help` description but not command name.

## User Interaction (AskUserQuestion)

For commands requiring user decisions, use AskUserQuestion tool:

```markdown
---
description: Deploy with environment selection
---

Use AskUserQuestion to confirm deployment:

Question: "Deploy to which environment?"
Options:
1. Development - Lower risk, fast iteration
2. Staging - Pre-production testing
3. Production - Live deployment (requires approval)

After user selection, proceed with deployment to chosen environment.
```

## Best Practices

### Command Design
- Single responsibility per command
- Clear descriptions under 60 characters
- Document arguments with `argument-hint`
- Use verb-noun naming (review-pr, fix-issue)

### Tool Restrictions
- Be restrictive: `Bash(git:*)` not `Bash(*)`
- Only specify tools when different from conversation permissions
- Document why specific tools needed

### Error Handling
- Consider missing/invalid arguments
- Provide helpful error messages
- Suggest corrective actions

## Common Patterns

### Read-Only Analysis
```markdown
---
allowed-tools: Read, Grep
---
Analyze code without modifications...
```

### Git Operations
```markdown
---
allowed-tools: Bash(git:*)
---
!`git status`
Analyze and suggest...
```

### File Comparison
```markdown
Compare @$1 with @$2 and identify differences...
```

## Additional Resources

### Reference Files
- **`references/frontmatter-reference.md`** - Complete field specifications and constraints

### Examples
- **`examples/simple-commands.md`** - Basic command patterns
- **`examples/plugin-commands.md`** - Plugin-specific patterns with ${CLAUDE_PLUGIN_ROOT}
