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

<main_agent_role>
Main agent is ORCHESTRATOR ONLY. Do NOT perform any codebase discovery, file analysis, or documentation planning. All discovery work is delegated to the taxonomist agent.

Main agent responsibilities:
1. Parse arguments (paths, flags, context)
2. Verify clean git state
3. Delegate to taxonomist with raw inputs
4. Orchestrate writers based on taxonomist output
5. Handle merging, validation, and PR creation
</main_agent_role>

<process>
<step name="parse_arguments">
Parse $ARGUMENTS:
- `--diff` flag: pass to taxonomist for git-based discovery
- Paths: pass to taxonomist as scope
- Context: pass to taxonomist as user guidance

Do NOT run discovery commands - pass raw inputs to taxonomist.
</step>

<step name="ensure_committed_state">
Before delegating to taxonomist, verify clean git state:

1. Check for uncommitted changes:
   ```bash
   git status --porcelain
   ```

2. If changes exist:
   - Use AskUserQuestion: "Uncommitted changes detected. Documentation requires committed state for valid reference hashes."
   - Options:
     - "Commit now" - propose message, gate for approval
     - "Stash and continue" - `git stash`
     - "Cancel" - abort workflow

3. If "Commit now":
   - Run `git diff --cached --stat` for context
   - Propose commit message based on staged changes
   - Gate for user approval
   - Execute: `git add -A && git commit -m "<approved message>"`

4. If "Stash and continue":
   - Execute: `git stash push -m "pre-docs stash"`
   - Note: remind user to `git stash pop` after docs complete

5. Verify clean state before proceeding:
   ```bash
   git status --porcelain
   ```
   Must return empty.
</step>

<step name="delegate_to_taxonomist">
Delegate to **documentation-taxonomist agent** with adjust-workflow.

Taxonomist handles ALL discovery: analyzing codebase, checking existing docs, identifying affected domains, creating directory structure.

**INPUTS:**
```yaml
mode: "adjust"
use_diff: true | false  # from --diff flag
scope_paths: [<paths from arguments, if any>]
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

Merge completed writers incrementally as they finish (don't wait for all).
</step>

<step name="merge_worktrees">
As each writer completes:
1. Merge to feature branch
2. Clean up worktree and branch
</step>

<step name="validate_and_report">
Run validation: `envoy docs validate`

If stale/invalid refs found:
- Present findings to user
- Delegate single writer with fix-workflow if user approves
</step>

<step name="commit_documentation">
Commit any uncommitted documentation changes (e.g., validation fixes):

1. Check for uncommitted changes in docs/:
   ```bash
   git status --porcelain docs/
   ```

2. If changes exist:
   ```bash
   git add docs/
   git commit -m "docs: update documentation"
   ```

3. Track documentation files for reindex:
   - Get list of doc files created/modified since branch diverged from base:
   ```bash
   git diff --name-only $(git merge-base HEAD <base_branch>)..HEAD -- docs/
   ```
   - Store this list for the reindex step
</step>

<step name="reindex_knowledge">
Update semantic search index with changed documentation:

1. Build file changes JSON from tracked doc files:
   ```json
   [
     {"path": "docs/domain/index.md", "added": true},
     {"path": "docs/domain/subdomain/index.md", "modified": true}
   ]
   ```
   - Use `added: true` for new files
   - Use `modified: true` for updated files
   - Use `deleted: true` for removed files

2. Call reindex:
   ```bash
   envoy knowledge reindex-from-changes docs --files '<json_array>'
   ```

3. If reindex reports missing references:
   - Log warning but continue (docs may reference code not yet indexed)
</step>

<step name="finalize">
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
- Documentation committed
- Knowledge index updated
- PR created (if standalone)
</success_criteria>

<constraints>
- MUST NOT perform codebase discovery - delegate ALL discovery to taxonomist
- MUST NOT run envoy docs tree, envoy docs complexity, or envoy knowledge search
- MUST verify clean git state before documentation (ensure_committed_state step)
- MUST delegate to taxonomist for all segmentation and discovery
- MUST pass --diff flag to taxonomist (not process it directly)
- MUST work both standalone and in workflow context
- MUST validate after documentation
- MUST clean up worktrees
- MUST commit documentation changes before reindex (reindex reads from disk)
- MUST reindex knowledge base after documentation committed
- All delegations MUST follow INPUTS/OUTPUTS format
</constraints>
