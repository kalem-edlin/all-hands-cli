# Phase 7: Blocking Gates

## Objective
Implement user feedback loop commands that create feedback files and block via file watching until user completes them.

## Scope
- User feedback file schemas
- `envoy plan block-findings-gate`
- `envoy plan block-plan-gate`
- `envoy plan block-prompt-testing-gate`
- `envoy plan block-prompt-variants-gate`
- `envoy plan block-debugging-logging-gate`

## Implementation Details

### Blocking Mechanism
All `block-*` commands use **file watching** (chokidar or similar) to wait for `done: true` in the feedback file. This is NOT busy-wait polling - use proper file system events.

Default timeout: 12 hours (configurable via BLOCKING_GATE_TIMEOUT_MS env var).

### User Feedback File Schemas

All user feedback files live in `user_feedback/` directory. They are ephemeral - created by block commands, deleted after processing. All user input (thoughts, changes) is persisted to `user_input.md` before deletion.

#### Base Schema (all feedback files include these)
```yaml
# Set to true when finished providing feedback
done: false

# Optional message to the agent (persisted to user_input.md)
thoughts: ""
```

#### findings_gate.yaml (`envoy plan block-findings-gate`)
Created when discoveries need user review before planning.
```yaml
done: false
thoughts: ""

# User directives for specific approaches
# Key format: {specialist}_{number} (standalone) or {specialist}_{number}_{variant} (variants)
# NOTE: An approach is EITHER standalone OR has variants - never both
# Leave empty to accept approach as-is
# Set rejected: true to reject variant approaches (at least one variant must NOT be rejected)
approach_feedback:
  # Standalone approach (no variants) - no rejected field
  backend_1:
    user_required_changes: ""
  # Variant approaches - all have rejected field, at least one must be false
  frontend_1_A:
    user_required_changes: ""
    rejected: false
    question_answers:
      - question: "Should we use SSR or CSR for this component?"
        answer: ""
  frontend_1_B:
    user_required_changes: ""
    rejected: false  # Can reject B if keeping A, but can't reject ALL
```

#### plan_gate.yaml (`envoy plan block-plan-gate`)
Created when plan/prompts need user review before implementation.
```yaml
done: false
thoughts: ""

# User directive for top-level plan changes
user_required_plan_changes: ""

# User directives for specific prompts (by number and optional variant)
prompt_feedback:
  1:
    user_required_changes: ""
  2_A:
    user_required_changes: ""
  2_B:
    user_required_changes: ""
```

#### audit_questions.yaml (`envoy gemini audit`)
Created internally by gemini audit when clarifying questions are needed.
```yaml
done: false
thoughts: ""

# Questions from the audit (answer each)
questions:
  - question: "The plan includes both SSR and CSR approaches - is this intentional redundancy?"
    answer: ""
  - question: "Prompt 3 has no success criteria - what defines done?"
    answer: ""
```

#### {N}{V}_review_questions.yaml or full_review_questions.yaml (`envoy gemini review`)
Created internally by gemini review when clarifying questions are needed.
```yaml
done: false
thoughts: ""

# Questions from the review (answer each)
questions:
  - question: "The auth flow seems to bypass rate limiting - is this intentional?"
    answer: ""
  - question: "Should error messages expose internal IDs?"
    answer: ""

# Optional: suggest implementation changes based on review findings
suggested_changes: ""
```

#### {N}{V}_testing.yaml + {N}{V}_testing_logs.md (`envoy plan block-prompt-testing-gate`)
Created when a prompt requires manual user testing. Logs go in sibling .md file.
```yaml
# {N}{V}_testing.yaml
done: false
thoughts: ""

# Did the implementation pass your testing? (defaults to true for minimal friction)
test_passed: true

# If test_passed is false, describe what needs to be fixed
user_required_changes: ""
```
```markdown
<!-- {N}{V}_testing_logs.md - paste logs here -->
```
**Token limit:** MAX_LOGS_TOKENS env var (default 10000). If exceeded, done is reset to false and error returned.

#### {N}_variants.yaml (`envoy plan block-prompt-variants-gate`)
Created when variant prompts need user selection (only after ALL variants reach tested status).
```yaml
done: false
thoughts: ""

# Multi-variant acceptance: exactly ONE must be 'main', others can be 'accepted' (alternative) or 'rejected'
# main = merged to feature branch
# accepted = NOT merged, worktree preserved for manual feature-flagging later
# rejected = branch archived (git branch -m <b> archive/<b>), worktree removed
# For debug prompts: 'accepted' (non-main) treated as 'rejected' - only one fix can be main
variants:
  A:
    decision: null  # main | accepted | rejected (exactly ONE must be 'main')
    reason: ""
  B:
    decision: null
    reason: ""
```

