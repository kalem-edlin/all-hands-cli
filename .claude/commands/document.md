---
description: Initialize documentation for codebase (full documentation generation)
argument-hint: [...optional paths] [optional context]
---

<objective>
Create comprehensive documentation for the codebase from scratch. Uses taxonomy-based approach with parallel documentation writers. Taxonomist ensures non-overlapping output directories, so writers work directly on the branch without conflicts. Includes confirmation workflow to audit coverage and generate README files.
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
4. Delegate to taxonomist for init workflow
5. Orchestrate writers based on taxonomist assignments (up to 15 agents)
6. Delegate to taxonomist for confirmation workflow (coverage audit + READMEs)
7. Handle redelegation if gaps found
8. Handle overflow if 15-agent limit reached
9. Validation, commit, and PR creation
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

<step name="delegate_to_taxonomist_init">
Delegate to **documentation-taxonomist agent** with init-workflow.

Taxonomist handles ALL discovery: workspace detection, domain classification, subdomain analysis, technology detection, agent allocation, and directory creation.

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
structure_created: true
assignments:
  - domain: "<domain-name>"
    domain_type: "simple" | "medium" | "complex"
    doc_directory: "docs/<domain>/"
    subdomains:
      - name: "<subdomain-name>"
        doc_directory: "docs/<domain>/<subdomain>/"
        source_directories: [...]
        critical_technologies: [...]
        target_file_count: 3-6
        complexity_score: 0.75
    coverage_requirement: "full"
    existing_docs: [...]
    notes: "..."
uncovered_domains: []  # domains that couldn't fit in 15-agent limit
```

**Store `assignments` for use in confirmation workflow.**
</step>

<step name="parallel_writers">
For each assignment from taxonomist, delegate to **documentation-writer agent** in parallel.

**Agent allocation:**
- Simple domain: 1 agent
- Medium domain: 1-2 agents (split subdomains)
- Complex domain: 2-3 agents (group subdomains)

**Maximum 15 agents per run.** If taxonomist returns `uncovered_domains`, handle after this run completes.

**INPUTS (per writer):**
```yaml
mode: "write"
domain: "<assignment.domain>"
subdomains: <assignment.subdomains>  # 1+ subdomains per writer
coverage_requirement: "<assignment.coverage_requirement>"
existing_docs: <assignment.existing_docs>
notes: "<assignment.notes>"
```

**OUTPUTS:**
```yaml
success: true
files_created: [...]
coverage_gaps: []  # any gaps found
```

Writers work directly on the branch without committing. Taxonomist ensures non-overlapping output directories, so no conflicts occur.

**Launch all agents in parallel using single message with multiple Task tool calls.**
</step>

<step name="delegate_to_taxonomist_confirm">
After ALL writers complete, delegate to **documentation-taxonomist agent** with confirmation workflow.

This step audits coverage, generates README files, and handles redelegation if gaps found.

**INPUTS:**
```yaml
mode: "confirm"
original_assignments: <assignments from init workflow>
doc_directory: "docs/"
```

**OUTPUTS:**
```yaml
success: true
coverage_complete: true | false
gaps_found: []  # if any
redelegation_assignments: []  # if gaps found
readmes_written: ["docs/domain1/README.md", ...]
```

**Note:** README.md files provide navigation but are excluded from validation and knowledge indexing.

**If `redelegation_assignments` returned:**
1. Dispatch additional writers for gap coverage
2. Re-invoke confirmation workflow
3. Repeat until `coverage_complete: true` or max 2 redelegation rounds

**If `gaps_found` after redelegation attempts:**
- Report gaps to user
- Continue with commit (partial coverage better than none)
</step>

<step name="handle_overflow">
If taxonomist returned `uncovered_domains` in init workflow:

1. After current documentation committed and PR created
2. Report to user: "Documentation complete for {N} domains. {M} domains remain: {list}"
3. User can reinvoke `/document` for remaining domains
4. Do NOT automatically reinvoke - let user decide timing
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
   git commit -m "docs: initialize codebase documentation"
   ```
</step>

<step name="reindex_knowledge">
Update semantic search index with new documentation:

```bash
envoy knowledge reindex-from-changes
```

Command auto-detects doc changes from git merge-base. README.md files excluded automatically.

If reindex reports missing references, log warning but continue (docs may reference code not yet indexed).
</step>

<step name="create_pr">
Create PR:
```bash
envoy git create-pr --title "docs: initialize codebase documentation" --body "<summary>"
```

**Summary should include:**
- Number of domains documented
- Number of files created
- Any remaining gaps or uncovered domains
- Critical technologies documented

Report completion with PR link.
</step>
</process>

<success_criteria>
- Branch setup complete (docs branch from base OR stay on feature)
- Taxonomist segmented codebase with workspace detection and complexity classification
- Writers created docs in parallel (up to 15 agents)
- Confirmation workflow completed (coverage audit + READMEs)
- Validation passed (README.md excluded from validation)
- Documentation committed
- Knowledge index updated (README.md excluded from indexing)
- PR created
- Any overflow domains reported for future runs
</success_criteria>

<constraints>
- MUST NOT perform codebase discovery - delegate ALL discovery to taxonomist
- MUST NOT run envoy docs tree, envoy docs complexity, or envoy knowledge search
- MUST verify clean git state before documentation (ensure_committed_state step)
- MUST only create docs branch if already on base branch
- MUST delegate to taxonomist for init workflow (assignments)
- MUST delegate to taxonomist for confirmation workflow (audit + READMEs)
- MUST run writers in parallel (max 15 agents per run)
- MUST handle redelegation if confirmation finds gaps
- MUST report overflow domains if 15-agent limit exceeded
- MUST validate before PR
- MUST commit documentation changes before reindex (reindex reads from disk)
- MUST reindex knowledge base after documentation committed
- All delegations MUST follow INPUTS/OUTPUTS format
</constraints>
