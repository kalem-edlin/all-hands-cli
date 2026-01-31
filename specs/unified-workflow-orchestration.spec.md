---
name: unified-workflow-orchestration
domain_name: infrastructure
status: completed
dependencies: []
branch: feature/unified-workflow-orchestration
---

# Unified Workflow Orchestration

## Motivation

The harness currently has one workflow: milestone-based feature development. The entire TUI, event loop, planning system, and agent registry are hardcoded to this pipeline: Ideation → Spec → Planner → Execution Loop → Emergent → Review → PR → Compound. This works exceptionally well for milestone-based development but creates three structural problems:

1. **No entry point for exploratory work** — Debugging, optimization, refactoring, documentation, and triage workflows have no way to leverage the harness's prompt-based execution loop. The ideation flow is fitted to milestone spec creation (6-dimension deep interview). The planner assumes all open questions must be resolved via engineer interview before execution. The event loop requires all planned prompts to complete before emergent agents spawn. None of this fits exploratory work where execution IS discovery.

2. **Emergent refinement is coupled to execution** — The current emergent agent (`EMERGENT_REFINEMENT_EXECUTION.md`) both formulates hypotheses AND implements them. This means: a separate agent type (`emergent.yaml`), a separate flow, special spawn logic in the event loop, special window tracking, and a dedicated TUI toggle. All of this exists because the emergent agent is a planner-executor hybrid — but the executor agent already knows how to execute prompts perfectly.

3. **Workflow configuration is over-engineered** — The `workflows/` directory with YAML configs, the `workflows.ts` loader, the `workflow.ts` Zod schema, and the `emergentEnabled` state across TUIState/EventLoopState/ToggleState all exist to control one thing: when emergent agents spawn and what domains they explore. This machinery serves a concern that can be expressed as a field on the spec and a simple condition in the event loop.

The engineer has validated the current milestone pipeline extensively and wants to extend the harness to support the full SDLC — debugging, optimization, refactoring, documentation, triage — while simplifying orchestration. The core insight: all workflows share the same execution primitive (prompt-based loop with hypothesis-driven emergence). They differ only in planning depth and how initial prompts are created, both of which are driven by the spec type and the planner's behavior.

## Goals

### 1. Two-Agent Execution Model: Hypothesis Planner + Executors

Replace the current emergent agent (which plans AND executes in one lifecycle) with a separation of concerns:

- **Hypothesis Planner** — A new agent that reads the alignment doc + prior prompt summaries, formulates 1-N non-overlapping hypotheses, creates prompt files for each, and dies. It is a non-prompt-scoped agent (one instance, not one-per-prompt). It produces prompts that regular executors pick up.
- **Executors** — Unchanged. Pick up prompts from the planning directory and execute them. No distinction between "planned" prompts and "hypothesis" prompts at the executor level.

The event loop becomes: pick pending prompt → spawn executor. When no prompts remain and nothing is in progress → spawn hypothesis planner → it creates more prompts → loop picks them up on next tick. One decision path, not two.

The hypothesis planner can create **multiple prompts per invocation**, which is better than the current one-emergent-one-prompt model. It sees the full picture and can plan a batch of non-overlapping hypotheses. Executors can then run those in parallel if the parallel toggle is on. Compounding happens between planner invocations via the alignment doc.

If the hypothesis planner determines nothing valuable remains (all open questions addressed, goals met, no meaningful gaps), it creates 0 prompts and the loop idles until the user acts.

### 2. Unified Event Loop — No Emergent Concept

Simplify `checkPromptLoop()` to have one code path:

```
loop enabled + status ready + pending prompts exist → pick next, spawn executor
loop enabled + status ready + no pending + no in_progress → spawn hypothesis planner
loop enabled + status ready + no pending + in_progress exist → wait (executors still working)
loop disabled → nothing
```

Remove: `emergentEnabled` from EventLoopState/TUIState/ToggleState, emergent toggle from TUI actions, emergent-specific spawn callbacks, emergent window prefix checks in `checkAgentWindows()`, emergent agent profile, `EMERGENT_REFINEMENT_EXECUTION.md` flow, and all code that distinguishes emergent from executor spawning.

The hypothesis planner is just another agent the event loop can spawn — the same way it spawns executors. The spawn condition is "no prompts left" instead of "prompt available."

