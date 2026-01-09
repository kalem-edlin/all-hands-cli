---
description: Deep dive into the plan lifecycle system - the orchestration layer for multi-prompt implementation workflows. Covers plan directory structure, prompt states, gates, and findings.
---

# Plan Lifecycle System

## Overview

The plan system orchestrates complex implementation workflows by breaking them into discrete prompts with dependency tracking, user gates, and audit trails. Plans are branch-scoped and stored in `.claude/plans/<sanitized-branch>/`.

## Directory Structure

```
.claude/plans/<branch>/
├── plan.md              # Plan overview with front-matter
├── user_input.md        # Accumulated user context
├── summary.md           # Generated PR summary (on completion)
├── curator.md           # Curator notes (optional)
├── prompts/
│   ├── 1.md             # Prompt 1 (standalone)
│   ├── 2_A.md           # Prompt 2 variant A
│   ├── 2_B.md           # Prompt 2 variant B
│   └── 3.md             # Prompt 3
├── findings/
│   ├── frontend.yaml    # Frontend specialist findings
│   └── backend.yaml     # Backend specialist findings
├── archived_findings/   # Archived after plan approval
├── design/
│   ├── manifest.yaml    # Design asset manifest
│   └── *.png            # Design screenshots
└── feedback/
    ├── findings_gate.yaml
    ├── plan_gate.yaml
    └── *_testing.yaml
```

## Plan Stages

Plans progress through stages tracked in `plan.md` front-matter:

| Stage | Description |
|-------|-------------|
| `draft` | Initial creation, collecting user input |
| `in_progress` | Implementation underway |
| `completed` | All prompts merged, PR created |

## Prompt States

Each prompt file tracks state in YAML front-matter:

| Status | Description |
|--------|-------------|
| `pending` | Not yet started |
| `implemented` | Code written, awaiting review |
| `reviewed` | Passed Gemini review |
| `tested` | Passed manual testing (if required) |
| `merged` | Merged to feature branch |

### Prompt Front-Matter

```yaml
---
number: 1
variant: null
description: "Implement auth middleware"
success_criteria: "Requests without valid JWT return 401"
depends_on: []
kind: feature  # or "debug"
relevant_files:
  - src/middleware/auth.ts
  - src/types/auth.ts
status: pending
in_progress: false
requires_manual_testing: false
delegated_to: null
worktree_branch_name: null
current_iteration: 0
planned_at: "2024-01-10T12:00:00Z"
walkthrough: []
---

# Approach & Plan

Implementation notes...
```

## Findings System

During discovery, specialists write findings with approaches:

```yaml
# findings/frontend.yaml
specialist_name: frontend
notes: |
  React 18 with TypeScript
  Tailwind for styling
approaches:
  - number: 1
    variant: null
    description: "Implement form validation"
    relevant_files:
      - src/components/Form.tsx
    required_clarifying_questions:
      - question: "Use Zod or Yup for validation?"
    approach_detail: |
      Detailed implementation plan...
```

### Variant Approaches

When multiple solutions exist, use variants:

```yaml
approaches:
  - number: 2
    variant: A
    description: "Client-side validation only"
  - number: 2
    variant: B
    description: "Server-side validation with client hints"
```

## Gate System

Gates block execution until user provides input. Each gate creates a feedback YAML file that the user edits.

### Findings Gate

Blocks after discovery for user to review specialist approaches.

```bash
envoy plan block-findings-gate
```

**Feedback file** (`feedback/findings_gate.yaml`):
```yaml
done: false
thoughts: ""
approach_feedback:
  frontend_1:
    user_required_changes: ""
  frontend_2_A:
    user_required_changes: ""
    rejected: false
  frontend_2_B:
    user_required_changes: ""
    rejected: false
```

User sets `done: true` after review. Rejected variants are deleted.

### Plan Gate

Blocks after planning for user to review prompts.

```bash
envoy plan block-plan-gate
```

**Feedback file** (`feedback/plan_gate.yaml`):
```yaml
done: false
thoughts: ""
user_required_plan_changes: ""
prompt_feedback:
  "1":
    user_required_changes: ""
  "2_A":
    user_required_changes: ""
```

### Testing Gate

Blocks after implementation for manual testing.

```bash
envoy plan block-prompt-testing-gate <prompt_num> [variant]
```

Creates both YAML feedback and sibling `.logs` file for capturing test output.

### Variants Gate

Blocks after all variants tested for user selection.

```bash
envoy plan block-prompt-variants-gate <prompt_num> <variant>
```

User selects: `accepted`, `rejected`, or `feature-flag`.

### Debugging Logging Gate

For debug prompts - blocks to capture debug output.

```bash
envoy plan block-debugging-logging-gate <prompt_num> [variant]
```

## Dependency Management

Prompts declare dependencies via `depends_on` array:

```yaml
depends_on: [1, 2]  # Depends on prompts 1 and 2
```

Rules:
- Prompts only become available when all dependencies are `merged`
- `validate-dependencies` checks for stale dependencies
- Debug prompts (`kind: debug`) are prioritized in `next` ordering

## Walkthrough Recording

Implementation details are recorded for documentation extraction:

```bash
envoy plan record-implementation <number> [variant] \
  --walkthrough "<markdown>" \
  --iteration <n> \
  [--refinement-reason "<reason>"]
```

Walkthrough structure:
```yaml
walkthrough:
  - iteration: 1
    type: initial
    refinement_reason: null
    approach: "Implemented using middleware pattern..."
    changes: []
    decisions: []
  - iteration: 2
    type: review-refinement
    refinement_reason: "Review found missing edge case"
    approach: "Added null check for..."
```

## Plan Completion

```bash
envoy plan complete
```

This command:
1. Gathers all context (plan, prompts, user input, diff)
2. Generates PR summary via Gemini
3. Writes `summary.md`
4. Updates plan stage to `completed`
5. Pushes branch and creates PR

## Protocol System

Protocols define reusable workflows with inheritance:

```bash
envoy plan protocol <name>
```

Protocols live in `.claude/protocols/` and support `extends` for inheritance.

## Key Library Functions

| Function | Purpose |
|----------|---------|
| `planExists()` | Check if plan directory exists |
| `readPlan()` | Read plan.md with front-matter |
| `readAllPrompts()` | Read all prompt files |
| `readPrompt(num, variant)` | Read specific prompt |
| `writePrompt(num, variant, fm, content)` | Write prompt file |
| `updatePromptStatus(num, variant, status)` | Update status |
| `getPromptId(num, variant)` | Format prompt ID (e.g., "2_A") |
| `parsePromptId(id)` | Parse prompt ID |
