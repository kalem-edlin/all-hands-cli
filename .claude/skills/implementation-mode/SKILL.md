---
name: implementation-mode
description: Prompt execution lifecycle for implementing plan tasks. Handles prompt reading, implementation, history tracking, and review iteration.
---

<objective>
Execute individual prompts from an active plan. Read prompt → implement → track history → get review feedback → iterate until complete.
</objective>

<quick_start>
```bash
# 1. Get prompt to implement
envoy plans get-prompt <task-number>

# 2. Implement using Glob, Grep, Read for context

# 3. Track progress
envoy plans append-history <task> --summary "Added auth middleware" --files '["src/auth.ts"]'

# 4. Get review
envoy plans review-prompt <task>

# 5. Commit when review passes
git commit -m "task-<N>: <summary>"
```
</quick_start>

<workflow>
### 1. Get Prompt
```bash
envoy plans get-prompt <task-number>
```
Returns: prompt content + existing history

### 2. Setup (if variant)
If implementing a variant prompt:
```bash
git worktree add .worktrees/task-N-V <branch>
```

### 3. Implement
- Use Glob, Grep, Read for context gathering
- Make code changes per prompt instructions
- Follow existing codebase patterns

### 4. Track History
After each significant change:
```bash
envoy plans append-history <task> \
  --summary "Brief description of change" \
  --files '["path/to/changed.ts", "path/to/other.ts"]'
```

### 5. Get Review
```bash
envoy plans review-prompt <task>
```
If changes needed → fix → append-history → review again

### 6. Commit
When review passes:
```bash
git commit -m "task-<N>: <summary>"
```

### 7. Return Status
```yaml
status: completed | needs_attention
summary: "one line"
files_changed: [list]
history_entries: N
```
</workflow>

<constraints>
- **Append history after changes** - maintains audit trail
- **Review before commit** - ensure implementation matches prompt
- **Worktree cleanup** - handled by git checkout hooks
</constraints>

<modes>
### NORMAL Mode (default)
Full workflow: get-prompt → implement → history → review → commit

### FEEDBACK Mode
Called when specialist returns to address review issues from /complete.

**Trigger**: Main agent delegates with "FEEDBACK MODE" context
</modes>

<feedback_mode>
Comprehensive workflow for addressing review feedback after /complete.

<trigger>
Main agent delegates with FEEDBACK MODE flag and review feedback content.
</trigger>

<input_format>
Main agent provides:
- `FEEDBACK MODE` marker
- Review feedback (issues array from vertex review)
- Optional: file paths mentioned in feedback
</input_format>

<workflow>
### 1. Parse Feedback
Extract actionable items from review feedback:
- Specific issues to fix
- File locations mentioned
- Severity/priority if indicated

DO NOT read prompt files - feedback IS the task.

### 2. Implement Fixes
For each issue:
1. Locate relevant code (use Grep/Read)
2. Make targeted fix
3. Keep changes minimal - only what's needed for the issue

### 3. Review Changes
```bash
envoy vertex review --last-commit
```

| Response | Action |
|----------|--------|
| verdict: approved | Continue to Step 4 |
| verdict: needs_work | Extract new issues, return to Step 2 |
| verdict: off_track | Return to main agent with failure report |

### 4. Commit
When review passes:
```bash
git add -A && git commit -m "fix: address review feedback"
```

### 5. Return to Main Agent
```yaml
status: completed
mode: feedback
fixes_applied: [list of issues addressed]
review_verdict: approved
commit_id: <sha>
```
</workflow>

<constraints>
- **NO prompt reading** - feedback is your only input
- **Minimal changes** - fix only what's flagged
- **Max 3 iterations** - if still failing after 3 review cycles, return with failure
- **No history tracking** - not a prompt implementation
</constraints>

<failure_handling>
If review fails 3 times or returns "off_track":
```yaml
status: needs_attention
mode: feedback
reason: "Review failed after N iterations"
remaining_issues: [unresolved items]
```
Main agent will escalate to user.
</failure_handling>
</feedback_mode>

<success_criteria>
- Prompt requirements implemented (NORMAL) OR feedback addressed (FEEDBACK)
- History entries recorded (NORMAL only)
- Review passes
- Clean commit created
</success_criteria>