No `emergent_trigger` flag on status.yaml. No mode field. The loop's behavior is identical for all spec types. The difference in timing is entirely determined by how many initial prompts the planner creates (many for milestone, few for exploratory, zero for documentation), which naturally determines when hypothesis planning kicks in.

### 3. Spec Type Field + User-Selected Hypothesis Domains

Add two fields to the spec schema:

- `type` — Enum: `milestone`, `investigation`, `optimization`, `refactor`, `documentation`, `triage`. Determines planner behavior (planning depth) and branch prefix convention.
- `hypothesis_domains` — String array, optional. Selected by the user during spec creation based on the agent's recommendation from the available domains in `settings.json`. Falls back to `settings.json` global defaults if absent. Constrains what kinds of hypotheses the hypothesis planner can create.

During `CREATE_SPEC`, the spec creation flow presents the available hypothesis domains from `settings.json` with its recommendation for the spec being created. The user selects which domains to include. This is one question, asked in context, providing maximum flexibility with zero mapping maintenance.

Remove: `workflows/` directory, `workflows.ts`, `workflow.ts` schema, `getHypothesisDomains()` function, `formatHypothesisDomains()` function, all workflow config loading logic.

### 4. Consolidated "New Initiative" TUI Action

Replace the current `[2] Ideation` action with `[2] New Initiative` that opens a selection modal listing all spec creation workflows:

| Type | Description | Spec Creation Flow |
|------|-------------|-------------------|
| Milestone | Feature development with deep ideation | Existing `IDEATION_SESSION.md` (deep 6-dimension interview) |
| Investigation | Debug / diagnose issues | Lightweight scoping flow (problem, evidence, success criteria, constraints) |
| Optimization | Performance / efficiency work | Lightweight scoping flow (targets, baselines, measurement approach) |
| Refactor | Cleanup / tech debt | Lightweight scoping flow (scope boundaries, invariants to preserve) |
| Documentation | Coverage gaps | Lightweight scoping flow (areas to cover, documentation standards) |
| Triage | External signal analysis | Scoping flow that reads from external sources (analytics, error tracking) |

Each selection runs the appropriate spec creation flow. All flows produce a spec following the same schema, with `type` set and `hypothesis_domains` selected. All flows end with `CREATE_SPEC.md` to persist. The milestone flow is the existing `IDEATION_SESSION.md` — unchanged. The exploratory flows are new, lighter flows (~40 lines each) that ask the 3-5 questions appropriate to their domain.

### 5. Unified Planner Behavior by Spec Type

The planner agent (`SPEC_PLANNING.md`) reads the spec's `type` field and calibrates its depth:

**For milestone specs** (existing behavior, mostly unchanged):
- Deep codebase + external research (1-4 subtasks)
- Engineer interview with decision points — each open question becomes an `AskUserQuestion` with 2-4 options including a recommended approach
- Unanswered/skipped questions → disposable variant prompts behind feature flags for quality engineering comparison
- Concerns from spec → specific prompts to de-risk via implementation
- Jury review of prompt plan
- Output: 5-15 coordinated prompts + detailed alignment doc with overview, hard user requirements, engineer decisions

**For all exploratory spec types** (new behavior):
- Focused research (1-2 subtasks grounded in the problem area)
- Engineer presented with open questions and concerns from spec — can answer to narrow scope, or skip to leave open for hypothesis-driven discovery
- Skipped/unanswered questions → documented in alignment doc as "Unresolved Questions" visible to the hypothesis planner for experiment design
- Concerns/limitations → documented in alignment doc as context for hypothesis formation
- No jury review (lightweight)
- Output: 0-3 seed prompts (testable hypotheses) + alignment doc with problem statement, evidence, unresolved questions, and success criteria

The planner is always the agent that bridges "spec" to "executable loop." It creates the `.planning/{branch}/` directory contents (prompts + alignment doc) and transitions status.yaml to ready. The engineer runs the planner, optionally answers questions to narrow scope, and enables the loop. Same pipeline for all spec types, different depth.

### 6. Always-Available TUI Actions

Remove all conditional visibility (`hidden`, `disabled` based on state) from the TUI actions pane. Every action is always visible. Agents that find nothing to do exit early with a message. This eliminates conditional state tracking in `buildActionItems()` and makes the TUI behavior predictable regardless of workflow type.

The resulting actions pane:

