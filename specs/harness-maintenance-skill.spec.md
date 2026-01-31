---
name: harness-maintenance-skill
domain_name: infrastructure
type: refactor
status: completed
dependencies: []
branch: refactor/harness-maintenance-skill
---

# Harness Maintenance Skill Restructure

## Motivation

The harness-maintenance skill currently serves as an architecture reference document — it describes the system but doesn't effectively guide agents through specific maintenance scenarios. Per **Knowledge Compounding**, maintenance knowledge needs to compound into every harness modification, not just exist as a passive reference.

The current state:
- The skill's SKILL.md is a monolithic reference doc (~375 lines) covering everything from TUI lifecycle to hook categories
- There are no reference subdocs — all knowledge lives in one file, violating **Context is Precious**
- Skill discovery is enumeration-only (`ah skills list`), so agents match via reasoning alone
- The existing `WRITING_HARNESS_FLOWS.md` shared flow contains valuable flow-authoring knowledge but is disconnected from the skill system
- `CREATE_VALIDATION_TOOLING_SPEC.md` contains validation suite creation knowledge that should be accessible as a reference, not only as a flow
- No flows exist for other maintenance domains (commands, hooks, MCP, orchestration, skills, knowledge/compounding)

Engineer desires a **hub-and-spoke model**: SKILL.md routes to domain-specific reference docs based on the maintenance scenario, with first principles and architectural invariants always front-loaded. Corresponding thin flows in `flows/harness/` serve as execution entry points that discover the skill automatically.

## Goals

### 1. Restructure the harness-maintenance skill directory

Engineer expects the skill to follow this structure:

```
skills/harness-maintenance/
  SKILL.md                          # Hub: principles, invariants, routing table
  references/
    writing-flows.md                # Flow authoring best practices
    tools-commands-mcp-hooks.md     # Extending CLI capability surface
    core-architecture.md            # TUI, event loop, orchestration, prompt types, emergent
    harness-skills.md               # Creating and maintaining skills
    validation-tooling.md           # Creating validation suites and tooling specs
    knowledge-compounding.md        # Docs, knowledge indexes, solutions, memories
```

### 2. Restructure SKILL.md as a routing hub

Engineer expects SKILL.md to contain:
- Linked references to `.allhands/principles.md` and core pillar documents so they are always considered
- Architectural invariants that apply across all maintenance scenarios (concise, not exhaustive)
- A reference routing table mapping maintenance scenarios to specific reference docs

Engineer desires concise full coverage — no missed principles, but no bloat. The SKILL.md should be easy to maintain itself. Per **Context is Precious**, agents should only load the reference they need, not all of them.

### 3. Create reference docs with domain-specific knowledge

Each reference doc should provide:
- The core principles most relevant to that domain
- Concise full coverage of the domain's use cases, conventions, and patterns
- Grounded in codebase reality (file paths, schema fields, command examples)
- Easy to maintain — structured so updates are localized

Content sources:
- `writing-flows.md`: Migrate knowledge from current `WRITING_HARNESS_FLOWS.md` (the flow file remains but becomes thin)
- `tools-commands-mcp-hooks.md`: Extract from current SKILL.md sections on hooks, commands, and extension points. These are adjacent enough to share one reference since they all follow the auto-discovery pattern.
- `core-architecture.md`: Extract from current SKILL.md sections on TUI, event loop, agent profiles, schemas, hypothesis domains. Should capture both the architectural map (how things connect) and invariants (what must be preserved).
- `harness-skills.md`: New content covering the skill schema, directory conventions, discovery mechanism, and when/how to create new skills
- `validation-tooling.md`: Migrate knowledge from `CREATE_VALIDATION_TOOLING_SPEC.md` (research, tool validation, suite writing philosophy, evidence capture patterns)
- `knowledge-compounding.md`: New content covering documentation schema, knowledge indexes, solutions, memories, and the compounding principles for maintaining these

### 4. Create thin flows in `flows/harness/`

Each flow serves as an execution entry point for a specific maintenance domain:

```
flows/harness/
  WRITING_HARNESS_FLOWS.md
  WRITING_HARNESS_TOOLS.md
  WRITING_HARNESS_ORCHESTRATION.md
  WRITING_HARNESS_SKILLS.md
  WRITING_HARNESS_VALIDATION_TOOLING.md
  WRITING_HARNESS_KNOWLEDGE.md
```

Engineer expects each flow to be thin — its primary step is skill discovery via `ah skills` which routes to the correct reference. The flow provides the execution context (inputs, outputs, constraints), the skill reference provides the knowledge. This ensures the skill gets automatically loaded when agents enter any harness maintenance flow.

### 5. Migrate existing flow content

- `flows/shared/WRITING_HARNESS_FLOWS.md`: Deep knowledge moves to `references/writing-flows.md`. The flow becomes a thin entry point that discovers the skill. The existing CLAUDE.md reference to this file continues to work.
- `flows/shared/CREATE_VALIDATION_TOOLING_SPEC.md`: Research, tool validation, suite writing philosophy, and evidence capture knowledge moves to `references/validation-tooling.md`. Execution steps (spec creation, engineer interview, handoff) stay in the flow or move to the new `WRITING_HARNESS_VALIDATION_TOOLING.md`.

## Non-Goals

