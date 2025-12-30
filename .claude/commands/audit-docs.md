---
description: Audit existing documentation for accuracy and completeness
argument-hint: [...paths] [optional concerns]
---

<objective>
Audit documentation or codebase directories for accuracy, completeness, and consistency. Delegates to documentor agents for analysis, presents findings to user, and implements accepted fixes.
</objective>

<context>
Current branch: !`git branch --show-current`
Base branch: !`.claude/envoy/envoy git get-base-branch`
</context>

<process>
<step name="setup_branch">
1. Checkout base branch: `.claude/envoy/envoy git checkout-base`
2. Create docs/ branch with inferred name (e.g., `docs/audit-readme`)
</step>

<step name="parse_arguments">
Parse $ARGUMENTS:
- Extract paths (files or directories to audit)
- Extract optional user concerns (text after paths)

If no paths provided:
- Default to common documentation locations: README.md, docs/, .claude/
</step>

<step name="determine_scope">
Analyze paths to determine how to break up work:

| Scope | Action |
|-------|--------|
| Single file | Single documentor agent |
| Multiple files, same domain | Single documentor agent |
| Multiple directories or mixed domains | Multiple documentor agents in parallel |
</step>

<step name="delegate_audit">
Delegate to **documentor agent(s)** with audit-workflow:
* INPUTS: `{ mode: 'audit', feature_branch: '<current_branch>', scope_paths: [<paths>], concerns: '<user_concerns>' }`
* OUTPUTS: `{ success: true, findings: [...] }`

If multiple agents needed, run in parallel.
</step>

<step name="present_findings">
Aggregate findings from all agents and present to user:

For each finding:
- File/section affected
- Issue identified
- Suggested fix

AskUserQuestion: "Review findings. Accept all, or provide direction?"
Options: ["Accept all fixes", "Accept with modifications", "Provide additional context", "Cancel"]

Gather user decisions.
</step>

<step name="implement_fixes">
Delegate to single **documentor agent** with audit-workflow:
* INPUTS: `{ mode: 'audit', feature_branch: '<current_branch>', user_decisions: '<decisions>' }`
* OUTPUTS: `{ success: true }`

This agent implements all accepted fixes and user modifications.
</step>

<step name="create_pr">
Commit changes with descriptive message.
Create PR: `.claude/envoy/envoy git create-pr --title "docs: audit [scope]" --body "<summary_of_fixes>"`

Report completion with PR link.
</step>
</process>

<success_criteria>
- Base branch checked out
- Docs branch created
- Scope correctly determined from paths
- Documentor agents completed audit
- Findings presented to user
- Accepted fixes implemented
- PR created
</success_criteria>

<constraints>
- MUST checkout base branch before creating docs/ branch
- MUST present findings to user before implementing
- MUST respect user decisions on which fixes to apply
- MUST create PR via envoy git command
- All delegations MUST follow INPUTS/OUTPUTS format
</constraints>
