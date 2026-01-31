---
name: workflow-domain-configuration
domain_name: infrastructure
type: milestone
status: completed
dependencies: []
branch: feature/workflow-domain-configuration
---

# Workflow Domain Configuration

## Motivation

The harness currently has domain-specific scoping logic scattered across six separate flow files (IDEATION_SESSION.md, INVESTIGATION_SCOPING.md, OPTIMIZATION_SCOPING.md, REFACTOR_SCOPING.md, DOCUMENTATION_SCOPING.md, TRIAGE_SCOPING.md). Each flow hardcodes its domain's interview questions, considerations, and output patterns. This creates three structural problems:

1. **Domain logic fragmentation** — Each scoping flow independently encodes what to ask and what to consider for its domain. Adding a new domain means creating a new flow file. Modifying domain considerations means finding the right flow file. There is no single source of truth for what makes each domain's workflow distinct.

2. **No mid-execution scope adjustment** — When an engineer discovers a need for investigation, refactoring, or optimization during an active milestone's execution, there is no structured way to inject that scope into the running initiative. The only options are: create a separate spec on a new branch (fragmenting the work), or use the coordinator for ad-hoc patching (no domain-specific structure). Neither preserves the initiative's coherence while adding structured new scope.

3. **Rigid flow-to-domain coupling** — The ideation flow, spec planning flow, and the needed adjustment flow all require domain-specific behavior, but that behavior is locked inside ideation-only scoping flows. Spec planning cannot leverage domain considerations for its constraint analysis. A mid-execution adjustment flow cannot ask domain-appropriate questions without reimplementing domain logic.

Engineer desires a **workflow domain configuration** model: centralized config files per domain consumed by three core flows (ideation scoping, spec planning, initiative steering), with each flow interpreting the domain config at its appropriate abstraction level.

## Goals

### 1. Workflow Domain Config Files

Engineer expects centralized config files in `.allhands/workflows/` — one per scoping domain (milestone, investigation, optimization, refactor, documentation, triage). Each file has:

- **Schema-validated frontmatter** for structured configuration (domain key, required inputs, applicable considerations, configuration flags)
- **Markdown body** for freetext domain knowledge (considerations, applications, use cases, interview dimensions, domain-specific guidance)

These files are the single source of truth for what makes each domain's workflow distinct. All three core flows consume them. The consuming flow decides abstraction level:

| Flow | How it uses domain config |
|------|---------------------------|
| Ideation Scoping | High-level interview dimensions, required ideation questions, grounding depth |
| Spec Planning | Constraint/limitation/edge-case considerations, approach evaluation criteria, planning depth calibration |
| Initiative Steering | Implementation-level question framing, current-state evaluation criteria, prompt adjustment guidance |

Engineer expects a schema for these files (via `ah schema workflow`) with validation on write, following the harness pattern of schema-driven file contracts (Pillar 7).

Engineer expects the existing milestone workflow behavior to be fully preserved by encoding it in a `milestone.md` workflow domain config file. The milestone config should capture all domain-specific knowledge that currently lives in `IDEATION_SESSION.md` and the milestone path of `SPEC_PLANNING.md`. Specifically:

**Milestone ideation knowledge (currently in IDEATION_SESSION.md):**
- 6 core interview dimensions: goals, motivations, concerns, desires, capabilities, expectations
- Category deep dives: UX (user journeys), data/state (storage, schema), technical (system constraints), scale (capacity), integrations (external services), security (access, sensitive data)
- Knowledge gap detection patterns and probing signals ("I think...", "just simple X", technology buzzwords without context, conflicting requirements)
- Completeness check criteria (problem statement clear, technical constraints understood, user expectations deeply understood, all elements have expectation or open question, no TBD items)
- Feasibility feedback presentation grounded in exploration results
- Guiding principles synthesis from engineer's philosophy (validated with engineer)
- Continuous research spawning as new concepts emerge during interview

