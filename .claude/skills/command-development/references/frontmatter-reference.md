# Command Frontmatter Reference

Complete reference for YAML frontmatter fields in slash commands.

## Frontmatter Overview

YAML frontmatter is optional metadata at the start of command files:

```markdown
---
description: Brief description
allowed-tools: Read, Write
model: sonnet
argument-hint: [arg1] [arg2]
disable-model-invocation: false
---

Command prompt content here...
```

All fields are optional. Commands work without any frontmatter.

## Field Specifications

### description

| Attribute | Value |
|-----------|-------|
| Type | String |
| Required | No |
| Default | First line of command prompt |
| Max Length | ~60 characters for clean `/help` display |

**Purpose**: Describes what the command does, shown in `/help` output.

**Examples**:
```yaml
description: Review code for security issues
description: Deploy to staging environment
description: Generate API documentation
```

**Guidelines**:
- Start with verb (Review, Deploy, Generate)
- Be specific about what command does
- Avoid "This command..." prefix
- Avoid generic descriptions like just "Review"

### allowed-tools

| Attribute | Value |
|-----------|-------|
| Type | String or Array |
| Required | No |
| Default | Inherits from conversation permissions |

**Purpose**: Restrict or specify which tools command can use.

**Formats**:

Single tool:
```yaml
allowed-tools: Read
```

Comma-separated:
```yaml
allowed-tools: Read, Write, Edit
```

Array:
```yaml
allowed-tools:
  - Read
  - Write
  - Bash(git:*)
```

**Bash command filters**:
```yaml
allowed-tools: Bash(git:*)      # Only git commands
allowed-tools: Bash(npm:*)      # Only npm commands
allowed-tools: Bash(docker:*)   # Only docker commands
```

**When to use**:
- Security: Restrict command to safe operations
- Clarity: Document required tools
- Bash execution: Enable inline bash output

### model

| Attribute | Value |
|-----------|-------|
| Type | String |
| Required | No |
| Default | Inherits from conversation |
| Values | `sonnet`, `opus`, `haiku` |

**Purpose**: Specify which Claude model executes the command.

**Use cases**:
- `haiku` - Fast, simple commands, frequent invocations
- `sonnet` - Standard workflows (default behavior)
- `opus` - Complex analysis, architectural decisions

**Examples**:
```yaml
model: haiku    # Simple formatting tasks
model: opus     # Deep code review
```

### argument-hint

| Attribute | Value |
|-----------|-------|
| Type | String |
| Required | No |
| Default | None |

**Purpose**: Document expected arguments for users and autocomplete.

**Format**:
```yaml
argument-hint: [arg1] [arg2] [optional-arg]
```

**Examples**:
```yaml
argument-hint: [pr-number]
argument-hint: [environment] [version]
argument-hint: [source-branch] [target-branch] [commit-message]
```

**Guidelines**:
- Use square brackets `[]` for each argument
- Use descriptive names (not `arg1`, `arg2`)
- Match order to positional arguments ($1, $2) in command

### disable-model-invocation

| Attribute | Value |
|-----------|-------|
| Type | Boolean |
| Required | No |
| Default | false |

**Purpose**: Prevent SlashCommand tool from programmatically invoking command.

**When to use**:
- Manual-only commands requiring user judgment
- Destructive operations with irreversible effects
- Interactive workflows needing user input

**Examples**:
```yaml
---
description: Approve production deployment
disable-model-invocation: true
---
```

## Complete Examples

### Minimal
```markdown
Review this code for common issues and suggest improvements.
```

### Standard
```markdown
---
description: Review Git changes
allowed-tools: Bash(git:*), Read
---

Current changes: !`git diff --name-only`

Review each changed file for code quality and potential bugs.
```

### Complex
```markdown
---
description: Deploy application to environment
argument-hint: [app-name] [environment] [version]
allowed-tools: Bash(kubectl:*), Read
model: sonnet
---

Deploy $1 to $2 using version $3.

Pre-checks: !`kubectl cluster-info`

Proceed with deployment following runbook.
```

### Manual-Only
```markdown
---
description: Approve production deployment
argument-hint: [deployment-id]
disable-model-invocation: true
allowed-tools: Bash(gh:*)
---

Review deployment $1 for production approval.

Deployment details: !`gh api /deployments/$1`

Verify all tests passed before approval.
```

## Validation Checklist

- [ ] YAML syntax valid (no errors)
- [ ] description under 60 characters
- [ ] allowed-tools uses proper format
- [ ] model is valid value if specified
- [ ] argument-hint matches positional arguments used
- [ ] disable-model-invocation used only when necessary