#### {N}{V}_logging.yaml + {N}{V}_logging_logs.md (`envoy plan block-debugging-logging-gate`)
Created when debug logging has been implemented and user needs to capture output. Logs go in sibling .md file.
```yaml
# {N}{V}_logging.yaml
done: false
thoughts: ""
```
```markdown
<!-- {N}{V}_logging_logs.md - paste debug logs here -->
```
**Token limit:** MAX_LOGS_TOKENS env var (default 10000). If exceeded, done is reset to false and error returned.

### Field Naming Semantics

**User feedback files use `user_required_changes`** - a directive from the user instructing the agent to re-investigate or fix something.

**Findings files use `user_requested_changes`** - same data, persisted after gate completion.

**Findings files use `user_addressed_questions`** - only questions the user actually answered (not unanswered required_clarifying_questions).

**Read commands never return `required_clarifying_questions`** - that's internal to discovery. Only `user_addressed_questions` (populated answers) are returned.

### Commands

#### block-findings-gate
* Syntax: `envoy plan block-findings-gate`
* **Creates:** `user_feedback/findings_gate.yaml` (fully YAML)
* **Updates:** `findings/*.yaml` (fully YAML), `user_input.md` (freetext only)
* Creates feedback file with:
    * Keys: `{specialist}_{number}` (standalone) or `{specialist}_{number}_{variant}` (variants)
    * NOTE: An approach is EITHER standalone OR has variants - never both
    * Empty `user_required_changes` field for each approach
    * `rejected: false` field only for variant approaches (variant !== null)
    * `question_answers` only when approach has questions
* Blocks via file watching until `done: true` (default timeout: 12 hours)
* **Validation:** At least one variant per approach number must NOT be rejected
* On completion:
    * Append `thoughts` to user_input.md (if non-empty)
    * For each approach feedback:
        * If `rejected: true`, delete the approach from findings
        * Write `user_required_changes` to approach's `user_requested_changes` field
        * Write answered questions to approach's `user_addressed_questions` field
        * Append changes and answered questions to user_input.md for audit trail
    * Delete the feedback file