**Milestone planning knowledge (currently in SPEC_PLANNING.md milestone path):**
- Deep research: 1-4 codebase understanding subtasks, 0-3 external research subtasks
- Full engineer interview with decision points: 2-4 options per question, recommended approach marked, adapt subsequent questions based on prior answers
- Disposable variant architecture: multi-select triggers parallel variant prompts behind feature flags, engineer must choose a convention when selecting multiple approaches
- External tech documentation research (EXTERNAL_TECH_GUIDANCE.md subtasks) for consolidating approaches against actual documentation
- Validation suite discovery and assignment via UTILIZE_VALIDATION_TOOLING.md
- TDD workflow flagging for high-risk domains (auth, payments, data)
- Plan verification self-check before jury: requirement coverage, task completeness, key links, scope sanity (2-3 tasks per prompt, <7 files), validation coverage
- 4-member jury review: expectations fit, flow analysis, YAGNI, premortem (Tigers = P1/P2, Elephants = discussion points)
- Review options breakdown after jury with actionable options for engineer
- Plan deepening option for complex/high-risk specs
- Alignment doc decision recording: only deviations from recommendations (what was recommended, what was chosen, stated reasoning)
- Solutions search and memories search during context gathering
- Prompt output range: 5-15 coordinated prompts for milestone, 0-3 seed prompts for exploratory

The milestone workflow domain config encodes the domain-specific knowledge (what to explore, what to consider, what to check). The unified flows preserve the orchestration logic (how to interview, how to spawn subtasks, how to sequence phases). The abstraction must not lose any of these practices — they are the result of iterative refinement and represent proven milestone development patterns.

### 2. Unified Ideation Scoping Flow

Engineer expects ONE generic `IDEATION_SCOPING.md` flow replacing all separate domain-specific scoping flows. This flow:

- Receives the workflow domain config file path as a template variable (`WORKFLOW_DOMAIN_PATH`)
- Adapts its interview behavior based on the domain config (required questions, consideration dimensions, grounding depth)
- Asks any required ideation questions specified in the domain config to ensure coverage of irreducible dimensions per domain
- Maintains **Ideation First** adherence: engineers control depth — they can leave open questions, go as detailed or light as they choose. The domain config ensures coverage without forcing depth
- Grounds using knowledge search across ROADMAP then DOCS indexes (in that order), plus required external research. Follows existing grounding patterns for codebase reality validation
- Presents feasibility feedback to the engineer grounded in exploration results (as the milestone flow does today)
- Spawns additional research subtasks as new concepts emerge during the interview to keep ideas fresh and grounded
- Synthesizes guiding principles from the engineer's philosophy and validates them (for domains where this applies)
- Produces spec files with assumptions about other roadmap specs (cross-domain), enabling ideation phases to build on top of each other without implementation
- Writes the `initial_workflow_domain` field to the spec's frontmatter
- Delegates to `CREATE_SPEC.md` for persistence (unchanged)

The flow is domain-agnostic orchestration. The domain config provides domain-specific substance. For milestone domains, the flow behavior should be functionally equivalent to the current `IDEATION_SESSION.md` — the abstraction changes where domain knowledge lives, not what happens during the session.

### 3. Spec Schema Update

Engineer expects a new `initial_workflow_domain` frontmatter field on the spec schema:

- Records which workflow domain config was used during ideation
- Enables downstream flows (spec planning, initiative steering) to automatically load the correct domain config
- Missing field treated as `milestone` for backward compatibility with existing specs — no migration needed

### 4. Spec Planning Domain Awareness

Engineer expects the spec planning flow (`SPEC_PLANNING.md`) to receive and consume the workflow domain config alongside the spec file. The domain config drives:

- What constraints, limitations, and edge cases to surface during deep grounding
- What considerations to evaluate approaches against
- Planning depth calibration (milestone: deep research + jury review; exploratory domains: focused research, no jury)

