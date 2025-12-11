---
description: Begin planning workflow for current feature branch
argument-hint: [user-prompt]
---

# Planning Workflow

## Step 1: Status Check

Run: `.claude/envoy/envoy plans frontmatter`


- **{exists: false}**: Use AskUserQuestion:
  - Question: "You're on a protected branch. How to proceed?"
  - Options: ["Create a new branch", "Abandon planning mode"]
  - On "Create a new branch" → Create new branch, re-run /plan
  - On "Abandon planning mode" → Continue to address user prompt without planning

- **draft**: Use AskUserQuestion:
  - Question: "Draft plan exists. How to proceed?"
  - Options: ["Continue drafting", "Start fresh (new branch)", "Decline planning"]
  - On "Continue drafting" → Delegate to planner: "continue draft, incorporate prompt"
  - On "Start fresh" → Create new branch, re-run /plan
  - On "Decline" → Run `envoy plans set-status deactivated`, proceed without planning

- **active**: Check if user's prompt aligns with plan specs.
  - If aligned → Read plan, continue implementation (skip planner)
  - If misaligned → Use AskUserQuestion:
    - Question: "Active plan exists but prompt seems unrelated. Options?"
    - Options: ["Add to plan", "New branch for this work", "Proceed without planning"]
    - Handle each appropriately

## Step 1.5: Intake Gate (New Plans Only)

**Trigger**: When creating a new plan AND user prompt lacks specifics.

**Skip if**: Continuing draft (context exists) or prompt already detailed.

**Structured questioning** via AskUserQuestion:

1. **Scope**: "What specifically needs to be built/changed?"
   - Options based on inferred type: [Feature, Bug fix, Refactor, Research, Other]

2. **Constraints**: "Any constraints or requirements?"
   - Options: [Performance critical, Must maintain backwards compat, Specific tech stack, None/flexible]

3. **Dependencies**: "Dependencies or blockers?"
   - Options: [Depends on external API, Needs design review, Blocked by other work, None]

4. **Success criteria**: "How will we know it's done?"
   - Options: [Tests pass, User can X, Performance target, Manual verification]

**Package intake answers** with original prompt for planner delegation.

---

## Step 2: Gather Specialist Context

Check agent descriptions for relevant specialists (exclude researcher/planner/explorer).

- **Specialists found**: Use `/parallel-discovery` to dispatch specialists + explorer simultaneously
  - Query specialists: "What repo context/patterns relevant to: {prompt}?"
  - Query explorer: "What code structure/implementation relevant to: {prompt}?"
- **None found**: Dispatch **explorer** agent to analyze relevant directories:
  - Query: "Analyze codebase patterns relevant to: {prompt}"
  - Explorer uses repomix-extraction to gather context
  - Returns patterns/conventions for planner to incorporate

## Step 3: Delegate to Planner

Send to planner agent:
- Directive: "create new plan" | "continue draft" | "add to plan"
- User's original prompt
- **Intake answers** (scope, constraints, dependencies, success criteria) if gathered
- Current branch name
- Specialist findings

## Step 4: On Planner Return

Planner returns with status:

- **plan_ready**: Use AskUserQuestion:
  - Question: "Plan ready. Approve to begin implementation?"
  - Options: ["Approve", "Needs changes"]
  - On "Approve" → Read `.claude/plans/<branch>/plan.md`, then run `/parallel-orchestration` to check for parallel work streams
  - On "Needs changes" → User provides feedback via Other, re-delegate to planner with feedback

- **Planning declined** → Proceed with user's original request without planning
- **Cancelled** → No action needed
