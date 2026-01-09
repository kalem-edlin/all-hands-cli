---
description: API reference for hook scripts and command interfaces including input/output schemas.
---

# API Reference

## Hook Scripts

### validate_artifacts.py

Validates all `.claude/` artifacts at session startup.

**Trigger:** SessionStart hook
**Input:** None (reads filesystem)
**Output:**
```json
{ "systemMessage": "⚠️ .claude/ validation errors:\n• error1\n• error2" }
```

**Validates:**
- `.claude/agents/*.md` - frontmatter, description, name match, skills exist
- `.claude/skills/*/SKILL.md` - frontmatter, name match, description
- `.claude/commands/*.md` - frontmatter, description

---

### scan_agents.py

Validates agent files only (subset of validate_artifacts).

**Trigger:** SessionStart hook
**Input:** None
**Output:** Same as validate_artifacts.py

---

### scan_skills.py

Validates skill directories only.

**Trigger:** SessionStart hook
**Input:** None
**Output:** Same as validate_artifacts.py

---

### scan_commands.py

Validates command files only.

**Trigger:** SessionStart hook
**Input:** None
**Output:** Same as validate_artifacts.py

---

### github_url_to_gh.py

Blocks GitHub URLs in fetch commands, suggests gh CLI.

**Trigger:** PreToolUse hook for WebFetch, Bash
**Input:**
```json
{
  "tool_name": "WebFetch",
  "tool_input": { "url": "https://github.com/..." }
}
```
**Output (blocked):**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "GitHub URL detected. Use 'gh' CLI: gh api repos/OWNER/REPO/contents/PATH"
  }
}
```

**Blocked domains:**
- `github.com`
- `raw.githubusercontent.com`
- `gist.github.com`

**Blocked commands:**
- `curl`, `wget`, `tavily extract` with GitHub URLs

---

### enforce_research_fetch.py

Blocks WebFetch, redirects to researcher agent.

**Trigger:** PreToolUse hook for WebFetch
**Input:**
```json
{
  "tool_name": "WebFetch",
  "tool_input": { "url": "..." }
}
```
**Output:**
```json
{
  "continue": false,
  "additionalContext": "WebFetch blocked.\n\nMain agent: delegate to researcher agent.\nSubagent: use `envoy tavily extract \"<url>\"` instead."
}
```

---

### enforce_research_search.py

Blocks WebSearch, redirects to researcher agent.

**Trigger:** PreToolUse hook for WebSearch
**Input:** Standard WebSearch input
**Output:**
```json
{
  "continue": false,
  "additionalContext": "WebSearch blocked.\n\nMain agent: delegate to researcher agent.\nSubagent: respond to main agent requesting researcher delegation."
}
```

## Command Interfaces

### /plan

**Arguments:** `[user-prompt] [--quick | --create | --refine]`

| Mode | Behavior |
|------|----------|
| `--quick` | No questions, minimal inference, direct to planner |
| `--create` | Full input gate, discovery, planning (default) |
| `--refine` | Add to existing plan |

**Steps:**
1. Parse mode and prompt
2. Input gate (unless quick)
3. Specialist delegation with discovery protocol
4. Findings gate (user review)
5. Planner delegation
6. Handoff to /continue

---

### /continue

**Arguments:** None

**Steps:**
1. Get next prompts from plan
2. Delegate to specialists (implementation protocol)
3. Extract documentation (/docs adjust --diff)
4. Loop until complete
5. Full review (envoy gemini)
6. Doc audit
7. Complete plan (PR creation)
8. Handoff to /whats-next

---

### /debug

**Arguments:** `[bug-description] [--quick | --create | --refine]`

**Modes:** Same as /plan

**Steps:**
1. Parse mode and bug description
2. Input gate (always asks observability question)
3. Specialist delegation with bug-discovery protocol
4. Findings gate
5. Planner delegation (creates debug + observability prompts)
6. Handoff to /continue

---

### /create-specialist

**Arguments:** `[initial context]`

**Input gate questions:**
1. Primary responsibility
2. Codebase areas
3. Existing skills to use
4. New skills needed
5. Envoy commands to use

**Steps:**
1. Create curator branch
2. Input gate
3. Curator create
4. Curator audit
5. User testing
6. Feedback loop
7. Commit and merge/PR

---

### /create-skill

**Arguments:** `[user prompt]`

**Input gate questions:**
1. Goals of the skill
2. Which agents will use it
3. Reference URLs
4. Directory scope

**Steps:** Same as /create-specialist

---

### /docs-init

**Arguments:** `[...optional paths] [optional context]`

**Steps:**
1. Setup branch (docs/init-* from base, or stay on feature)
2. Parse paths
3. Delegate to taxonomist (init-workflow)
4. Parallel writers in worktrees
5. Merge worktrees
6. Validate docs
7. Create PR

---

### /docs-adjust

**Arguments:** `[--diff] [optional paths or context]`

**Modes:**
- `--diff`: Use git diff to find changed files
- Paths: Document specific paths
- Neither: Ask user for scope

**Steps:**
1. Parse arguments
2. Get changed files (if --diff)
3. Delegate to taxonomist (adjust-workflow)
4. Parallel writers
5. Merge worktrees
6. Validate and report

---

### /docs-audit

**Arguments:** `[--fix] [optional docs path]`

**Modes:**
- `--fix`: Automatically fix issues
- No flag: Present findings, ask user

**Steps:**
1. Run validation
2. Present findings
3. User decision (if not --fix)
4. Delegate fixes to writer (fix-workflow)
5. Commit and report

---

### /validate

**Arguments:** None

**Action:** Runs `validate_artifacts.py` and displays errors

---

### /whats-next

**Arguments:** None

**Output:** 3-5 contextual suggestions based on completed plan, with routing guidance for next actions.
