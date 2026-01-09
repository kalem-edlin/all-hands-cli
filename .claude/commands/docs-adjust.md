---
description: Update documentation incrementally based on code changes
argument-hint: [--diff] [optional paths or context]
---

<objective>
Update documentation incrementally based on recent code changes or user-specified scope. Uses taxonomy-based approach for targeted documentation updates.
</objective>

<context>
Current branch: !`git branch --show-current`
Base branch: !`envoy git get-base-branch`
</context>

<process>
<step name="parse_arguments">
Parse $ARGUMENTS:
- `--diff` flag: use git diff to find changed files
- Paths: specific directories/files to document
- Context: user-provided guidance

Determine mode:
- If `--diff`: get changed files from git
- If paths: use provided paths
- If neither: ask user for scope
</step>

<step name="get_changed_files">
If `--diff` mode:
```bash
envoy git diff-base --summary
```
Extract file paths from `changed_files[].path` in the response.

Filter to source files only (exclude tests, configs, etc. unless explicitly requested).
</step>

<step name="delegate_to_taxonomist">
Delegate to **documentation-taxonomist agent** with adjust-workflow:

**INPUTS:**
```yaml
mode: "adjust"
changed_files: [<list from git diff or user paths>]
user_request: "<optional context from user>"
feature_branch: "<current_branch>"
```

**OUTPUTS:**
```yaml
success: true
segments:
  - domain: "<domain-name>"
    files: ["<glob-patterns>"]
    output_path: "docs/<domain>/"
    worktree_branch: "<branch>/docs-<domain>"
    depth: "overview" | "detailed" | "comprehensive"
    notes: "<guidance>"
    action: "create" | "update"
```
</step>

<step name="parallel_writers">
If multiple segments, delegate to **documentation-writer agents** in parallel.

If single segment, delegate to single writer.

**INPUTS (per writer):**
```yaml
mode: "write"
domain: "<segment.domain>"
files: <segment.files>
output_path: "<segment.output_path>"
worktree_branch: "<segment.worktree_branch>"
depth: "<segment.depth>"
notes: "<segment.notes>"
```

**OUTPUTS:**
```yaml
success: true
```
</step>

<step name="merge_worktrees">
For each worktree branch:
1. Merge to feature branch
2. Clean up worktree and branch
</step>

<step name="validate_and_report">
Run validation: `envoy docs validate`

If in workflow context (called from /continue):
- Return success without creating PR
- Let parent workflow handle PR

If standalone:
- Create PR if changes made
- Report completion
</step>
</process>

<workflow_integration>
When called from `/continue` or implementation workflow:
- Skip PR creation
- Return `{ success: true }` for workflow to continue
- Validation warnings go to workflow orchestrator

When called standalone:
- Create PR with changes
- Present validation results to user
</workflow_integration>

<success_criteria>
- Changed files identified (if --diff)
- Taxonomist created targeted segments
- Writers updated relevant docs
- Worktrees merged
- Validation run
- PR created (if standalone)
</success_criteria>

<constraints>
- MUST use taxonomist for intelligent segmentation
- MUST support --diff flag for git-based changes
- MUST work both standalone and in workflow context
- MUST validate after documentation
- MUST clean up worktrees
- All delegations MUST follow INPUTS/OUTPUTS format
</constraints>
