<goal>
Structured, domain-aware mid-execution scope adjustment. Per **Quality Engineering**, initiative steering provides deep replanning when ad-hoc coordinator patches are insufficient. Per **Frontier Models are Capable**, the workflow domain config drives what to explore and what to ask — the agent deduces how to steer from domain knowledge and current execution state.
</goal>

<constraints>
- MUST read the workflow domain config, active spec, alignment doc, and all current prompt files before steering
- MUST NOT add prompt summaries for created prompts — per **Prompt Files as Units of Work**, summaries are written by executing agents after completion
- MUST reset `core_consolidation` to `pending` in alignment doc frontmatter when initiative goals change
- MUST follow append-only numbering and dependency patching patterns for all prompt changes
- MUST NOT ask for human intervention during execution (aside from the Steering Interview phase)
- MUST set `stage: 'steering'` on `status.yaml` on entry and restore `stage: 'executing'` on exit
</constraints>

## Stage Management — Entry

Pause prompt spawning before any analysis. Per **Quality Engineering**, active executors continue but no new prompts are picked up during steering.

- Derive `status.yaml` path from `ALIGNMENT_PATH` (same directory, replace `alignment.md` with `status.yaml`)
- Read `status.yaml` and record the current `stage` value
- Set `stage: 'steering'` in `status.yaml`

## Context Gathering

Ground against current execution state — this is the core difference from spec planning, which grounds against the spec alone.

- Read the workflow domain config at `WORKFLOW_DOMAIN_PATH`
- Read the active spec at `SPEC_PATH`
- Read the alignment doc at `ALIGNMENT_PATH` — note Overview goals, prior prompt summaries, engineer decisions, any existing steering amendments
- List and read all prompt files in `PROMPTS_FOLDER`:
  - Categorize by status: `done`, `in_progress`, `pending`, `blocked`
  - Note dependency graph and identify the execution frontier
- Assess implementation state:
  - Check `git diff` and `git log` on `BRANCH` for recent commits
  - Compare completed work (prompt summaries) against spec goals
  - Identify gaps, risks, and drift between plan and reality
- Run `ah solutions search "<steering context keywords>"` for relevant past solutions
- Run `ah memories search "<steering context keywords>"` for relevant learnings

## Deep Grounding

Per **Context is Precious**, focus research on the problem area driving the steering session.

- Spawn 1-2 research subtasks: tell them to read `.allhands/flows/shared/CODEBASE_UNDERSTANDING.md` to understand the specific area under discussion
- Use implementation diffs, completed prompt summaries, and pending prompt tasks as heuristics for current state
- Consolidate findings before proceeding to interview

## Steering Interview

Per **Ideation First**, the engineer drives scope; the domain config drives what to surface.

- Ask domain-specific questions driven by the workflow domain config's Domain Knowledge and Ideation Guidance sections, framed at implementation level against current execution state
- The steering domain (`WORKFLOW_DOMAIN_PATH`) can differ from the spec's `initial_workflow_domain` — e.g., a milestone spec encounters a bug, engineer steers with investigation domain config
- Present researched options with recommended approaches using `AskUserQuestion`
- Ask ONE question at a time — adapt subsequent questions based on previous answers
- Cover at minimum:
  - What is driving the need for steering? (scope change, blocking issue, new information, quality concern)
  - Which areas of the current plan are affected?
  - What is the desired outcome?

## Prompt Modification

Based on interview outcomes, produce prompt insertions, modifications, and/or deletions.

### Creating New Prompts

- Read `.allhands/flows/shared/PROMPT_TASKS_CURATION.md` for prompt creation guidance
- Read `.allhands/flows/shared/UTILIZE_VALIDATION_TOOLING.md` to assign validation suites to new prompts
- Assign the next available prompt number — append-only, NEVER renumber existing prompts
  - Use `getNextPromptNumber()` or derive from highest existing prompt number + 1

### Modifying Existing Prompts

- Only modify prompts with status `pending` or `blocked` — per **Prompt Files as Units of Work**, `done` and `in_progress` prompts are immutable unless engineer explicitly requests
- Update tasks, acceptance criteria, or dependencies as needed
- Document what changed and why in the prompt body

### Deleting Prompts

- Mark prompts for deletion by setting `status: deleted` in frontmatter (preserve audit trail)
- Update dependency references on any prompts that depended on deleted prompts

### Dependency Patching

When inserting between existing prompts, patch the dependency graph:
- New prompt's `dependencies` = the "run after" prompt numbers
- Patch each "run before" prompt's `dependencies` to include the new prompt number
- Verify the resulting execution order is consistent and acyclic

## Alignment Doc Amendment

Per **Knowledge Compounding**, append-only amendments preserve the audit trail.

- Append a `## Steering Amendment` section to the alignment doc (NEVER rewrite existing sections)
- Record in the amendment:
  - **Steering domain**: the workflow domain config used (may differ from spec's `initial_workflow_domain`)
  - **Trigger**: what drove the steering session
  - **User inputs**: engineer decisions from the interview
  - **Prompt changes**: insertions (new prompt numbers and titles), modifications (what changed), deletions (which prompts and why)
- If initiative goals changed:
  - Update the Overview section with new goal context
  - Reset `core_consolidation` to `pending` in alignment doc frontmatter
- Do NOT update the spec's `initial_workflow_domain` field — the steering domain is tracked in the amendment, preserving the spec's original identity
- Do NOT write prompt summaries for newly created prompts

## Stage Management — Exit

Restore prompt spawning after steering is complete.

- Set `stage: 'executing'` in `status.yaml`
- Stop
