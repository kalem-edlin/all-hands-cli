# Phase 6: Prompt Lifecycle

## Objective
Implement prompt state management commands that track implementation progress through the prompt lifecycle.

## Scope
- `envoy plan next`
- `envoy plan start-prompt`
- `envoy plan record-implementation`
- `envoy plan complete-prompt`
- `envoy plan get-prompt-walkthrough`
- `envoy plan mark-prompt-extracted`
- `envoy plan release-all-prompts`
- `envoy plan complete`

## Implementation Details

### Prompt Status Lifecycle
```
unimplemented → implemented → reviewed → tested → merged
```

### Commands

#### next
* Syntax: `envoy plan next [-n <count>]`
* **Reads:** `prompts/*.md` (YAML front matter + freetext)
* Params:
    * `-n <count>`: Number of independent prompts to return (defaults to N_PARALLEL_WORKERS env var or 1)
* Finds the next N prompts that have no dependencies on non-merged previous prompts (ordered by number and variant letter), prioritizes debugging prompts if not depending on incomplete tasks (should be very unlikely as debug prompt that depend on prompts will likely have been sourced from completed prompts)
* Pulls variants of the same prompt number to implement in parallel (regardless of N) if one variant pulled within N
* Returns:
    * Description, prompt num, variant letter, relevant file list, and whether the prompt is a debugging prompt or an implementation prompt

#### start-prompt
* Syntax: `envoy plan start-prompt <prompt_num> [<variant>] --specialist "<name>" --worktree "<branch_name>"`
* **Updates:** `prompts/{N}.md` or `prompts/{N}{V}.md` (YAML front matter + freetext)
* Params:
    * `<prompt_num>`: Integer prompt number
    * `<variant>`: Optional variant letter
    * `--specialist "<name>"`: Name of the specialist/agent working on this prompt
    * `--worktree "<branch_name>"`: Worktree branch name for tracking
* Sets status to in_progress
* Records specialist name and worktree branch for tracking
* Initializes current_iteration to 1

#### record-implementation
* Syntax: `envoy plan record-implementation <prompt_num> [<variant>] --walkthrough "<structured_walkthrough>" --iteration <N> [--refinement-reason "<context>"]`
* **Updates:** `prompts/{N}.md` or `prompts/{N}{V}.md` (YAML front matter + freetext)
* Params:
    * `<prompt_num>`: Integer prompt number
    * `<variant>`: Optional variant letter
    * `--walkthrough "<structured_walkthrough>"`: Formatted markdown walkthrough section for this iteration (see Walkthrough Format below)
    * `--iteration <N>`: Integer iteration number (1 for initial, 2+ for refinements)
    * `--refinement-reason "<context>"`: Context explaining why this iteration was needed (required for iteration > 1)
* Sets status to implemented
* Appends to existing walkthrough array in prompt file, preserving previous iterations
* Updates current_iteration to match the provided iteration number

**Walkthrough Format** (structured markdown for --walkthrough):
```markdown
### Iteration {N}
**Type**: initial | review-refinement | testing-refinement
**Refinement Context**: {reason for this iteration, if not initial}

#### Approach
{Brief description of the approach taken}

#### Changes Made
- `path/to/file.ts`: {description of changes}
- `path/to/other.ts`: {description of changes}

#### Key Decisions
- {Decision 1}: {rationale}
- {Decision 2}: {rationale}
```

#### complete-prompt
* Syntax: `envoy plan complete-prompt <prompt_num> [<variant>]`
* **Updates:** `prompts/{N}.md` or `prompts/{N}{V}.md` (YAML front matter + freetext)
* Params:
    * `<prompt_num>`: Integer prompt number
    * `<variant>`: Optional variant letter
* Sets status to merged
* Closes out prompt (walkthrough already contains all implementation decisions and refinement history for documentation extraction)

#### get-prompt-walkthrough
* Syntax: `envoy plan get-prompt-walkthrough <prompt_num> [<variant>]`
* **Reads:** `prompts/{N}.md` or `prompts/{N}{V}.md` (YAML front matter + freetext)
* Params:
    * `<prompt_num>`: Integer prompt number
    * `<variant>`: Optional variant letter
* Returns full context for documentation extraction of a specific prompt:
    * Prompt description and success_criteria
    * Full walkthrough history
    * Git diff summary for the prompt's changes
