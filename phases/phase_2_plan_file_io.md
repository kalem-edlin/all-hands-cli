# Phase 2: Plan File I/O Commands

## Objective
Implement CRUD operations for plan files - reading, writing, and managing plan.md, prompts, and user_input.md.

## Scope
- `envoy plan check`
- `envoy plan write-plan`
- `envoy plan write-prompt`, `clear-prompt`
- `envoy plan read-prompt`, `get-full-plan`
- `envoy plan append-user-input`
- `envoy plan validate-dependencies`, `update-prompt-dependencies`

## Implementation Details

### Plan File Schemas

#### plan.md (YAML front matter + freetext)
Top-level plan metadata and high-level context.
```yaml
---
# Lifecycle stage of this plan
stage: draft  # draft | in_progress | completed

# Git branch for this plan's work
branch_name: ""

# Audit history (Gemini context reviews)
audits:
  - review_context: ""
    decision: ""  # approved | needs_clarification | rejected
    total_questions: 0
    were_changes_suggested: false

# Review history (implementation reviews)
reviews:
  - review_context: ""
    decision: ""  # approved | needs_changes | rejected
    total_questions: 0
    were_changes_suggested: false
---

# High-Level Context

Free text describing the overall plan objective, scope, and approach.
This section is appended to / edited as planning evolves.
```

#### user_input.md (freetext only)
Append-only log of user thoughts, refinements, and feedback.
```markdown
# User Input Log

All user thoughts, refinements, and feedback are appended here chronologically.
Content is automatically appended by:
- Input gate processing (thoughts field from user_feedback files)
- Direct user_feedback file processing
```

#### curator.md (freetext only)
Append-only curation workflow notes.
```markdown
# Curation Notes

Free text updates from curation workflows to be included in PR.
Content is appended to bottom as curation progresses.
```

#### prompts/{N}.md or prompts/{N}{V}.md (YAML front matter + freetext)
Individual prompt specification with front matter and freetext approach section.
```yaml
---
# Prompt identifier
number: 1
variant: null  # null | A | B | ... | Z

# Human-readable summary (3 sentences: what it solves, approach elected, key considerations)
description: ""

# Prompt classification
kind: feature  # debug | feature

# Files this prompt will modify or create
relevant_files:
  - "src/components/Example.tsx"
  - "src/lib/utils.ts"

# Measurable criteria for completion
success_criteria: ""

# Prompt dependencies (must be completed first)
depends_on: []  # list of prompt numbers

# Does this require manual user testing?
requires_manual_testing: false

# Is an agent currently working on this prompt?
in_progress: false

# Tracks which iteration for re-implementation loops
current_iteration: 1

# Review history for this prompt's implementation
reviews:
  - review_context: ""
    decision: ""  # approved | needs_changes | rejected
    total_questions: 0
    were_changes_suggested: false

# Which specialist is assigned (if applicable)
delegated_to: null  # frontend | backend | fullstack | null

# Git worktree branch for parallel work
worktree_branch_name: null

# Prompt lifecycle status
status: unimplemented  # unimplemented | implemented | reviewed | tested | merged

# Variant resolution (only for variant prompts)
variant_solution: null  # discard | accept | feature-flag | null

# Design file references
design_files:
  - path: "designs/mockup.png"
    description: ""

# Implementation walkthrough (accumulated across iterations, used by documentor agent)
walkthrough:
  - iteration: 1
    type: initial  # initial | review-refinement | testing-refinement
    refinement_reason: null  # null for initial, describes what triggered re-implementation
    approach: ""
    changes:
      - file: "src/example.ts"
        description: ""
    decisions:
      - decision: ""
        rationale: ""

# Has documentor agent processed this prompt's walkthrough?
documentation_extracted: false

# When this prompt was written/planned
planned_at: "2024-01-15T10:30:00Z"  # ISO 8601 timestamp
---

# Approach & Plan

Free text describing the implementation approach, design considerations, and technical details.
May reference specific files where implementation should occur.
May reference design files where visual specifications are important.
```

### Commands

#### check
* Syntax: `envoy plan check`
* **Reads:** `plan.md` (YAML front matter + freetext), `user_input.md` (freetext), `summary.md` (freetext), `prompts/*.md` (YAML front matter + freetext)
* Get the current status of the plan and any required context for the main agent to continue workflows that depend on it
* Returns
    * status
    * If status = draft and user_input.md is populated
        * Return user_input.md contents
    * If status = in_progress
        * Return user_input.md, plan top-level context, and all prompt descriptions
    * If status = completed
        * Return summary.md

#### write-plan
* Syntax: `envoy plan write-plan --title "<title>" --objective "<objective>" --context "<design_doc_context>"`
* **Writes:** `plan.md` (YAML front matter + freetext)
* Params:
    * `--title "<title>"`: Plan title
    * `--objective "<objective>"`: High-level objective
    * `--context "<design_doc_context>"`: Design doc style context

