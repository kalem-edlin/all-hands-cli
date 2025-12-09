# Complete Skill Examples

Annotated examples demonstrating skill structure best practices.

---

## Example 1: Code Review Skill (Minimal Structure)

Simple skill with no supporting files.

### File: `code-review/SKILL.md`

```yaml
---
name: code-review
description: Use when user asks to "review code", "check this PR", "analyze code quality", or needs feedback on code changes. Provides structured code review guidance.
---

# Code Review

Structured approach to reviewing code for quality, security, and maintainability.

## Quick Reference

| Check | Focus Areas |
|-------|-------------|
| Logic | Edge cases, error handling, race conditions |
| Security | Input validation, auth, data exposure |
| Performance | N+1 queries, memory leaks, inefficient loops |
| Style | Naming, formatting, documentation |
| Tests | Coverage, edge cases, mocking |

## Review Workflow

### 1. Understand Context

Before reviewing:
- Read PR description and linked issues
- Understand the feature/fix intent
- Check affected components

### 2. Structural Review

Examine high-level design:
- File organization appropriate?
- Separation of concerns maintained?
- Dependencies reasonable?

### 3. Line-by-Line Review

Check each change for:
- Logic correctness
- Edge case handling
- Error handling
- Security implications

### 4. Test Review

Verify test coverage:
- Happy path covered
- Edge cases tested
- Error conditions handled

## Output Format

Structure review comments as:

**[SEVERITY]** path/to/file.py:L42

[Issue description]

Suggestion:
[Proposed fix or improvement]

Severity levels:
- **CRITICAL**: Must fix before merge
- **IMPORTANT**: Should fix, may block
- **SUGGESTION**: Nice to have
- **QUESTION**: Clarification needed
```

### Commentary

This minimal skill works because:
- **Focused scope**: Just code review
- **Clear triggers**: "review code", "check this PR"
- **Actionable content**: Checklist and workflow immediately usable
- **Output format**: Structured format ensures consistent reviews

---

## Example 2: API Integration Skill (Standard Structure)

Skill with references for detailed documentation.

### Directory Structure

```
api-integration/
├── SKILL.md
└── references/
    ├── authentication.md
    └── error-handling.md
```

### File: `api-integration/SKILL.md`

```yaml
---
name: api-integration
description: Use when user asks to "integrate with API", "make API calls", "handle API authentication", or needs guidance on REST API integration patterns.
---

# API Integration

Patterns for integrating with REST APIs: authentication, requests, error handling.

## Quick Reference

| Task | Pattern |
|------|---------|
| Auth | Bearer token in Authorization header |
| Requests | Use requests library with timeout |
| Errors | Retry with exponential backoff |
| Responses | Validate schema before processing |

## Core Workflow

### 1. Setup Authentication

import requests

def get_client(api_key: str) -> requests.Session:
    session = requests.Session()
    session.headers.update({
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    })
    return session

For advanced auth patterns, see `references/authentication.md`.

### 2. Make Requests

def api_request(session, method, url, **kwargs):
    kwargs.setdefault("timeout", 30)
    response = session.request(method, url, **kwargs)
    response.raise_for_status()
    return response.json()

### 3. Handle Errors

Implement retry with backoff for transient failures.

For comprehensive error handling, see `references/error-handling.md`.

## Additional Resources

### Reference Files

- **`references/authentication.md`** - OAuth flows, API key patterns, JWT handling
- **`references/error-handling.md`** - Error categories, retry strategies
```

### Commentary

This standard structure works because:
- **Lean SKILL.md**: Core patterns inline, details in references
- **Progressive disclosure**: Auth and error depth available but not always loaded
- **Practical code**: Copy-paste ready examples

---

## Example 3: Database Migration Skill (Complete Structure)

Full skill with references, examples, and scripts.

### Directory Structure

```
db-migration/
├── SKILL.md
├── references/
│   └── rollback-procedures.md
├── examples/
│   └── simple-migration.sql
└── scripts/
    └── validate-migration.sh
```

### File: `db-migration/SKILL.md`

```yaml
---
name: db-migration
description: Use when user asks to "create migration", "migrate database", "rollback migration", or needs guidance on safe database schema modifications.
---

# Database Migration

Safe patterns for database schema modifications with rollback capabilities.

## Quick Reference

| Phase | Actions |
|-------|---------|
| Plan | Review changes, identify risks, plan rollback |
| Prepare | Backup, test in staging, validate syntax |
| Execute | Apply in maintenance window, monitor |
| Verify | Check data integrity, test application |

## Migration Workflow

### 1. Plan Migration

Before writing migration:
- Document current schema state
- Identify all affected tables
- Plan rollback strategy

### 2. Write Migration

-- migrations/001_add_user_email.sql
-- Rollback: ALTER TABLE users DROP COLUMN email;

ALTER TABLE users ADD COLUMN email VARCHAR(255);
CREATE INDEX idx_users_email ON users(email);

For examples, see `examples/simple-migration.sql`.

### 3. Validate Before Execution

Run validation script:

./scripts/validate-migration.sh migrations/001_add_user_email.sql

### 4. Execute Migration

# Backup first
pg_dump dbname > backup_$(date +%Y%m%d).sql

# Apply migration
psql dbname < migrations/001_add_user_email.sql

## Rollback Procedures

If issues detected, rollback immediately. See `references/rollback-procedures.md`.

## Additional Resources

### Reference Files
- **`references/rollback-procedures.md`** - Step-by-step rollback for different scenarios

### Examples
- **`examples/simple-migration.sql`** - Basic ALTER TABLE migration

### Scripts
- **`scripts/validate-migration.sh`** - Syntax and safety validation
```

### Commentary

This complete structure works because:
- **SKILL.md as orchestrator**: Points to all resources
- **Scripts execute blindly**: validate-migration.sh runs without context consumption
- **Examples are copyable**: SQL ready to adapt
- **References for depth**: Rollback details available when needed

---

## Key Takeaways

1. **Match structure to complexity**: Simple = minimal, complex = complete

2. **SKILL.md is the index**: Always reference supporting files

3. **Progressive disclosure works**: Start lean, expand to references as needed

4. **Scripts save tokens**: Execute without loading into context

5. **Examples should be complete**: Provide working, copy-paste ready code
