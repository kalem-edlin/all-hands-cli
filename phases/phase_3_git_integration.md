# Phase 3: Git Integration

## Objective
Implement git helper commands that wrap git/gh CLI operations for the orchestration system.

## Scope
- `envoy git get-base-branch`
- `envoy git is-base-branch`
- `envoy git checkout-base`
- `envoy git diff-base`
- `envoy git create-pr`
- `envoy git cleanup-worktrees`
- `envoy git merge-worktree`

## Implementation Details

### Commands

#### get-base-branch
* Syntax: `envoy git get-base-branch`
* Returns the base branch name for this repository (e.g., main, master, develop)
* Uses `getBaseBranch` helper which checks for known protected branch names
* Returns: { branch: string }

#### is-base-branch
* Syntax: `envoy git is-base-branch`
* Returns true if currently on the base branch
* Returns: { is_base: boolean, current_branch: string, base_branch: string }

#### checkout-base
* Syntax: `envoy git checkout-base`
* Checks out the base branch
* Returns: { success: boolean, branch: string }

#### diff-base
* Syntax: `envoy git diff-base [--path <path>] [--summary]`
* Params:
    * `--path <path>`: Optional path to scope the diff (e.g., `docs/`)
    * `--summary`: Return summary instead of full diff
* Returns git diff of current branch vs base branch
* Returns: { diff: string, changed_files: [{ path, added, modified, deleted }] }

#### create-pr
* Syntax: `envoy git create-pr --title "<title>" --body "<body>"`
* Params:
    * `--title "<title>"`: PR title
    * `--body "<body>"`: PR body/description
* Creates a PR from current branch to base branch using gh cli
* Returns: { success: boolean, pr_url: string }

#### cleanup-worktrees
* Syntax: `envoy git cleanup-worktrees`
* Lists all worktrees matching `*--implementation-*` pattern
* For each: checks if corresponding prompt is merged
* If merged: delete worktree and branch
* If orphaned (no matching prompt in plan directory):
    * Display worktree info (branch name, last commit, age)
    * Prompt user: "(D)elete, (K)eep, (S)kip all orphans"
    * Delete removes both worktree and branch
    * Keep leaves worktree intact for manual investigation
* Returns: { cleaned: [branches], orphaned: [branches], kept: [branches] }

#### merge-worktree
* Syntax: `envoy git merge-worktree <prompt_num> [<variant>]`
* Params:
    * `<prompt_num>`: Integer prompt number
    * `<variant>`: Optional variant letter (A, B, etc.)
* Merges the worktree branch (from prompt's `worktree_branch_name`) back into the feature branch
* Records the merge commit hash in prompt's `merge_commit_hash` field
* Updates prompt status to "merged"
* **Handles three scenarios:**
    1. Already merged → finds merge commit and records hash
    2. Merge in progress (conflicts) → returns error with resolution instructions
    3. Not merged → performs merge, records hash on success
* **Conflict handling:**
    * Returns `merge_conflict` error with instructions
    * After user resolves conflicts and commits, re-running command records the hash
* Returns: { prompt_id, worktree_branch, merge_commit_hash, status }
* **Used by `get-prompt-walkthrough`:** The merge_commit_hash enables precise git diffs showing only that prompt's changes

---

## Cross-Phase Context

### Protected Branch Patterns
The following branch patterns are considered protected/special:
* **Protected branches**: main, master, develop, dev, development, stage, staging, prod, production
* **Prefix patterns**: quick/, docs/, curator/
* **Worktree implementation branches**: *--implementation-* (e.g., `feat/auth--implementation-1-A`)

### Worktree Naming Convention (Phase 6)
Implementation worktrees follow pattern: `<FEATURE_BRANCH>--implementation-<PROMPT_NUM>[-<VARIANT>]`
Uses `--` separator because git can't create `branch/subbranch` if `branch` already exists.
This naming signals to git checkout hook to skip plan matter creation.

### Git Hooks (Phase 12)
Phase 12 will implement:
* **On checkout**:
    * run `envoy documentation reindex-all` to reindex all indexes
    * Delete plan file matter for any now deleted branches
    * Skip plan matter creation for protected/special branches
    * Otherwise, create plan directory structure
* **On commit**:
    * Call `envoy documentation reindex-from-changes --files <files>`

### Implementation Protocol (Phase 9)
The implementation protocol uses `envoy git diff-base` to review existing work when resuming from an existing worktree branch.

---

## Success Criteria
- [ ] `envoy git get-base-branch` returns correct base branch
- [ ] `envoy git is-base-branch` correctly detects base branch
- [ ] `envoy git checkout-base` switches to base branch
- [ ] `envoy git diff-base` returns diff against base branch
- [ ] `envoy git diff-base --path docs/` scopes diff correctly
- [ ] `envoy git create-pr` creates PR via gh cli
- [ ] `envoy git cleanup-worktrees` identifies and cleans merged worktrees
- [ ] `envoy git merge-worktree` merges worktree and records commit hash
- [ ] `envoy git merge-worktree` handles already-merged branches correctly
- [ ] `envoy git merge-worktree` returns clear error on merge conflicts
