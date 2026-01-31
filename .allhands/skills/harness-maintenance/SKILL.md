---
name: harness-maintenance
description: Domain expertise for maintaining and extending the All Hands harness. Use when working on flows, hooks, commands, agents, schemas, or MCP integrations.
version: 2.0.0
globs:
  - ".allhands/flows/**/*.md"
  - ".allhands/agents/*.yaml"
  - ".allhands/schemas/*.yaml"
  - ".allhands/skills/**/*.md"
  - ".allhands/validation/*.md"
  - ".allhands/workflows/**/*.yaml"
  - ".allhands/harness/src/**/*.ts"
  - ".allhands/harness/src/**/*.json"
---

# Harness Maintenance

<goal>
Route maintainers to domain-specific harness knowledge. Per **Context is Precious**, agents load only the reference matching their scenario — not the full architecture.
</goal>

<constraints>
- MUST read `.allhands/principles.md` before any harness modification
- MUST cite First Principles by name when adding features or changing behavior
- MUST update the relevant reference doc when making structural changes to the harness
- MUST validate changes with `ah validate agents` after profile modifications
- NEVER add complexity without clear first principle justification
</constraints>

## Start Here

Read `.allhands/principles.md` first — it is the single entry point covering all first principles and core philosophy pillars. Every harness change should be motivated by a named principle.

## Reference Routing

Use **Scenario** to find the right reference for your task. Use **Trigger** to find which reference to update after a change.

| Scenario | Reference | When to Use | Trigger (what changed) |
|----------|-----------|-------------|------------------------|
| Writing or editing flows | [`writing-flows.md`](references/writing-flows.md) | Flow files, XML tags, progressive disclosure, structure conventions | Flow XML tags, structure conventions, or progressive disclosure patterns |
| Hooks, commands, or MCP | [`tools-commands-mcp-hooks.md`](references/tools-commands-mcp-hooks.md) | Adding/modifying hooks, CLI commands, MCP servers, extension points | CLI commands, hooks, MCP servers, or auto-discovery registration |
| Architecture & schemas | [`core-architecture.md`](references/core-architecture.md) | Directory structure, TUI lifecycle, schema system, agent profiles, settings | Directory structure, TUI lifecycle, schemas, agent profiles, or settings |
| Skills system | [`harness_skills.md`](references/harness_skills.md) | Creating/extending skills, hub-and-spoke pattern, skill schema, discovery | Skill schema, discovery mechanism, or hub-and-spoke conventions |
| Validation tooling | [`validation-tooling.md`](references/validation-tooling.md) | Validation suites, crystallization lifecycle, suite writing philosophy | Validation suites, crystallization lifecycle, or stochastic/deterministic methodology |
| Knowledge & docs | [`knowledge-compounding.md`](references/knowledge-compounding.md) | Documentation schemas, solutions, memories, knowledge indexes | Documentation schemas, knowledge indexes, or compounding flows |

## Cross-Cutting Patterns

### Key Design Patterns
- **Graceful Degradation**: Every optional dependency (TLDR, pyright, Greptile) has fallback behavior. Never fail the primary operation.
- **Semantic Validation**: Zod schemas catch config mistakes at spawn time, not runtime. Fail fast with helpful messages.
- **In-Memory State**: Registry patterns (spawned agents, search contexts) keep TUI in sync without polling.
- **Motivation-Driven Documentation**: Per **Frontier Models are Capable**, teach agents HOW TO THINK about using a tool — not command catalogs. Commands are discoverable via `--help`; documentation value is in motivations and thinking models.
- **Token Efficiency**: Read enforcer + context injection + TLDR layers save ~95% on large files.
- **Iterative Refinement**: Compaction summaries make incomplete work resumable. Per **Prompt Files as Units of Work**, same prompt can be re-run with accumulated learnings.

### Maintainer Checklist
- [ ] Read `principles.md` first
- [ ] Identify which First Principle motivates the change
- [ ] Check for graceful degradation on optional dependencies
- [ ] Add validation for new configuration
- [ ] Update relevant reference doc if structural changes made
- [ ] Run `ah validate agents` after profile changes
- [ ] Test hook behavior with Claude Code runner

<!--
Knowledge Completeness Audit — 2026-01-30

Source: Pre-refactor monolithic SKILL.md (v1.0.0, 374 lines, commit ef3e35c^)
Target: Hub-and-spoke decomposition (v2.0.0, 7 files)

Total knowledge units audited: 47
- Preserved: 45 (95.7%)
- Intentionally Omitted: 2 (4.3%)
- Missing: 0 (0%)
- Restored: 0

Intentionally Omitted:
1. First Principles Applied cross-reference table — each reference doc now covers
   its own principles contextually; consolidated table redundant in routing hub
2. "Workflow Constraints" design pattern label — concept preserved in
   core-architecture.md §Dynamic Actions; omitted from hub patterns as
   TUI-specific detail, not cross-cutting

Coverage by destination:
- SKILL.md hub: frontmatter, goal, constraints, 6 design patterns, maintainer checklist
- core-architecture.md: directory structure, settings, TUI lifecycle, schemas,
  agent profiles, hypothesis domains, platform integration, 4 extension points
- tools-commands-mcp-hooks.md: hooks system, commands architecture, hook events,
  3 extension points
- writing-flows.md: progressive disclosure, flow organization, inputs/outputs
- harness_skills.md: new content (hub-and-spoke pattern documentation)
- validation-tooling.md: new content (crystallization lifecycle, suite philosophy)
- knowledge-compounding.md: new content (knowledge indexes, compounding patterns)

Conclusion: No knowledge loss. Spec hard requirement "No knowledge loss from
current SKILL.md content" systematically validated.
-->