* **Git diff behavior:**
    * If `merge_commit_hash` exists: shows changes from that specific merge commit (precise)
    * Fallback: diffs relevant_files vs base branch (may include other prompts' changes)
* Returns: { prompt_num, variant, description, success_criteria, walkthrough: [...], git_diff_summary: string, merge_commit_hash: string | null }

#### mark-prompt-extracted
* Syntax: `envoy plan mark-prompt-extracted <prompt_num> [<variant>]`
* **Updates:** `prompts/{N}.md` or `prompts/{N}{V}.md` (YAML front matter + freetext)
* Params:
    * `<prompt_num>`: Integer prompt number
    * `<variant>`: Optional variant letter
* Sets documentation_extracted = true on the specific prompt
* Called by documentor after processing that individual prompt

#### release-all-prompts
* Syntax: `envoy plan release-all-prompts`
* **Updates:** `prompts/*.md` (YAML front matter + freetext)
* Sets all prompts in_progress status to false

#### complete
* Syntax: `envoy plan complete`
* **Reads:** `plan.md` (YAML front matter + freetext), `prompts/*.md` (YAML front matter + freetext), `user_input.md` (freetext only)
* **Writes:** `summary.md` (freetext only)
* **Updates:** `plan.md` (sets stage to completed)
* Generates summary with Gemini based on:
    * Git diff against base branch
    * Plan context
    * Prompt files full context (including walkthroughs)
    * user_input.md
* Pushes code changes to remote feature branch
* Creates PR using gh cli with generated summary as PR body
* Returns: { success: boolean, pr_url: string }

---

## Cross-Phase Context

### Implementation Protocol (Phase 9)
The implementation protocol uses these commands:

Step 1: Call `envoy plan read-prompt <prompt_num> [<variant>]` to get full prompt context

Step 3: Call `envoy plan start-prompt <PROMPT_NUM> [<VARIANT>] --specialist "<AGENT_NAME>" --worktree "<WORKTREE_BRANCH>"`

Step 5: **Initialize ITERATION = 1, REFINEMENT_REASON = ""**

Step 8: **Call `envoy plan record-implementation <PROMPT_NUM> [<VARIANT>] --walkthrough "<STRUCTURED_WALKTHROUGH>" --iteration <ITERATION> [--refinement-reason "<REFINEMENT_REASON>"]`**

Step 15: Call `envoy plan complete-prompt <PROMPT_NUM> [<VARIANT>]`

### Debugging Protocol (Phase 9)
Extends implementation protocol with debug-specific iteration handling.

### /continue Command (Phase 11)
Step 1: Call `envoy plan next [-n <count>]` to get next prompts

### Documentor Workflow (Phase 10)
**extract-workflow** step 1: Retrieve prompt walkthrough via `envoy plan get-prompt-walkthrough <prompt_num> [<variant>]`
**extract-workflow** step 6: Call `envoy plan mark-prompt-extracted <prompt_num> [<variant>]`

### Claude Hooks (Phase 12)
**startup**: Release all prompt files in_progress status by using `envoy plan release-all-prompts`

### /continue Command (Phase 11)
Step 9: Call `envoy plan complete` to generate summary, create PR, and mark plan as completed

### Worktree Branch Naming
Implementation worktrees follow pattern: `<FEATURE_BRANCH>--implementation-<PROMPT_NUM>[-<VARIANT>]`

Uses `--` separator because git can't create `branch/subbranch` if `branch` already exists.

This naming convention signals to git checkout hook to skip plan matter creation. All envoy plan commands read from FEATURE_BRANCH's plan directory, not the worktree.

---

## Success Criteria
- [ ] `envoy plan next` returns next available prompts respecting dependencies
- [ ] `envoy plan next` pulls all variants together when one is selected
- [ ] `envoy plan next -n 3` returns up to 3 independent prompts
- [ ] `envoy plan start-prompt` sets in_progress and records tracking info
- [ ] `envoy plan record-implementation` appends walkthrough correctly
- [ ] `envoy plan record-implementation` preserves previous iterations
- [ ] `envoy plan complete-prompt` sets status to merged
- [ ] `envoy plan get-prompt-walkthrough` returns full documentation context
- [ ] `envoy plan mark-prompt-extracted` sets extraction flag
- [ ] `envoy plan release-all-prompts` clears all in_progress flags
- [ ] `envoy plan complete` generates summary with Gemini
- [ ] `envoy plan complete` creates PR with summary as body
- [ ] `envoy plan complete` sets plan stage to completed