The spec planning agent's core role is unchanged: deep codebase and research grounding to reveal what ideation could not see, challenging approaches with grounded recommendations, clarifying open questions with options. The domain config adds structured awareness of domain-specific concerns to this process. The distinction from ideation scoping is that spec planning is designed to catch unseen constraints, limitations, and edge cases after deep grounding and external tech research, and to ask for clarification on open questions while challenging approaches with implementation-level recommendations.

For milestone domains, the spec planning flow must preserve the full planning pipeline:
- Deep research subtask spawning (1-4 codebase, 0-3 external research)
- Full engineer interview with recommended approaches and multi-select support
- Disposable variant architecture when engineer selects multiple approaches (parallel variant prompts behind feature flags, convention selection)
- External tech documentation research via EXTERNAL_TECH_GUIDANCE.md
- Validation suite discovery and assignment via UTILIZE_VALIDATION_TOOLING.md
- TDD workflow flagging for high-risk domains
- Plan verification self-check before jury (requirement coverage, task completeness, key links, scope sanity, validation coverage)
- 4-member jury review (expectations fit, flow analysis, YAGNI, premortem) with review options breakdown
- Plan deepening option for complex/high-risk specs
- Solutions and memories search during context gathering
- Decision recording: only deviations from recommendations

The domain config determines which of these phases activate. Milestone activates all of them. Exploratory domains activate a subset (focused research, open question interview, seed prompt creation, no jury, no variants).

**Execution gating**: Engineer expects spec planning to be the explicit gate for execution. The planner sets `stage: executing` on `status.yaml`, which is the signal that the loop can start picking up prompts and emergence can begin. No prompts execute before the planner transitions this status, even if prompts already exist from a previous planning attempt.

**Idempotency**: Engineer desires spec planning to support rerunning. When existing planning artifacts are detected, the planner offers two modes:
- **Start fresh** — Clears `.planning/` artifacts (prompts, alignment doc) and replans from the spec
- **Amend** — Reads existing alignment doc and prompts, produces amendments without re-litigating existing decisions

### 5. Initiative Steering Flow

Engineer expects a new `INITIATIVE_STEERING.md` flow for mid-execution scope adjustment. This is the third core flow alongside ideation scoping and spec planning.

Key characteristics:

- **Input is user's direct input** — no intermediate spec file. The user speaks at implementation level because they have context from the running work
- Receives the active spec, alignment doc, prompts folder, implementation diffs, and workflow domain config
- The workflow domain config can be the same domain as the active spec OR a different domain (e.g., milestone spec encounters a bug, engineer steers with investigation domain config)
- Does deep grounding similar to spec planning, but uses current implementation diffs and existing/future prompt files as additional heuristics for current state of the world — this is a core difference from spec planning which grounds against the spec alone
- Asks domain-specific questions driven by the workflow domain config, framed at implementation level against current execution state
- Produces: alignment doc goal/initiative summary updates, prompt insertions/modifications/deletions with dependency consistency (following the coordinator's append-only numbering and dependency patching patterns), records all decisions and user inputs in the alignment doc
- Does NOT add prompt summaries for created prompts — that remains the executing agent's responsibility
- Resets `core_consolidation` to `pending` on the alignment doc when initiative goals change

Engineer desires initiative steering to be distinct from the coordinator. The coordinator remains a versatile, quick-action agent for miscellaneous fixes (quick patches, emergent prompt triage, prompt surgery, agent management). Initiative steering is a structured, domain-aware deep replanning session.

### 6. Two-Phase Emergence Model

Engineer expects emergence to operate in two explicit phases:

**Phase 1 — Core Consolidation**: Emergent hypotheses that verify, solidify, and compound the implementation to convincingly meet the core initiative goals. The emergent planner focuses on gaps between current implementation state and the alignment doc's stated goals and expectations.

**Phase 2 — Tangential Exploration**: Only after core goals are convincingly met. Emergent hypotheses that extend the implementation with ideas adjacent to but not explicitly requested in the initial goals — feature ideas, consolidation, future-proofing, edge case coverage. These often result in feature-flagged additions. Capped at a configurable maximum hypothesis count to prevent unbounded scope expansion.

**State tracking**: A `core_consolidation: pending | complete` field on the alignment doc frontmatter. The emergent planner reads this to determine which phase it is in:
- When `pending`: hypotheses focus on core goal consolidation and verification
- When `complete`: hypotheses shift to tangential exploration within the configured cap

**Transition**: The emergent planner determines when core consolidation is complete — when it assesses that all core goals are convincingly met based on the alignment doc's goals, prompt summaries, and implementation state. It sets `core_consolidation: complete`.

**Initiative steering reset**: When initiative steering modifies goals, it resets `core_consolidation` to `pending`, requiring the emergent planner to re-verify against updated goals before entering tangential exploration.

**Prompt type**: Do not split `emergent` into `emergent_core` and `emergent_tangential`. The distinction is about the phase of emergence, not the type of prompt. Both are emergent hypotheses executed identically by executors. The compounding agent can determine phase from timestamps relative to when `core_consolidation` transitioned, if analysis is needed.

### 7. Alignment Doc Schema Update

Engineer expects the alignment doc schema to include:
- `core_consolidation: pending | complete` in frontmatter (default: `pending`)
- Set to `complete` by emergent agents when core goals are convincingly met
- Reset to `pending` by initiative steering when goals change

The alignment doc remains append-only for decisions and prompt summaries. Initiative steering appends its amendments (goal updates, new decisions, user inputs) rather than rewriting existing content, preserving the audit trail.

### 8. Workflow Config Delivery to Agents

Engineer expects workflow domain config to reach agents via template variables on agent profiles:
- The TUI's "New Initiative" action resolves the workflow domain, provides the path as `WORKFLOW_DOMAIN_PATH` template variable to the ideation scoping agent
- Spec planning and initiative steering agents resolve the workflow domain from the spec's `initial_workflow_domain` field, loading the corresponding config from `.allhands/workflows/`

### 9. Remove Separate Scoping Flows

Engineer expects the following flows to be retired once the unified ideation scoping flow and workflow domain configs are operational:

- `IDEATION_SESSION.md` (replaced by `IDEATION_SCOPING.md`)
- `INVESTIGATION_SCOPING.md`
- `OPTIMIZATION_SCOPING.md`
- `REFACTOR_SCOPING.md`
- `DOCUMENTATION_SCOPING.md`
- `TRIAGE_SCOPING.md`

Domain-specific knowledge from these flows migrates into the corresponding workflow domain config files in `.allhands/workflows/`.

### 10. Pillar Updates

Engineer expects minimal, non-invasive updates to `.allhands/pillars.md`:
- **Pillar 8 (Initiative-Based Orchestration)**: Update to reference workflow domain configs as the mechanism that drives scoping, planning, and steering behavior per initiative type. Add initiative steering as a first-class mid-execution intervention concept alongside the existing coordinator
- Other pillars should remain unchanged unless a natural fit emerges during implementation

## Non-Goals

- **Spec completion and switching workflows** — Git merge prep, file movement, push operations, and worktree-aware spec switching are separate concerns for a downstream spec
- **Changing the executor agent or prompt execution flow** — Executors are unchanged. They pick up prompts regardless of how those prompts were created (planned, emergent, steered)
- **Changing the coordinator agent's core role** — The coordinator remains a versatile quick-action agent. Initiative steering is a separate flow with a separate agent
- **Automated domain detection** — The user selects the workflow domain. No inference from branch name, spec content, or execution state
- **New scoping domains beyond the existing six** — This milestone establishes the workflow domain configuration model and migrates existing domains. Adding new domains is trivial once the model exists
- **CI/CD pipeline changes** — Schema validation for workflow configs is in scope; CI pipeline integration for new file types is downstream

## Open Questions

- **Workflow domain config schema depth** — How much structure should the frontmatter carry vs. the markdown body? The frontmatter needs at minimum: `name`, `type` (matching spec types), and required ideation questions. The markdown body provides freetext considerations and domain knowledge. Architect should determine the right balance between programmatic access (frontmatter) and expressive domain knowledge (markdown body)
- **Initiative steering invocation mechanism** — Should initiative steering be a dedicated TUI action (like the planner), invoked through the "New Initiative" modal with an "adjust current" option, or a new TUI action entirely? A dedicated TUI action is most discoverable. Architect should determine the right UX pattern
- **Initiative steering and the event loop** — Should the event loop pause while initiative steering is active, or can it continue executing existing prompts? Pausing is safer (avoids race conditions with prompt modifications) but slower. Architect should evaluate the tradeoff
- **Tangential hypothesis cap configuration** — Where should the maximum tangential emergence hypothesis count be configured? Options: alignment doc frontmatter, workflow domain config, settings.json global default, or spec frontmatter. Domain config is most natural (some domains may warrant more exploration than others)
- **Spec planning "amend" mode — staleness detection** — When amending existing planning artifacts, how does the planner distinguish "existing decisions to preserve" from "stale decisions to revisit"? The alignment doc's append-only log helps, but guidance on what constitutes "stale" is needed — perhaps decisions referencing prompts that no longer exist or have been significantly modified
- **Initiative steering workflow domain selection** — When steering with a different domain than the active spec (e.g., milestone spec needs investigation steering), should the spec's `initial_workflow_domain` be updated, or should the steering domain be tracked separately in the alignment doc? Updating the spec changes its identity; separate tracking adds state but preserves the original domain record
- **Milestone workflow config completeness** — The milestone domain is the most complex (6-dimension interview, completeness checks, jury review during planning, plan deepening). How much of the existing milestone flow logic should migrate into the domain config vs. remain as conditional paths in the unified flows? The domain config should describe WHAT to explore; the flow should handle HOW to orchestrate. The boundary between domain knowledge and flow logic needs careful placement

## Technical Considerations

- **Workflow domain config files are schema-validated** — Following Pillar 7, `ah schema workflow` defines the frontmatter structure. Validation runs on write. The `ah` CLI needs a new schema definition and corresponding validation
- **Template variable delivery** — Agent profiles already support template variables (`SPEC_NAME`, `SPEC_PATH`, `ALIGNMENT_PATH`, `PROMPTS_FOLDER`). Adding `WORKFLOW_DOMAIN_PATH` follows the existing pattern. The TUI resolves the path from the selected workflow domain and passes it to the agent profile's template expansion
- **Spec frontmatter backward compatibility** — Existing specs lack `initial_workflow_domain`. Treat missing field as `milestone`. No migration needed
- **Unified scoping flow depth range** — The single `IDEATION_SCOPING.md` must handle milestone's deep 6-dimension interview with parallel grounding and completeness checks down to investigation's 5 focused questions. Per **Frontier Models are Capable**, the flow provides orchestration scaffolding while the domain config provides domain-specific substance. The model deduces appropriate depth from the domain config's content
- **Initiative steering prompt dependency management** — When inserting, modifying, or deleting prompts mid-execution, dependency consistency must be maintained. The coordinator flow already has a proven pattern for this: append-only numbering, explicit dependency patching on affected prompts. Initiative steering follows the same pattern. `pickNextPrompt()` already handles dependency resolution generically
- **Alignment doc amendment pattern** — Initiative steering appends to the alignment doc. A new section (e.g., `## Steering Amendments`) or appending to existing sections preserves the append-only audit trail while clearly marking what changed. Each amendment records: the steering domain used, user inputs, decisions made, and prompt changes
- **Emergence phase transition is a flow change** — The emergent planner already reads the alignment doc. Adding `core_consolidation` awareness is a flow change (checking the field, adjusting hypothesis strategy), not a code change to the harness runtime
- **Event loop gating invariant** — The `stage` field on `status.yaml` already gates execution. Making spec planning the explicit setter of `stage: executing` enforces an invariant rather than adding a new mechanism. The loop's `checkPromptLoop()` already checks status before spawning
- **Existing milestone behavior preservation** — The milestone workflow domain config encodes the domain knowledge; the unified flows preserve the orchestration logic. The milestone planning path (deep research subtasks, full engineer interview with options, external tech research, jury review, plan deepening) remains as conditional flow logic triggered by the milestone domain config's characteristics

## Implementation Reality

### What Was Implemented vs Planned

All 10 spec goals were implemented as planned across 13 prompts (10 planned + 3 review-fix from jury review). No goals were descoped, deferred, or significantly altered. The engineer declined YAGNI scope reduction, keeping full scope: all 6 domain configs, amend mode, and two-phase emergence.

### Key Technical Decisions

- **Content-presence branching over type checks**: The unified `IDEATION_SCOPING.md` triggers milestone-specific features (deep dives, gap detection, completeness check, guiding principles) by detecting content presence in domain config sections rather than hardcoded `planning_depth` or `type` checks. This enables new domains to activate features by adding config content without flow code changes.
- **"Deep Planning" / "Focused Planning" naming**: Planning paths were named to decouple from spec type terminology. `planning_depth: deep` activates the full pipeline; `planning_depth: focused` activates the lightweight path.
- **Stage-field loop pause over window detection**: Initiative steering pauses the event loop via `stage: 'steering'` on `status.yaml` rather than window-name-based detection — uses the same mechanism as execution gating for architectural consistency.
- **`status: deleted` for prompt deletion**: Initiative steering marks prompts as deleted in frontmatter rather than removing files, preserving the audit trail.
- **`contextOverrides` for domain selection**: TUI actions pass engineer's domain selection to agents via `contextOverrides` on `spawnAgentsForAction()` rather than mutating global template context.

### Jury Review Outcomes

The 7-member post-implementation jury caught 5 P1/P2 issues resolved by review-fix prompts 11-13:
- Duplicated regex frontmatter parsing → extracted shared `getWorkflowDomain()` utility with proper YAML parsing
- Unsanitized domain values in `path.join()` → added `VALID_WORKFLOW_DOMAINS` allowlist validation
- Missing `initial_workflow_domain` on `SpecFrontmatter` interface → added to type definition
- Missing `ALIGNMENT_PATH` on planner agent profile → added to template vars
- Tautological routing tests asserting constants against themselves → replaced with filesystem/runtime assertions
- Duplicated 6-domain array in TUI modals → extracted shared `WORKFLOW_DOMAIN_ITEMS` constant
- 5 workflow domain patterns not encoded in harness-maintenance skill → encoded as new skill sections

### Open Questions Resolved

- **Schema depth**: Structured frontmatter for programmatic flags (`planning_depth`, `jury_required`, `max_tangential_hypotheses`, `required_ideation_questions`) + markdown body for expressive domain knowledge
- **Initiative steering invocation**: Dedicated TUI action ("Steer Initiative") with domain selection modal
- **Event loop during steering**: Paused via `stage: 'steering'` — active executors continue, no new spawns
- **Tangential hypothesis cap**: Configured per domain in workflow domain config's `max_tangential_hypotheses` field
- **Amend mode staleness**: Reference integrity check — decisions referencing prompts that no longer exist or with modified acceptance criteria are flagged as stale
- **Steering domain tracking**: Tracked in alignment doc amendment section, not by updating `initial_workflow_domain` on the spec
- **Milestone config completeness**: Domain config describes WHAT (6-dimension interview, gap signals, completeness criteria, jury topics); unified flows handle HOW (subtask spawning, interview sequencing, phase orchestration). `planning_depth` and `jury_required` flags gate which flow phases activate.

### Validation Gap

No TypeScript-specific validation suite exists. All 13 prompts used `validation_suites: []`. Manual validation relied on `tsc --noEmit`, `npx vitest run`, `ah validate agents/file`, and manual acceptance criteria walkthroughs. This gap was previously identified and persists.