* Returns: {
    thoughts: string (user's additional context/guidance),
    affected_approaches: [{ specialist_name, approach_id }] (approaches with updates),
    rejected_approaches: [{ specialist_name, approach_id }] (approaches that were rejected)
  }
* Note: Re-delegated specialists read their approach via `envoy plan get-finding-approach <specialist_name> <approach_num> [variant]` which returns `user_requested_changes` and `user_addressed_questions` (only populated ones)

#### block-plan-gate
* Syntax: `envoy plan block-plan-gate`
* **Creates:** `user_feedback/plan_gate.yaml` (fully YAML)
* **Updates:** `user_input.md` (freetext only)
* **Moves (conditional):** `findings/*.yaml` → `findings/_archive/` (only when NO changes requested)
* Creates feedback file with:
    * `user_required_plan_changes` field for top-level plan feedback
    * `prompt_feedback` section with `user_required_changes` field for each prompt
* Blocks via file watching until `done: true`
* On completion:
    * Append `thoughts` to user_input.md (if non-empty)
    * Append `user_required_plan_changes` to user_input.md (if non-empty)
    * For each prompt change (if non-empty):
        * Append to user_input.md for audit trail
    * **Only if no changes requested:** Move all findings files to findings/_archive/
    * Delete the feedback file
* Returns: {
    thoughts: string,
    has_user_required_changes: boolean,
    user_required_plan_changes: string,
    prompt_changes: [{ prompt_id, user_required_changes }],
    archived_findings: string[] (empty if changes requested)
  }
* Note: If `has_user_required_changes: true`, agent should refine and re-run gate

#### block-prompt-testing-gate
* Syntax: `envoy plan block-prompt-testing-gate <prompt_num> [<variant>]`
* **Creates:** `user_feedback/{N}{V}_testing.yaml` (fully YAML)
* **Updates:** `prompts/{N}.md` or `prompts/{N}{V}.md` (YAML front matter + freetext), `user_input.md` (freetext only)
* Creates feedback file with:
    * `test_passed` field (true | false)
    * `user_required_changes` field
    * `logs` field for optional output capture
* Blocks via file watching until `done: true`
* On completion:
    * Append `thoughts` to user_input.md (if non-empty)
    * If test_passed = false:
        * Append `user_required_changes` to user_input.md
        * Delete the feedback file
        * Return { thoughts, passed: false, user_required_changes, logs }
    * If test_passed = true:
        * Set prompt status to tested
        * Delete the feedback file
        * Return { thoughts, passed: true }

#### block-prompt-variants-gate
* Syntax: `envoy plan block-prompt-variants-gate <prompt_num> <variant>`
* **Creates:** `user_feedback/{N}_variants.yaml` (fully YAML)
* **Updates:** `prompts/{N}{V}.md` (YAML front matter + freetext), `user_input.md` (freetext only)
* **May archive branch:** For discarded variants (`git branch -m <b> archive/<b>`)
* Return immediately if not a variant prompt
* Creates feedback file (only once when first variant calls) with:
    * All variant letters for this prompt number
    * `decision` field (main | accepted | rejected) for each - exactly ONE must be 'main'
    * `reason` field for each
* **Multi-variant acceptance model:**
    * `main`: Merged to feature branch (exactly ONE per prompt number)
    * `accepted` (alternative): NOT merged, worktree preserved for manual feature-flagging
    * `rejected` (discard): Archive branch, remove worktree
    * For debug prompts: `accepted` (non-main) treated as `rejected`
* Blocks via file watching until `done: true`
* On completion:
    * Append `thoughts` to user_input.md (if non-empty)
    * Set `variant_solution` in each prompt file: 'main' | 'alternative' | 'discard'
    * For 'discard': archive branch (`git branch -m <b> archive/<b>`), remove worktree
    * For 'alternative': preserve worktree, do NOT merge
    * Delete the feedback file
* Returns: { thoughts, variant_solution, reason, unmerged_alternatives?: [branch_names] }

#### block-debugging-logging-gate
* Syntax: `envoy plan block-debugging-logging-gate <prompt_num> [<variant>]`
* **Creates:** `user_feedback/{N}{V}_logging.yaml` (fully YAML)
* **Updates:** `user_input.md` (freetext only)
* Creates feedback file with:
    * `logs` field for user to paste captured debug output
* Blocks via file watching until `done: true`
* On completion:
    * Append `thoughts` to user_input.md (if non-empty)
    * Delete the feedback file
* Returns: { thoughts, logs }

---

## Cross-Phase Context

### File Watching Infrastructure (Phase 1)
Phase 1 should establish the file watching utility that these commands will use. Use chokidar or similar - NOT busy-wait polling.

### Implementation Protocol (Phase 9)
Step 12: If requires_manual_testing, call `envoy plan block-prompt-testing-gate <PROMPT_NUM> [<VARIANT>]`
Step 13: Call `envoy plan block-prompt-variants-gate <PROMPT_NUM> <VARIANT>`

### Debugging Protocol (Phase 9)
Step 6.2: Call `envoy plan block-debugging-logging-gate <PROMPT_NUM> [<VARIANT>]`

### Planner Workflow (Phase 10)
Step 9: Call `envoy plan block-plan-gate`

### /plan Command (Phase 11)
Step 9.3: Call `envoy plan block-findings-gate`

### Gemini Integration (Phase 8)
Gemini audit and review may create their own feedback files (audit_questions.yaml, review_questions.yaml) and block for user answers.

---

## Implementation Consideration: Runtime Schema Validation

User feedback files are written by humans, making them susceptible to formatting errors. **Zod runtime validation** is implemented when reading user_feedback/*.yaml files.

---

## Success Criteria
- [x] File watching mechanism works (not busy-wait polling)
- [x] `envoy plan block-findings-gate` creates correct feedback file
- [x] `envoy plan block-findings-gate` blocks until done: true
- [x] `envoy plan block-findings-gate` writes user_requested_changes to findings
- [x] `envoy plan block-findings-gate` writes user_addressed_questions to findings
- [x] `envoy plan block-plan-gate` archives findings after completion
- [x] `envoy plan block-prompt-testing-gate` handles pass/fail correctly
- [x] `envoy plan block-prompt-variants-gate` handles multi-variant coordination
- [x] `envoy plan block-debugging-logging-gate` captures logs
- [x] All gates append thoughts to user_input.md
- [x] All gates delete feedback files after processing
- [x] Read commands never return required_clarifying_questions
- [x] Read commands only return user_addressed_questions when populated
- [x] Empty fields are stripped from command returns (stripEmpty utility)
