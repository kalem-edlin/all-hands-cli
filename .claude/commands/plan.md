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

## Step 2: Gather Specialist Context

Check agent descriptions for relevant specialists (exclude researcher/planner).

- **Specialists found**: Use `/parallel-discovery` to dispatch specialists + explorer simultaneously
  - Query specialists: "What repo context/patterns relevant to: {prompt}?"
  - Query explorer: "What code structure/implementation relevant to: {prompt}?"
- **None found**: Use **AskUserQuestion**:
  - Question: "No specialist for this domain. How to proceed?"
  - Options: ["Spawn worker to create specialist", "Proceed without specialist", "Cancel"]
  - On "Spawn worker to create specialist" → Run `/curation-fix Create specialist agent for {domain} using specialist-builder skill`, then continue to Step 3
  - On "Proceed without specialist" → Continue to Step 3
  - On "Cancel" → End workflow

## Step 3: Delegate to Planner

Send to planner agent:
- Directive: "create new plan" | "continue draft" | "add to plan"
- User's original prompt
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
