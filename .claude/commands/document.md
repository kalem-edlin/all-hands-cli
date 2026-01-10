---
description: Initialize documentation for codebase (full documentation generation)
argument-hint: [...optional paths] [optional context]
---

<objective>
Create comprehensive documentation for the codebase from scratch. Uses taxonomy-based approach with parallel documentation writers. Taxonomist ensures non-overlapping output directories, so writers work directly on the branch without conflicts.
</objective>

<context>
Current branch: !`git branch --show-current`
Base branch: !`envoy git get-base-branch`
</context>

<main_agent_role>
Main agent is ORCHESTRATOR ONLY. Do NOT perform any codebase discovery, file analysis, or documentation planning. All discovery work is delegated to the taxonomist agent.

Main agent responsibilities:
1. Setup branch (create docs branch if on base)
2. Parse arguments (paths, context)
3. Verify clean git state
4. Delegate to taxonomist with raw inputs
5. Orchestrate writers based on taxonomist output
6. Handle merging, validation, and PR creation
</main_agent_role>

<process>
<step name="setup_branch">
Check if current branch equals base branch:

**If on base branch:**
1. Create docs branch: `docs/init-<timestamp>`
2. Document from fresh docs branch

**If on feature branch:**
1. Stay on current branch
2. Document from feature branch state (no branch switching)
</step>

<step name="parse_arguments">
Parse $ARGUMENTS:
- Extract paths (pass to taxonomist as scope)
- Extract optional user context (pass to taxonomist)

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
Delegate to **documentation-taxonomist agent** with init-workflow.

Taxonomist handles ALL discovery: analyzing codebase structure, checking existing docs, identifying products/features, creating directory structure, assigning writers.

**INPUTS:**
```yaml
mode: "init"
scope_paths: [<paths from arguments, or empty for full codebase>]
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
depth: "<segment.depth>"
notes: "<segment.notes>"
```

**OUTPUTS:**
```yaml
success: true
```

Writers work directly on the branch without committing. Taxonomist ensures non-overlapping output directories, so no conflicts occur. Main agent commits all changes after writers complete.
</step>

<step name="validate_docs">
Run validation: `envoy docs validate`

If stale/invalid refs found:
- Present findings to user
- Delegate single writer with fix-workflow if user approves
</step>

<step name="commit_documentation">
Commit ALL documentation changes from parallel writers:

1. Check for uncommitted changes in docs/:
   ```bash
   git status --porcelain docs/
   ```

2. If changes exist:
   ```bash
   git add docs/
   git commit -m "docs: finalize documentation"
   ```

3. Track documentation files for reindex:
   - Get list of all doc files created/modified since branch diverged from base:
   ```bash
   git diff --name-only $(git merge-base HEAD <base_branch>)..HEAD -- docs/
   ```
   - Store this list for the reindex step
</step>

<step name="reindex_knowledge">
Update semantic search index with new documentation:

1. Build file changes JSON from tracked doc files:
   ```json
   [
     {"path": "docs/domain/index.md", "added": true},
     {"path": "docs/domain/subdomain/index.md", "added": true}
   ]
   ```
   - Use `added: true` for new files
   - Use `modified: true` for updated files

2. Call reindex:
   ```bash
   envoy knowledge reindex-from-changes --files '<json_array>'
   ```

3. If reindex reports missing references:
   - Log warning but continue (docs may reference code not yet indexed)
   - These will resolve on next full reindex
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
- Branch setup complete (docs branch from base OR stay on feature)
- Taxonomist segmented codebase with non-overlapping output directories
- Writers created docs in parallel
- Validation passed
- Documentation committed
- Knowledge index updated
- PR created
</success_criteria>

<constraints>
- MUST NOT perform codebase discovery - delegate ALL discovery to taxonomist
- MUST NOT run envoy docs tree, envoy docs complexity, or envoy knowledge search
- MUST verify clean git state before documentation (ensure_committed_state step)
- MUST only create docs branch if already on base branch
- MUST delegate to taxonomist for all segmentation and discovery
- MUST run writers in parallel
- MUST validate before PR
- MUST commit documentation changes before reindex (reindex reads from disk)
- MUST reindex knowledge base after documentation committed
- All delegations MUST follow INPUTS/OUTPUTS format
</constraints>