```
[1] Coordinator
[2] New Initiative
[3] Planner
[4] Review Jury
[5] E2E Test Plan
[6] PR Action
[7] Address PR Review
[8] Compound
[9] Complete
[0] Switch Workspace
[-] Custom Flow
━━ Toggles ━━
[O] Loop
[P] Parallel
━━ Controls ━━
[V] View Logs
[C] Clear Logs
[R] Refresh
[Q] Quit
```

Two toggles (Loop, Parallel). No emergent toggle. No workflow-dependent action sets.

### 7. Hypothesis Planner Agent + Flow

Create `hypothesis-planner.yaml` agent profile and a corresponding flow file. The flow is concise (~30-40 lines):

- Read alignment doc: goals, prior prompt summaries, unresolved questions, learnings
- Identify gaps between current state and desired state (per spec goals + success criteria)
- Select hypothesis domains from spec's `hypothesis_domains` field, diversifying from prior work
- Discover validation tooling for hypotheses
- Create 1-N prompt files following `PROMPT_TASKS_CURATION.md` (each targeting a non-overlapping hypothesis)
- If no valuable hypotheses remain (goals met, questions resolved, no meaningful gaps): create 0 prompts, stop
- Stop — executors pick up prompts via the loop

The hypothesis planner replaces both `emergent.yaml` and `EMERGENT_REFINEMENT_EXECUTION.md`. The key difference from the current emergent agent: it creates prompts but does NOT execute them. Execution is always done by executor agents.

### 8. Open Questions Flow Through the System

For milestone specs:
- Spec open questions → planner interviews engineer → definitive decisions or disposable variants → documented in alignment doc as "Engineer Decisions"
- Concerns → specific de-risk prompts → documented in alignment doc

For exploratory specs:
- Spec open questions → planner presents to engineer → answered questions narrow scope, skipped questions stay open → documented in alignment doc as "Unresolved Questions"
- Concerns/limitations → documented in alignment doc as hypothesis formation context
- The hypothesis planner reads "Unresolved Questions" and creates experiments to test different answers
- Each experiment's summary feeds back into the alignment doc, narrowing the solution space for the next hypothesis planner invocation

This creates a natural convergence: exploratory specs start with many unknowns and converge toward solutions through iterative hypothesis testing. Milestone specs start with resolved decisions and diverge into comprehensive implementation.

### 9. Lightweight Scoping Flows for Exploratory Spec Types

Create scoping flows for each non-milestone spec type. These are lighter than `IDEATION_SESSION.md` (~40 lines each) and follow a consistent pattern:

1. Ask type-specific questions (3-5 questions max)
2. Spawn 1-2 targeted codebase grounding tasks
3. Write spec with `type` set and `hypothesis_domains` selected
4. Persist via `CREATE_SPEC.md`

Each scoping flow elicits different information:

| Type | Key Questions |
|------|--------------|
| Investigation | What's broken? What evidence? What does fixed look like? Constraints? |
| Optimization | What's slow/expensive? What are the targets? How to measure? Constraints? |
| Refactor | What's the scope? What invariants must be preserved? What's the target architecture? |
| Documentation | What areas need coverage? What audience? Any existing docs to extend? |
| Triage | Which external sources? What time range? What severity threshold? |

The triage scoping flow is distinct in that it reads from external sources (PostHog, Sentry, etc.) rather than interviewing the user. It compiles findings into a structured report, the user selects which issues to address, and those become the spec content.

## Non-Goals

- **Changing the executor agent or PROMPT_TASK_EXECUTION flow** — Executors are unchanged. They pick up prompts and execute them regardless of how those prompts were created (planner, hypothesis planner, or coordinator patch).
- **Changing the spec schema body sections** — Motivation, Goals, Non-Goals, Open Questions, Technical Considerations work for all spec types. The body content varies in depth, not structure.
- **Automated spec type detection** — The user selects the type via the New Initiative modal. No inference from branch name or content.
- **Removing the coordinator agent** — The coordinator remains for mid-workflow intervention (quick patches, prompt edits, kill/restart). Its flow may need minor updates to work without the emergent concept.
- **Changing the planner's research or jury capabilities** — The planner's subtask spawning for codebase/external research is unchanged. The jury is skipped for exploratory specs but the capability remains.
- **Parallel hypothesis planner invocations** — Only one hypothesis planner runs at a time. Parallelism is at the executor level (multiple executors running different prompts concurrently).
- **CI/CD integration for new workflow types** — This milestone establishes the orchestration model. CI/CD pipeline changes for non-milestone branches are downstream.

