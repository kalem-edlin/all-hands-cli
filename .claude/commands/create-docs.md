---
description: Create documentation for codebase directories
argument-hint: [...optional paths] [optional context]
---

<objective>
Create documentation for codebase directories. Coordinates multiple documentor agents in parallel for large scopes, then audits the created documentation for consistency.
</objective>

<context>
Current branch: !`git branch --show-current`
Base branch: !`.claude/envoy/envoy git get-base-branch`
</context>

<process>
<step name="setup_branch">
1. Checkout base branch: `.claude/envoy/envoy git checkout-base`
2. Create docs/ branch with inferred name (e.g., `docs/create-api-docs`)
</step>

<step name="parse_arguments">
Parse $ARGUMENTS:
- Extract paths (directories to document)
- Extract optional user context (text after paths)

If no paths provided:
- Assume whole codebase needs documentation
- Focus on: src/, lib/, packages/, core directories
</step>

<step name="coordinate_scope">
Delegate to **documentor agent** with coordination-workflow:
* INPUTS: `{ mode: 'coordinate', scope_paths: [<paths>] }`
* OUTPUTS: `{ success: true, chunks: [{ paths, scope_description }] }`

This breaks large scope into parallelizable chunks.
</step>

<step name="parallel_creation">
For each chunk from coordination:

Delegate to **documentor agent** with extract-workflow (in parallel):
* INPUTS: `{ mode: 'create', feature_branch: '<current_branch>', scope: <chunk> }`
* OUTPUTS: `{ success: true }`

All chunk agents run in parallel.
</step>

<step name="audit_created_docs">
After all parallel agents complete:

Delegate to **documentor agent** with audit-workflow:
* INPUTS: `{ mode: 'audit', feature_branch: '<current_branch>' }`
* OUTPUTS: `{ success: true, findings: [...] }`
</step>

<step name="present_findings">
Present audit findings to user:

AskUserQuestion: "Documentation created. Review audit findings?"
Options: ["Accept all", "Modify and accept", "Provide additional direction", "Skip audit fixes"]

Gather user decisions.
</step>

<step name="implement_fixes">
If user accepted fixes or provided direction:

Delegate to single **documentor agent** to implement:
* INPUTS: `{ mode: 'fix', feature_branch: '<current_branch>', user_decisions: '<decisions>' }`
* OUTPUTS: `{ success: true }`
</step>

<step name="create_pr">
Commit changes with descriptive message.
Create PR: `.claude/envoy/envoy git create-pr --title "docs: create documentation for [scope]" --body "<summary>"`

Report completion with PR link.
</step>
</process>

<success_criteria>
- Base branch checked out
- Docs branch created
- Scope coordinated into chunks
- Parallel documentor agents created docs
- Audit completed on created docs
- User reviewed and accepted findings
- PR created
</success_criteria>

<constraints>
- MUST checkout base branch before creating docs/ branch
- MUST use coordination-workflow to break up large scope
- MUST run creation agents in parallel
- MUST audit created documentation
- MUST present audit findings to user
- MUST create PR via envoy git command
- All delegations MUST follow INPUTS/OUTPUTS format
</constraints>
