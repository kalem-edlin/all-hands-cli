---
description: Create a new specialist agent for domain expertise
argument-hint: [initial context]
---

<objective>
Create a new specialist agent tailored to a specific domain. Gathers requirements via input gate, delegates to curator for implementation, runs audit, and manages testing/merge workflow.
</objective>

<context>
Current branch: !`git branch --show-current`
Available envoy commands: !`envoy --help`
Existing agents: !`ls -la .claude/agents/`
</context>

<process>
<step name="setup_branch">
Create curator branch on top of current branch:
- Infer name from initial context (e.g., `curator/create-auth-specialist`)
- This branch will NOT follow any planning material
</step>

<step name="input_gate">
Gather specialist requirements:

1. **Responsibility**:
   AskUserQuestion: "What is this agent's primary responsibility? (This infers which skills it uses)"

2. **Area of expertise**:
   AskUserQuestion: "Which codebase files/areas does this agent specialize in?"

3. **Existing skills**:
   Show available skills, ask: "Which existing skills should this agent have access to?"

4. **New skills needed**:
   AskUserQuestion: "Any new skills needed? If yes, provide: skill name, purpose, reference URLs"
   - If new skills: will need to run /create-skill after specialist creation

5. **Envoy usage**:
   Show envoy commands (from context), ask: "Which envoy commands should this agent use?"
</step>

<step name="curator_create">
Delegate to **curator agent** with curation-workflow:
* INPUTS: `{ mode: 'create', artifact_type: 'specialist', initial_context: '<input_gate_summary>' }`
* OUTPUTS: `{ success: true, clarifying_questions?: [string] }`

If clarifying_questions returned:
- Present each question to user via AskUserQuestion
- Gather answers and re-delegate with additional context
</step>

<step name="commit_creation">
Commit changes with descriptive message
</step>

<step name="curator_audit">
Delegate to **curator agent** with curation-audit-workflow:
* INPUTS: `{ mode: 'audit', branch_name: '<current_branch>' }`
* OUTPUTS: `{ success: true, amendments_made: boolean }`
</step>

<step name="testing">
AskUserQuestion: "How would you like to test this agent?"
Options: ["Run a sample task", "Skip testing", "Custom test"]

Based on selection:
- If sample task: guide user through invoking the agent
- If custom: let user describe and run test
- If skip: proceed to feedback
</step>

<step name="feedback_loop">
AskUserQuestion: "Testing complete. How to proceed?"
Options: ["Good to merge", "Need changes", "Abandon"]

If "Need changes":
- Gather feedback
- Re-delegate to curator with amendments
- Commit and repeat testing
</step>

<step name="commit_and_merge">
Commit any final changes.

Check branch status:
- Call `envoy git is-base-branch` on parent branch
- If parent is base branch: Create PR via `envoy git create-pr --title "<title>" --body "<body>"`
- If parent has plan matter: Merge back to parent, add updates to curator.md

Report completion with next steps.
</step>
</process>

<success_criteria>
- Curator branch created
- Specialist requirements gathered via input gate
- Curator agent created specialist file
- Audit completed with any amendments
- User testing completed
- Changes committed and merged/PR created
</success_criteria>

<constraints>
- MUST create curator/ branch (not follow planning material)
- MUST show available skills and envoy commands during input gate
- MUST run curator audit after creation
- MUST allow user testing before merge
- MUST handle both base branch and feature branch parents
- All delegations MUST follow INPUTS/OUTPUTS format
</constraints>