- Changing the skill schema itself (no new required frontmatter fields, no `tools` field). Schema improvements are a separate concern.
- Adding programmatic skill matching (`ah skills match`, `ah skills search`). Discovery improvements are out of scope.
- Bridging All Hands skills with Claude Code native skill features. That divergence is a separate architectural decision.
- Creating new validation suites or other non-maintenance skills. This milestone is about the maintenance skill only.
- Modifying the harness TypeScript source code. This is a content and organization change.

## Open Questions

- **Reference doc density calibration**: The validation-suite schema mandates 5 structured sections. Should reference docs follow a similar required-sections pattern, or stay flexible per **Frontier Models are Capable**? Architect should determine the right structure that balances maintainability with coverage.
- **CLAUDE.md routing update**: Currently CLAUDE.md points directly to `WRITING_HARNESS_FLOWS.md` in `flows/shared/`. Should this be updated to point to the new `flows/harness/WRITING_HARNESS_FLOWS.md`, or should the shared flow remain as a redirect? Architect should decide based on how other CLAUDE.md references work.
- **Existing SKILL.md content disposition**: The current SKILL.md has ~375 lines of architecture reference. Some of this maps cleanly to specific reference docs, but some cross-cuts (e.g., "Key Design Patterns" applies to multiple domains). Architect should decide how to decompose cross-cutting content — duplicate where relevant, or keep a minimal cross-cutting section in SKILL.md.
- **Flow location**: Engineer specified `flows/harness/` as the subdirectory. Existing convention uses `flows/shared/` for progressively disclosed flows with `<inputs>`/`<outputs>` tags. Architect should determine whether `flows/harness/` is a new convention or should follow `flows/shared/harness/`.

## Technical Considerations

- The existing `WRITING_HARNESS_FLOWS.md` is referenced in `CLAUDE.md` which is loaded at conversation start for every agent. Any path change must update that reference.
- Skill glob patterns in the current SKILL.md frontmatter already cover all `.allhands/` subdirectories. The restructured skill should maintain the same glob coverage so discovery still works for any harness file modification.
- The `ah schema skill` command defines minimal frontmatter (`name`, `description`, `globs`, optional `version`). The `references/` subdirectory pattern is a convention, not schema-enforced — the spec should establish clear conventions for reference doc naming and structure.
- `CREATE_VALIDATION_TOOLING_SPEC.md` is currently referenced by `ASSESS_VALIDATION_TOOLING.md` flow. This reference chain must be preserved or updated during migration.
- The skill currently has `version: 1.0.0`. This restructure should bump to `2.0.0` to signal the architectural change in how maintenance knowledge is organized.

## Implementation Reality

### What Was Implemented

All 5 spec goals were achieved across 14 prompts (3 planned, 5 emergent, 5 review-fix, 1 user-patch):

- **Goal 1 (Skill directory restructure)**: SKILL.md decomposed from 375 lines to 61-line routing hub + 6 domain-specific reference docs in `references/`. Version bumped to 2.0.0. Knowledge audit confirmed 95.7% preservation (45/47 units), 2 intentionally omitted.
- **Goal 2 (SKILL.md as routing hub)**: Single merged routing table with scenario and trigger columns. Principles reference, cross-cutting patterns, maintainer checklist, and cross-skill disambiguation all in hub.
- **Goal 3 (Reference docs)**: All 6 created with domain-specific content, cross-domain navigation footers, and flexible per-domain structure.
- **Goal 4 (Thin flows)**: All 6 flows created at 27 lines each in `flows/harness/`. Identical structural pattern with domain-specific `<goal>` principle citations.
- **Goal 5 (Flow migration)**: CLAUDE.md updated to reference skill directly (not a flow). `flows/shared/WRITING_HARNESS_FLOWS.md` thinned to 11-line redirect. `CREATE_VALIDATION_TOOLING_SPEC.md` deep knowledge migrated to skill reference.

### How Engineer Desires Evolved

- **CLAUDE.md routing**: Engineer chose to reference the skill itself rather than a specific flow — a more fundamental routing change than the spec anticipated. CLAUDE.md scope also broadened from `flows/` to all `.allhands/` files.
- **[ref:] anchors rejected**: Emergent prompt 04 added code reference anchors to ground docs in source. Engineer directed removal (prompt 12) because `ah docs validate`/`finalize` are scoped to `docs/` only — anchors in skill references silently go stale.
- **Audit artifacts rejected**: Knowledge completeness audit (prompt 06) was valuable as a process but engineer directed removal of the embedded HTML comment artifact from SKILL.md — stale metadata violates Context is Precious.
- **Consolidated routing**: Engineer preferred merging duplicate routing tables (Reference Routing + Maintenance Triggers) into a single table rather than maintaining parallel routing structures.
- **Naming consistency**: `harness_skills.md` (snake_case) renamed to `harness-skills.md` (kebab-case) — flagged independently by 3 jury reviewers.

### Key Technical Decisions

- **Hub-and-spoke with single hub table**: One routing table serves both scenario-based routing ("I'm working on flows") and change-based routing ("I changed a hook") via dual columns.
- **Cross-skill disambiguation**: Explicit Related Skills section resolves glob overlap between harness-maintenance and claude-code-patterns skills.
- **Scope guard for docs tooling**: Maintainer checklist explicitly prohibits `ah docs validate`/`finalize` on skill references.
- **Redirect flow preserved**: `flows/shared/WRITING_HARNESS_FLOWS.md` kept as 11-line redirect distinguishing knowledge source (skill reference) from execution source (harness flow).
