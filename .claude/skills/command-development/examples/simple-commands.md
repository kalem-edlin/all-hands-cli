# Simple Command Examples

Basic slash command patterns for common use cases.

**Note**: All examples are instructions FOR Claude (agent consumption), not messages TO users.

## Example 1: Code Review

**File**: `.claude/commands/review.md`

```markdown
---
description: Review code for quality and issues
allowed-tools: Read, Bash(git:*)
---

Review the code in this repository for:

1. **Code Quality** - Readability, maintainability, consistent style
2. **Potential Issues** - Logic errors, edge cases, performance concerns
3. **Best Practices** - Design patterns, error handling, documentation

Provide specific feedback with file and line references.
```

**Usage**: `/review`

---

## Example 2: Security Review

**File**: `.claude/commands/security-review.md`

```markdown
---
description: Review code for security vulnerabilities
allowed-tools: Read, Grep
model: sonnet
---

Perform comprehensive security review:

- SQL injection risks
- Cross-site scripting (XSS)
- Authentication/authorization issues
- Hardcoded secrets or credentials
- Input validation
- Error message safety

For each issue: file, line, severity (Critical/High/Medium/Low), recommended fix.
```

**Usage**: `/security-review`

---

## Example 3: Test File

**File**: `.claude/commands/test-file.md`

```markdown
---
description: Run tests for specific file
argument-hint: [test-file]
allowed-tools: Bash(npm:*), Bash(jest:*)
---

Run tests for $1:

Test execution: !`npm test $1`

Analyze results:
- Tests passed/failed
- Code coverage
- Performance issues

If failures found, suggest fixes based on error messages.
```

**Usage**: `/test-file src/utils/helpers.test.ts`

---

## Example 4: Documentation Generator

**File**: `.claude/commands/document.md`

```markdown
---
description: Generate documentation for file
argument-hint: [source-file]
---

Generate comprehensive documentation for @$1

Include:
- **Overview** - Purpose, main functionality, dependencies
- **API** - Function signatures, parameters, return values, errors
- **Usage Examples** - Basic usage, common patterns, edge cases
- **Implementation Notes** - Algorithm complexity, limitations

Format as Markdown suitable for project docs.
```

**Usage**: `/document src/api/users.ts`

---

## Example 5: Git Status Summary

**File**: `.claude/commands/git-status.md`

```markdown
---
description: Summarize Git repository status
allowed-tools: Bash(git:*)
---

**Current Branch**: !`git branch --show-current`
**Status**: !`git status --short`
**Recent Commits**: !`git log --oneline -5`
**Remote Status**: !`git fetch && git status -sb`

Provide:
- Summary of changes
- Suggested next actions
- Any warnings or issues
```

**Usage**: `/git-status`

---

## Example 6: Deploy Command

**File**: `.claude/commands/deploy.md`

```markdown
---
description: Deploy to specified environment
argument-hint: [environment] [version]
allowed-tools: Bash(kubectl:*), Read
---

Deploy to $1 environment using version $2

**Pre-deployment Checks**:
1. Verify $1 configuration exists
2. Check version $2 is valid
3. Verify cluster: !`kubectl cluster-info`

**Deployment Steps**:
1. Update manifest with version $2
2. Apply configuration to $1
3. Monitor rollout status
4. Verify pod health
5. Run smoke tests

Document current version for rollback if issues occur.
```

**Usage**: `/deploy staging v1.2.3`

---

## Key Patterns

### Read-Only Analysis
```markdown
---
allowed-tools: Read, Grep
---
Analyze but don't modify...
```

### Git Operations
```markdown
---
allowed-tools: Bash(git:*)
---
!`git status`
Analyze and suggest...
```

### Single Argument
```markdown
---
argument-hint: [target]
---
Process $1...
```

### Multiple Arguments
```markdown
---
argument-hint: [source] [target] [options]
---
Process $1 to $2 with $3...
```

### Fast Execution
```markdown
---
model: haiku
---
Quick simple task...
```

### File Comparison
```markdown
Compare @$1 with @$2...
```
