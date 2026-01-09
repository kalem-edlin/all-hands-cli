---
description: Initialize documentation for codebase (full documentation generation)
argument-hint: [...optional paths] [optional context]
---

<objective>
Create comprehensive documentation for the codebase from scratch. Uses taxonomy-based approach with parallel documentation writers working in worktree isolation.
</objective>

<context>
Current branch: !`git branch --show-current`
Base branch: !`envoy git get-base-branch`
</context>

<process>
<step name="setup_branch">
1. Checkout base branch: `envoy git checkout-base`
2. Create docs branch: `docs/init-<timestamp>` or inferred from context
</step>

<step name="parse_arguments">
Parse $ARGUMENTS:
- Extract paths (directories to document)
- Extract optional user context

If no paths provided:
- Document entire codebase
- Focus on: src/, lib/, packages/, app/ directories
</step>

<step name="delegate_to_taxonomist">
Delegate to **documentation-taxonomist agent** with init-workflow:

**INPUTS:**
```yaml
mode: "init"
scope_paths: [<parsed_paths or defaults>]
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
```
</step>

<step name="parallel_writers">
For each segment from taxonomist, delegate to **documentation-writer agent** in parallel:

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

All writers run in parallel using worktree isolation.
</step>

<step name="merge_worktrees">
After all writers complete:

1. For each worktree branch, merge to main docs branch:
   ```bash
   git merge <worktree_branch> --no-ff -m "docs: merge <domain> documentation"
   ```

2. Clean up worktrees:
   ```bash
   git worktree remove .trees/docs-<domain>
   git branch -d <worktree_branch>
   ```
</step>

<step name="validate_docs">
Run validation: `envoy docs validate`

If stale/invalid refs found:
- Present findings to user
- Delegate single writer with fix-workflow if user approves
</step>

<step name="create_pr">
Create PR:
```bash
envoy git create-pr --title "docs: initialize codebase documentation" --body "<summary>"
```

Report completion with PR link.
</step>
</process>

<success_criteria>
- Base branch checked out
- Docs branch created
- Taxonomist segmented codebase
- Writers created docs in parallel (worktrees)
- Worktrees merged to docs branch
- Validation passed
- PR created
</success_criteria>

<constraints>
- MUST checkout base branch first
- MUST use taxonomist for segmentation
- MUST run writers in parallel with worktrees
- MUST merge all worktrees back
- MUST validate before PR
- MUST clean up worktrees after merge
- All delegations MUST follow INPUTS/OUTPUTS format
</constraints>
