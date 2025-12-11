---
description: Spawn curator worker for .claude/ infrastructure fixes while on feature branch
argument-hint: [task-description]
---

# Curation Side-Fix

Spawn a background worker to handle `.claude/` infrastructure changes without interrupting current feature work.

## When to Use

- On feature branch, need to fix/add hook, skill, agent, or CLAUDE.md
- Don't want to context-switch from current implementation
- Change is unrelated to current plan

## Execution

### Step 1: Validate Context

Check current branch:
```bash
git branch --show-current
```

If on `main` or protected branch:
- Use AskUserQuestion: "You're on main. Create feature branch for curation work instead?"
- Options: ["Create curation branch", "Cancel"]
- On create → `git checkout -b curation/<sanitized-task>`

### Step 2: Build Task Context

Gather context for the worker:
1. Parse user's task description from $ARGUMENTS
2. If task mentions specific files, note them
3. Determine task type: hook | skill | agent | CLAUDE.md | other

### Step 3: Spawn Worker

```bash
.claude/envoy/envoy parallel spawn \
  --branch "curation/$(echo '$ARGUMENTS' | tr ' ' '-' | tr '[:upper:]' '[:lower:]' | cut -c1-30)" \
  --from main \
  --task "CURATOR TASK: $ARGUMENTS

You are a curator worker spawned to handle .claude/ infrastructure changes.

## Your Mission
$ARGUMENTS

## Guidelines
1. Use the curator patterns and skills for .claude/ work
2. Make atomic, focused changes
3. Commit your work with clear message
4. DO NOT spawn additional workers (nesting blocked)

## When Done
Commit all changes. The main session will check results via 'envoy parallel results'."
```

### Step 4: Confirm Launch

Return to user:
- Worker spawned on branch: `curation/<name>`
- Check status: `envoy parallel status`
- Get results: `envoy parallel results --worker <name>`
- Cleanup when done: `envoy parallel cleanup --worker <name>`

Continue with current feature work.