#### write-prompt
* Syntax: `envoy plan write-prompt <number> [<variant>] --files "<file1>,<file2>" --depends-on "<1>,<2>" [--debug] --criteria "<success_criteria>" --context "<full_prompt_context>" [--requires-testing]`
* **Writes:** `prompts/{N}.md` or `prompts/{N}{V}.md` (YAML front matter + freetext)
* Params:
    * `<number>`: Integer prompt number
    * `<variant>`: Optional single letter (A, B, etc.) - omit for non-variant prompts
    * `--files "<file1>,<file2>"`: Comma-separated relevant file paths (project relative)
    * `--depends-on "<1>,<2>"`: Comma-separated prompt numbers this depends on
    * `--debug`: Flag to mark as debugging task (optional)
    * `--criteria "<success_criteria>"`: Success criteria for the prompt
    * `--context "<full_prompt_context>"`: Full approach, implementation notes, etc.
    * `--requires-testing`: Flag if manual user testing required (optional)
* **Automatically sets:**
    * `planned_at`: Current ISO 8601 timestamp

#### clear-prompt
* Syntax: `envoy plan clear-prompt <number> [<variant>]`
* **Deletes:** `prompts/{N}.md` or `prompts/{N}{V}.md` (YAML front matter + freetext)
* Params:
    * `<number>`: Integer prompt number
    * `<variant>`: Optional variant letter

#### read-prompt
* Syntax: `envoy plan read-prompt <prompt_num> [<variant>]`
* **Reads:** `prompts/{N}.md` or `prompts/{N}{V}.md` (YAML front matter + freetext)
* Params:
    * `<prompt_num>`: Integer prompt number
    * `<variant>`: Optional variant letter
* Returns the full context of a prompt file

#### get-full-plan
* Syntax: `envoy plan get-full-plan`
* **Reads:** `plan.md` (YAML front matter + freetext), `prompts/*.md` (YAML front matter + freetext), `summary.md` (freetext), `user_input.md` (freetext)
* Get plan full context
* Get all prompts full context (including walkthrough history)
* Get plan summary if exists
* Get user_input.md context (with label: for reference in what the user has requested over time)

#### append-user-input
* Syntax: `envoy plan append-user-input "<content>"`
* **Appends to:** `user_input.md` (freetext only)
* Params:
    * `"<content>"`: User input content to append (quoted string)

#### validate-dependencies
* Syntax: `envoy plan validate-dependencies`
* **Reads:** `prompts/*.md` (YAML front matter + freetext)
* Validates ALL prompts in the plan to check if any dependencies have changed since planning
* For each prompt with dependencies:
    * Compares the prompt's `planned_at` timestamp with each dependency prompt's `planned_at` timestamp
    * If any dependency prompt has a `planned_at` timestamp newer than the current prompt's `planned_at`, the dependency may be stale
* Returns: {
    valid: boolean (true if all dependencies are still valid),
    stale_prompt_ids: ["1", "2A", "3"]  # Array of prompt identifiers (number + variant if applicable) that have dependencies that were modified after this prompt was planned
  }

#### update-prompt-dependencies
* Syntax: `envoy plan update-prompt-dependencies <number> [<variant>] --depends-on "<1>,<2>"`
* **Updates:** `prompts/{N}.md` or `prompts/{N}{V}.md` (YAML front matter + freetext)
* Params:
    * `<number>`: Integer prompt number
    * `<variant>`: Optional variant letter
    * `--depends-on "<1>,<2>"`: Comma-separated prompt numbers this depends on
* Updates only the `depends_on` field in the prompt file
* Does NOT update `planned_at` (preserves original planning timestamp)
* Note: Use this when adjusting dependency lists after validate-dependencies identifies stale prompts, to avoid cascading planned_at updates

---

## Cross-Phase Context

### Blocking Gates (Phase 7)
Phase 7 will add commands that create user_feedback/*.yaml files and block until user completes them. This phase just handles the core plan file I/O.

### Prompt Lifecycle (Phase 6)
Phase 6 will add state management commands (start-prompt, record-implementation, complete-prompt) that update the prompt status fields defined here.

### Planner Agent (Phase 10)
The planner agent will use these commands to create/modify plans. Understanding the schema helps ensure the commands output correctly formatted files.

---

## Success Criteria
- [ ] `envoy plan check` returns correct status and context
- [ ] `envoy plan write-plan` creates valid plan.md with front matter
- [ ] `envoy plan write-prompt` creates valid prompt files with all fields
- [ ] `envoy plan read-prompt` returns full prompt context
- [ ] `envoy plan get-full-plan` aggregates all plan files
- [ ] `envoy plan append-user-input` appends content correctly
- [ ] `envoy plan validate-dependencies` detects stale dependencies
- [ ] `envoy plan clear-prompt` removes prompt files
