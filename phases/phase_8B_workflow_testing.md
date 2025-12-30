# Phase 8B: Workflow Testing Issues

## Issue #1: `update-prompt-dependencies` Doesn't Resolve Staleness

**Reproduction:**
1. `plan write-prompt 1` → creates prompt 1
2. `plan write-prompt 2 --depends-on "1"` → creates prompt 2 depending on 1
3. `plan write-prompt 1` again → updates prompt 1's `planned_at`
4. `plan validate-dependencies` → correctly shows prompt 2 as stale
5. `plan update-prompt-dependencies 2 --depends-on "1"` → updates deps
6. `plan validate-dependencies` → STILL shows prompt 2 as stale

**Problem:**
`update-prompt-dependencies` changes `depends_on` list but preserves original `planned_at`. Staleness check compares dependency's `planned_at` > prompt's `planned_at`, so updating deps doesn't fix it.

**Question:**
What's the intended fix for staleness? Options:
- A) New command to "acknowledge" dep change (bumps `planned_at` without re-planning)
- B) `update-prompt-dependencies` should also bump `planned_at`
- C) Must fully re-plan the prompt via `write-prompt`

**User Decision:**
> **Option B selected**: `update-prompt-dependencies` now bumps `planned_at` to resolve staleness.
> Command returns both `planned_at` (new) and `previous_planned_at` for visibility.

---

## Issue #2: Standalone + Variant Approaches Can Coexist (Invalid)

**Reproduction:**
1. `plan write-finding "frontend" --approaches '[{"number": 1, "description": "..."}]'` → creates approach 1 (no variant)
2. `plan write-approach "frontend" 1 --variant A --description "..."` → creates approach 1_A
3. `plan write-approach "frontend" 1 --variant B --description "..."` → creates approach 1_B
4. `plan get-findings` → shows approach 1, 1_A, AND 1_B coexisting

**Result:**
```json
{
  "approaches": [
    { "approach_id": "1", "number": 1 },
    { "approach_id": "1_A", "number": 1, "variant": "A" },
    { "approach_id": "1_B", "number": 1, "variant": "B" }
  ]
}
```

**Problem:**
No validation prevents this invalid state. An approach number MUST be EITHER:
- Standalone (no variant) OR
- Multiple variants (A, B, etc.)

Never both.

**Resolution:**
- `write-approach` now validates and returns error if conflict detected:
  - Adding variant when standalone exists → error with suggestion to `clear-approach` first
  - Adding standalone when variants exist → error with suggestion to `clear-approach` first
- New `clear-approach` command added to remove approaches by specialist/number/variant

---

## Issue #3: `get-prompt-walkthrough` Git Diff May Include Changes From Multiple Prompts

**Scenario:**
1. Prompt 1 modifies `src/auth/jwt.ts` → merges to feature branch
2. Prompt 2 also modifies `src/auth/jwt.ts` → merges to feature branch
3. Documentor runs `get-prompt-walkthrough 2`
4. `git_diff_summary` shows ALL changes to `jwt.ts` (from both prompts)

**Current behavior:**
- `get-prompt-walkthrough` runs `git diff --stat <base_branch> -- <relevant_files>`
- This diffs current feature branch vs main, not the specific prompt's changes

**Mitigating factor:**
- The `walkthrough` field is recorded DURING implementation and captures that prompt's specific work
- The git diff is supplementary context, not the primary source

**Question:**
Is supplementary git diff acceptable, or do we need:
- A) Per-prompt commit range tracking (store first/last commit hash in frontmatter)
- B) Accept current behavior (walkthrough is primary, diff is context)

**User Decision:**
> **New approach**: Track merge commit hash when worktree is merged back to feature branch.
>
> Implementation:
> 1. New `envoy git merge-worktree <prompt_num> [variant]` command:
>    - Merges worktree branch into feature branch
>    - Records merge commit hash in prompt's `merge_commit_hash` field
>    - Updates prompt status to "merged"
>    - Handles conflicts gracefully (user resolves, re-runs command)
> 2. `get-prompt-walkthrough` now uses `merge_commit_hash` for precise git diff
>    - If merge_commit_hash exists: shows changes from that specific merge commit
>    - Fallback: diffs relevant files vs base branch (may include other prompts' changes)

---

## Issue #4: Blocking Gates Should Fail Gracefully When Nothing To Review

**Scenario:**
1. Run `block-findings-gate` when no findings files exist
2. Command blocks/hangs instead of failing with clear error

**Problem:**
Blocking gate commands should validate preconditions before creating feedback files and blocking. If there's nothing to review, they should return an error explaining what's missing.

**Required safeguards per gate:**

| Gate | Required Precondition |
|------|----------------------|
| `block-findings-gate` | At least 1 findings file with approaches |
| `block-plan-gate` | Plan exists with at least 1 prompt |
| `block-prompt-testing-gate` | Prompt exists and is in implemented/reviewed status |
| `block-prompt-variants-gate` | At least 2 variants exist for prompt number |
| `block-debugging-logging-gate` | Prompt exists and is debug kind |

**Expected behavior:**
```json
{
  "status": "error",
  "error": {
    "type": "no_findings",
    "message": "No findings to review. Run discovery protocol first.",
    "suggestion": "Create findings with: envoy plan write-finding <specialist> ..."
  }
}
```

**Resolution:**
Precondition checks now implemented:

| Gate | Precondition Check |
|------|-------------------|
| `block-findings-gate` | Already had check (returns `skipped: true` when no findings) |
| `block-plan-gate` | Now errors with `no_prompts` if no prompts exist |
| `block-prompt-testing-gate` | Now errors with `invalid_status` if prompt not in `implemented`/`reviewed` status |
| `block-prompt-variants-gate` | Already had check (returns `skipped: true` if < 2 variants) |
| `block-debugging-logging-gate` | Now errors with `not_debug` if prompt kind is not `debug` |

---

## Summary of Changes

All issues resolved:
1. ✅ `update-prompt-dependencies` bumps `planned_at` to resolve staleness
2. ✅ `write-approach` validates standalone/variant exclusivity, `clear-approach` added
3. ✅ `merge-worktree` command tracks merge commit hash for precise git diffs
4. ✅ Blocking gates have precondition validation with clear error messages