## Open Questions

- **Hypothesis planner termination** — When the hypothesis planner determines nothing valuable remains, it creates 0 prompts and the loop idles. Should there be an explicit signal to the TUI (e.g., "Hypothesis planner found no more work")? Or is the loop simply idling with no activity sufficient?
- **Status.yaml `stage` field** — Currently `stage: 'planning' | 'executing' | 'reviewing' | 'pr' | 'compound'`. Does this need updating for exploratory workflows where the stages blend (planning and executing overlap via hypothesis-driven discovery)?
- **Branch prefix conventions** — Milestone specs use `feature/{name}`. Should exploratory types have their own prefixes (`fix/`, `optimize/`, `refactor/`, `docs/`, `triage/`) or all use a generic prefix?
- **Seed prompt type field** — Should prompts created by the hypothesis planner use `type: hypothesis` in frontmatter (vs `type: planned` from the planner, `type: user-patch` from coordinator)? Or is the distinction unnecessary since executors treat all prompts identically?
- **Scoping flow reuse** — The investigation, optimization, refactor, and documentation scoping flows share a pattern (ask questions, ground in codebase, write spec). Should there be one parameterized scoping flow or separate flows per type? Separate flows are more maintainable per **Context is Precious** (each is small and self-contained) but create more files.
- **Triage external source integration** — The triage scoping flow needs to read from PostHog, Sentry, or similar tools. Should this be via MCP servers, direct API calls via `ah` commands, or agent-driven web fetching? The integration approach affects how easily new external sources can be added.
- **Compounding flow updates** — The current `COMPOUNDING.md` flow is milestone-oriented (spec finalization, memory extraction). Does it need adjustments for exploratory specs where the "completion" criteria are different (problem solved vs. spec acceptance criteria met)?
- **Alignment doc schema for exploratory types** — The current alignment doc schema has Overview, Hard User Requirements, Engineer Decisions, Prompt Summaries. Exploratory workflows need: Problem Statement, Evidence, Unresolved Questions, Hypothesis Results, Prompt Summaries. Should the alignment schema be updated with a type-dependent structure, or should the planner simply write different content into the same sections?
- **TUI "New Initiative" modal data source** — Should the list of available spec types be hardcoded in the TUI, driven by the spec schema enum, or configurable in settings.json? Schema-driven is self-documenting but requires schema parsing. Settings-driven is flexible but another config surface.
- **Custom Flow action scope** — With the New Initiative modal covering spec creation and the planner handling prompt generation, does the Custom Flow action (`[-]`) need to change? Currently it spawns any agent with a custom message. This remains useful for ad-hoc agent invocations outside the standard pipeline.

## Technical Considerations

- **Event loop change is minimal** — The core change in `checkPromptLoop()` is replacing the two-path logic (executor spawn vs. emergent spawn) with one path that either spawns an executor (prompts exist) or spawns the hypothesis planner (no prompts, nothing in progress). The `emergentEnabled` state, emergent window prefix checks, and emergent spawn callbacks are removed. Net code reduction.
- **Agent profile for hypothesis planner** — The `hypothesis-planner.yaml` profile needs: `prompt_scoped: false` (one instance), `non_coding: true` (only creates prompt files, doesn't implement), template vars for alignment path, prompts folder, and hypothesis domains.
- **Hypothesis planner overlap prevention** — Since the hypothesis planner creates all prompts for a "round" at once, they are inherently non-overlapping. No need for distributed locking or early prompt file claims. The planner coordinates internally.
- **Backwards compatibility with existing specs** — Existing specs lack `type` and `hypothesis_domains` fields. The system should treat missing `type` as `milestone` and missing `hypothesis_domains` as falling back to `settings.json` defaults. No migration needed for existing specs.
- **`pickNextPrompt()` unchanged** — The prompt picker algorithm already works generically: find pending prompts with satisfied dependencies, exclude active ones, return lowest number. It doesn't know or care about prompt origin (planned, hypothesis, user-patch). No changes needed.
- **TUI action simplification** — Removing all `hidden`/`disabled` conditions from `buildActionItems()` simplifies the function significantly. The `ToggleState` interface loses `emergentEnabled`, `hasSpec`, `hasCompletedPrompts`, `compoundRun`, `prReviewUnlocked`. Only `loopEnabled`, `parallelEnabled`, and `prActionState` remain.
- **Planner flow branching** — The spec type branch in `SPEC_PLANNING.md` should be concise per **Frontier Models are Capable**. ~10 lines of flow guidance explaining "read spec type, if milestone do deep planning, otherwise do light planning." The model deduces the appropriate depth.
- **Documentation flow consolidation** — The current `DOCUMENTATION.md` flow uses a two-layer delegation pattern (discovery agents → writer agents). With the hypothesis planner model, documentation becomes: hypothesis planner identifies uncovered areas → creates prompts for each area → executors write documentation. This replaces the custom documentation orchestration with the standard loop, eliminating the `documentor.yaml` agent and `DOCUMENTATION.md` flow.
- **Settings.json `emergent` section** — The `emergent.hypothesisDomains` field in settings.json remains as the global default menu of available domains. The `emergent` key could be renamed to `hypothesis` for clarity, but this is a cosmetic change.
- **Spec `type` determines branch prefix** — The `CREATE_SPEC.md` flow (or `ah specs persist`) should derive branch prefix from spec type: milestone → `feature/`, investigation → `fix/`, optimization → `optimize/`, refactor → `refactor/`, documentation → `docs/`, triage → `triage/`. This is a convention, not a hard constraint — the `branch` field on the spec is always the source of truth.

## Implementation Reality

### What Was Implemented vs Planned

All 9 spec goals were implemented across 17 prompts (8 planned, 4 emergent, 2 user-patch, 3 review-fix):

1. **Two-agent model** — Implemented as designed. `hypothesis-planner.yaml` (plan only) + executor (unchanged). Agent file uses canonical `emergent` naming per engineer decision, not `hypothesis-planner`.
2. **Unified event loop** — Single code path in `checkPromptLoop()`. All emergent toggle/state machinery removed.
3. **Spec type field** — 6-value enum added. `hypothesis_domains` deferred as spec field (jury-approved scope reduction) — settings.json global defaults only.
4. **New Initiative TUI action** — Implemented via `flowOverride` on existing `ideation` agent profile rather than separate profiles per type. `SCOPING_FLOW_MAP` exported as `Record<SpecType, string | null>`.
5. **Planner type-aware behavior** — `SPEC_PLANNING.md` branches milestone (deep) vs exploratory (lightweight) via table format.
6. **Always-available TUI actions** — All `hidden`/`disabled` conditions removed. Two toggles: Loop, Parallel.
7. **Hypothesis planner agent + flow** — Created with `prompt_scoped: false`, `non_coding: true`. Always produces at least 1 prompt (engineer decision).
8. **Scoping flows** — 5 separate flows created (~25 lines each). Triage is a stub with manual fallback (deferred).
9. **CREATE_SPEC + Compounding + Pillars** — Branch prefix convention, type-conditional compounding, pillars 1/8/9 updated.

### How Engineer Desires Evolved

- **Hypothesis planner termination**: Spec proposed 0-prompt termination → engineer decided "always produce work" with progressive tangentiality. Engineer controls termination via loop toggle.
- **Emergent naming**: Spec proposed renaming to `hypothesis-planner.yaml` → engineer declined, "emergent" is canonical agent identity. `hp-` prefixed variables renamed to `emergent-` via PR review fix.
- **documentor.yaml deletion**: Prompt 07 deleted as part of documentation consolidation → engineer restored via user-patch 17 because compound TUI action requires both profiles.
- **Uncommitted changes guards**: Not in original spec → engineer added via user-patch 11 after TUI overhaul exposed PR actions without safety guards.
- **Exponential backoff**: Not in original spec → emergent prompt 10 added spawn resilience. Engineer kept it.
- **Test coverage**: Not explicitly planned → 4 emergent prompts (09, 10, 15, 16) added 62 tests covering event loop decisions, backoff, spec type parsing, and initiative routing.

### Key Technical Decisions

- `flowOverride` parameter on `spawnAgentFromProfile()` enables routing without per-type agent profiles
- `SPEC_TYPE` template variable separate from `WORKFLOW_TYPE` (different concepts)
- `type: emergent` preserved on hypothesis planner prompts (describes work type, not agent type)
- `EmergentSettings` interface added to `ProjectSettings` for typed settings.json access
- `WORKFLOW_TYPE` template variable removed entirely (no references remained)
- `confirmProceedWithUncommittedChanges()` extracted as shared helper across 3 TUI handlers
