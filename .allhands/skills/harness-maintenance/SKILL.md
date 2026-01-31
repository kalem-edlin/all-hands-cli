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
  - ".allhands/workflows/**/*.md"
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

```
.allhands/
├── settings.json    # Repository-specific settings (format, validation)
├── flows/           # Agent instructions (progressive disclosure)
├── agents/          # Agent profiles (YAML spawn configs)
├── workflows/       # Workflow domain configs (per-domain knowledge for shared flows)
├── skills/          # Domain expertise (patterns, best practices)
├── validation/      # Acceptance criteria tooling
├── schemas/         # Agent-facing YAML frontmatter schemas
└── harness/         # CLI implementation
    ├── src/commands/    # Auto-discovered CLI commands
    ├── src/hooks/       # Claude Code lifecycle hooks
    ├── src/lib/         # Core utilities + internal Zod schemas
    ├── src/schemas/     # JSON schemas for settings files
    ├── src/tui/         # Terminal UI implementation
    └── src/platforms/   # Claude Code settings.json
```

## Related Skills

The `harness-maintenance` and `claude-code-patterns` skills have overlapping globs on `.allhands/` files. When both match:

- **harness-maintenance** provides architectural knowledge, maintenance guidance, and routing to domain-specific references — the "why" and "when" of harness changes
- **claude-code-patterns** provides Claude Code native feature docs, implementation patterns, and API reference — the "how" of building with Claude Code primitives
- For structural changes to `.allhands/` content files (flows, schemas, skills, validation), **harness-maintenance** is primary
- For TypeScript implementation in `harness/src/` or Claude Code configs in `.claude/`, **claude-code-patterns** is primary
- When in doubt, read harness-maintenance first for architectural context, then claude-code-patterns for implementation details

## Cross-Cutting Patterns

### Key Design Patterns
- **Graceful Degradation**: Every optional dependency (TLDR, pyright, Greptile) has fallback behavior. Never fail the primary operation.
- **Semantic Validation**: Zod schemas catch config mistakes at spawn time, not runtime. Fail fast with helpful messages.
- **In-Memory State**: Registry patterns (spawned agents, search contexts) keep TUI in sync without polling.
- **Motivation-Driven Documentation**: Per **Frontier Models are Capable**, teach agents HOW TO THINK about using a tool — not command catalogs. Commands are discoverable via `--help`; documentation value is in motivations and thinking models.
- **Token Efficiency**: Read enforcer + context injection + TLDR layers save ~95% on large files.
- **Iterative Refinement**: Compaction summaries make incomplete work resumable. Per **Prompt Files as Units of Work**, same prompt can be re-run with accumulated learnings.

Format config: `enabled`, `command` (default), `patterns` (file-specific overrides).

---

## TUI Lifecycle

Per **Context is Precious** and **Prompt Files as Units of Work**, the TUI orchestrates agents with bounded context.

### Structure
- **Actions Pane (left)**: Agent spawners, toggles (loop, parallel), utilities
- **Prompts Pane (center)**: Work-in-progress by status (pending, in_progress, done)
- **Status Pane (right)**: Active agent grid, milestone info, activity log

### Lifecycle
1. **Start**: Build semantic index if missing, load state from `.planning/{branch}/status.yaml`
2. **Loop**: Render panes, handle input, dispatch actions, poll EventLoop (5s interval)
3. **Stop**: Kill spawned agent windows, restore terminal

### EventLoop Daemon
- Polls Greptile PR feedback, git branch changes, agent window status
- Runs prompt picker algorithm when loop enabled
- Non-blocking callbacks notify TUI of state changes

### Dynamic Actions
Per **Frontier Models are Capable**, actions enable/disable based on state:
- Planner only enabled if milestone set
- E2E builder only visible after first prompt done
- PR action label changes based on review state

---

## Hooks System

Per **Context is Precious** and **Agentic Validation Tooling**, hooks bridge Claude Code and harness.

### Categories

| Category | Purpose | Key Hooks |
|----------|---------|-----------|
| **Context** | Token-efficient context injection | `tldr-inject`, `read-enforcer`, `edit-inject`, `signature` |
| **Enforcement** | Guide toward appropriate tools | `github-url`, `research-fetch`, `research-search` |
| **Validation** | Quality gates on edits | `diagnostics`, `schema`, `format` |
| **Lifecycle** | Handle agent events | `agent-stop`, `agent-compact` |
| **Notification** | Desktop alerts | `elicitation`, `stop`, `compact` |
| **Session** | Startup tasks | `tldr-warm` |

### Hook Registration
- Auto-discovered from `src/hooks/` modules
- Each exports `register(parent: Command)` function
- Configured in `.claude/settings.json` as matchers

### Design Rules
- Graceful degradation: hooks allow tool execution even if analysis fails
- Enforcement blocks include helpful redirect messages
- All optional dependencies (TLDR, pyright) have fallback behavior

### Compaction Hook (Critical)
Per **Knowledge Compounding**, `agent-compact` preserves work:
1. Parse agent transcript for session summary
2. Get git status (file changes)
3. Call oracle to generate summary with decision (CONTINUE/RESTART/BLOCKED)
4. Append summary to prompt file (allows re-run with learnings)
5. Kill agent window

---

## Schema System

### Agent-Facing Schemas (`schemas/*.yaml`)
Exposed via `ah schema <type>`. Define frontmatter for harness-managed files:
- `prompt.yaml` - Prompt file structure
- `alignment.yaml` - Alignment doc structure
- `spec.yaml` - Spec structure
- `skill.yaml` - Skill manifest
- `validation-suite.yaml` - Validation tooling
- `solution.yaml` - Solution documentation (`docs/solutions/`)
- `documentation.yaml` - General documentation (`docs/`)

### Internal Schemas (`harness/src/lib/schemas/*.ts`)
Zod schemas for harness configuration. NOT exposed to agents:

**Template Variables Registry** (`template-vars.ts`)
- Single source of truth for valid template variables
- Each has Zod schema + description
- Variables: `SPEC_PATH`, `ALIGNMENT_PATH`, `MILESTONE_NAME`, `PROMPT_NUMBER`, `BRANCH`, `HYPOTHESIS_DOMAINS`, `SPEC_TYPE`, etc.

**Agent Profile Schema** (`agent-profile.ts`)
- Raw schema (snake_case from YAML) + normalized interface (camelCase)
- Semantic validation: template vars in `message_template` must match `template_vars` list
- Pattern validation: `PROMPT_NUMBER` must match `^\d{2}$`


### Why Zod for Internal
- Type safety with compile-time checks
- Runtime validation catches misconfigurations at spawn time
- Pattern validation enforces format constraints

---

## Agent Profiles

Per **Frontier Models are Capable**, profiles define spawn configuration, not behavior.

### Profile Structure (`agents/*.yaml`)
```yaml
name: executor              # Agent identifier
flow: PROMPT_TASK_EXECUTION.md  # Flow file in flows/
prompt_scoped: true         # Multiple instances (one per prompt)
tui_action: executor        # TUI button trigger
tui_label: Executor         # Display label
tui_requires_spec: true
non_coding: false           # Can write code
message_template: |         # Preamble injected before flow
  Your prompt file: ${PROMPT_PATH}
  Alignment doc: ${ALIGNMENT_PATH}
template_vars:              # Required context variables
  - PROMPT_PATH
  - ALIGNMENT_PATH
```

### Key Fields
- **prompt_scoped**: If true, runs multiple instances (executor per prompt)
- **non_coding**: Hint for agent type (coordinator, judge are true)
- **message_template**: Uses `${VAR}` interpolation

### Environment Variables Passed
`AGENT_ID`, `AGENT_TYPE`, `PROMPT_NUMBER`, `MILESTONE_NAME`, `BRANCH`

---

## Hypothesis Domains

Per **Quality Engineering**, hypothesis domains define the available work areas for the emergent planner.

### Configuration

Defined in `settings.json` under `emergent.hypothesisDomains` (the key name describes the work type, not an agent):
```json
{
  "emergent": {
    "hypothesisDomains": ["testing", "stability", "performance", "feature", "ux", "integration"]
  }
}
```

Per **Frontier Models are Capable**, agents understand domain meanings from names alone—no descriptions needed.

### Integration with Agent Spawning
1. `buildTemplateContext()` loads domains from `settings.json`
2. Domains formatted as `HYPOTHESIS_DOMAINS` template variable
3. Emergent planner receives available domains in spawn message
4. Planner selects domain and creates `type: emergent` prompts for executors

### Diversification Rule
Per **Knowledge Compounding**, the emergent planner tracks work types in alignment doc summaries. If prior prompts cluster on one domain, subsequent prompts should diversify by selecting an underrepresented domain.

---

## Workflow Domain Configuration

Per **Frontier Models are Capable**, workflow domain configs centralize domain knowledge for consumption by multiple flows rather than duplicating it per-flow.

### Architecture
- `.allhands/workflows/*.md` — one config per domain (`milestone`, `investigation`, `optimization`, `refactor`, `documentation`, `triage`)
- Structured **frontmatter** (`planning_depth`, `jury_required`, `max_tangential_hypotheses`, `required_ideation_questions`) provides programmatic flags for flow calibration
- **Markdown body** contains domain-specific context (vocabulary, gap signals, output sections, planning strategy) — not restatement of flow instructions. Frontmatter flags drive flow bifurcation; body provides domain knowledge for agent discretion
- Schema validated via `ah schema workflow`

### Template Variable Abstraction
- `WORKFLOW_DOMAIN_PATH` is the single abstraction boundary — agents receive the resolved path, never raw domain names
- Resolved in `buildTemplateContext()` from the spec's `initial_workflow_domain` frontmatter field (default: `milestone`)
- All domain-consuming agents (ideation, planner, emergent, initiative-steering) access configs exclusively through this variable

### Flow Unification
- Unified `IDEATION_SCOPING.md` replaced 6 separate per-type scoping flows (`IDEATION_SESSION.md`, `INVESTIGATION_SCOPING.md`, etc.)
- `planning_depth` field (`deep` vs `focused`) drives flow bifurcation — not spec type checks
- `stage` field on `status.yaml` gates execution (`executing`) and pauses during initiative steering (`steering`)

### Coordinator vs Initiative Steering

Both are TUI actions but serve fundamentally different purposes:

| Dimension | Coordinator | Initiative Steering |
|-----------|------------|-------------------|
| **Scope** | Single-prompt interventions (quick patches, triage, prompt surgery) | Multi-prompt initiative-level replanning |
| **Trigger** | Reactive — something broke or needs a tweak | Strategic — scope change, blocking issue, quality pivot |
| **Domain awareness** | Not domain-config-driven | Consumes workflow domain config; can steer with a different domain than the spec's original |
| **Execution impact** | Does not pause the event loop | Pauses prompt spawning (`stage: 'steering'`) during the session |
| **Goal changes** | Does not change initiative goals | Can change initiative goals (resets `core_consolidation` to `pending`) |

Per **Context is Precious**, the coordinator is lightweight and conversational; initiative steering is heavyweight with research subtasks, a domain-driven interview, and structured alignment doc amendments.

---

## Platform Integration

### Settings Configuration (`.claude/settings.json`)
Connection point between harness and Claude Code:

```json
"PreToolUse": [
  {
    "matcher": "Read",
    "hooks": [{
      "type": "command",
      "command": "ah hooks context read-enforcer",
      "timeout": 20
    }]
  }
]
```

### Hook Events
- **PreToolUse**: Context injection, enforcement, blocking
- **PostToolUse**: Diagnostics, validation
- **SessionStart**: TLDR daemon warm-up
- **Stop/SessionEnd**: Notifications, cleanup
- **PreCompact**: Compaction handling

### Permissions
```json
"deny": ["Task(claude-code-guide)", "Task(Explore)", "Task(Plan)"]
```

---

## Commands Architecture

### Structure
- Entry point: `src/cli.ts` (default action launches TUI)
- Auto-discovers commands from `src/commands/`
- Each module exports `register(parent: Command)` function

### Core Commands

| Command | Domain | First Principle |
|---------|--------|-----------------|
| `ah knowledge` | Semantic search | **Context is Precious** |
| `ah schema` | File structure | **Frontier Models are Capable** |
| `ah validate` | Quality gates | **Agentic Validation Tooling** |
| `ah oracle` | LLM inference | **Context is Precious** (saves caller context) |
| `ah spawn` | Sub-agents | **Context is Precious** (isolated work) |
| `ah tools` | MCP integration | **Agentic Validation Tooling** |

### Command Design Rules
- Use `--json` flag for machine-readable output
- Graceful degradation when optional deps missing
- Help text explains first principle motivation

---

## Progressive Disclosure

Per **Context is Precious**, agents only see what they need when they need it.

### Flow Organization
- `flows/` root: Agent default flows, disclosed immediately on spawn
- `flows/shared/`: Progressively disclosed via references in parent flows
- `flows/shared/jury/`: Specialized review sub-agents

### Flow Referencing
```markdown
- Read `.allhands/flows/shared/SKILL_EXTRACTION.md` and follow its instructions
```

### Inputs/Outputs Pattern
Sub-flows use `<inputs>` and `<outputs>` tags for execution-agnostic subtasks.

---

## Extension Points

### Adding New Hooks
1. Create file in `src/hooks/`
2. Export `register(parent: Command)` function
3. Add matcher to `settings.json`

### Adding New Agents
1. Create YAML profile in `agents/`
2. Create flow file in `flows/`
3. Run `ah validate agents`

### Deleting Agent Profiles
1. Check the profile's `tui_action` field value
2. Search other profiles for the same `tui_action` value — if multiple profiles share a `tui_action`, they are co-dependencies (e.g., `compounder.yaml` and `documentor.yaml` both have `tui_action: compound`)
3. Verify the TUI action handler does not expect multiple agents for that action
4. `ah validate agents` and `npx tsc --noEmit` will NOT catch cross-profile `tui_action` dependency breaks — YAML files are outside the TypeScript dependency graph and agent validation is per-profile

### Updating Hypothesis Domains
1. Edit available domains in `settings.json` under `emergent.hypothesisDomains`
2. Domains are passed to emergent planner via `HYPOTHESIS_DOMAINS` template variable

### Adding New Template Variables
1. Add to `TemplateVars` registry in `src/lib/schemas/template-vars.ts`
2. Include Zod schema and description
3. Wire the variable in `buildTemplateContext()` in [ref:src/lib/tmux.ts:buildTemplateContext] — registration without wiring passes `ah validate agents` but produces empty template values at runtime

### Adding New Schemas
1. Create YAML in `schemas/` for agent-facing
2. Create Zod schema in `src/lib/schemas/` for internal

### Adding New Commands
1. Create file in `src/commands/`
2. Export `register(parent: Command)` function
3. Document in `README.md`

---

## Key Design Patterns

### Graceful Degradation
Every optional dependency (TLDR, pyright, Greptile) has fallback behavior. Never fail the primary operation.

### Semantic Validation
Zod schemas catch config mistakes at spawn time, not runtime. Fail fast with helpful messages.

### In-Memory State
Registry patterns (spawned agents, search contexts) keep TUI in sync without polling.

### Motivation-Driven Documentation
Per **Frontier Models are Capable**, harness documentation (validation suites, skills, flows) should teach agents HOW TO THINK about using a tool, not replicate command references. Commands are discoverable via `--help`; documentation value is in motivations, exploration patterns, and thinking models. Avoid prescriptive command catalogs — describe WHY an agent would reach for a tool, and let the model deduce the HOW.

### Token Efficiency
Read enforcer + context injection + TLDR layers save ~95% on large files.

### Iterative Refinement
Compaction summaries make incomplete work resumable. Per **Prompt Files as Units of Work**, same prompt can be re-run with accumulated learnings.

### Workflow Constraints
Dynamic action items prevent invalid operations. Can't run planner without milestone.

---

## Best Practices

### Schema and TypeScript Synchronization

Per **Agentic Validation Tooling**, agent-facing YAML schemas and their TypeScript interfaces must stay in sync:
- `spec.yaml` fields → `SpecFrontmatter` interface in `lib/specs.ts`
- `alignment.yaml` fields → relevant TypeScript types in `lib/planning.ts`
- `workflow.yaml` fields → consumed via `parseYaml` in flow-consuming code

When adding a new field to any schema YAML, the corresponding TypeScript interface **must** also be updated. Failure to do so causes `parseFrontmatter()` to silently discard unrecognized fields, leading agents to resort to fragile regex-based workarounds.

### Frontmatter Parsing

Per **Knowledge Compounding**, agents MUST use `parseFrontmatter()` from `lib/specs.ts` or `parseYaml()` from the `yaml` library for frontmatter field extraction. Raw regex for individual frontmatter fields is prohibited — it does not handle YAML quoting, comments, or multi-line values, and creates duplication when multiple call sites need the same field.

### Template Variable Overrides (`contextOverrides`)

Per **Frontier Models are Capable**, `spawnAgentsForAction()` in `tui.ts` accepts an optional `contextOverrides` parameter — a `Record<string, string>` applied via `Object.assign` after `buildTemplateContext()`. Override keys should be known template variable names from the `TemplateVars` registry in `template-vars.ts`.

This pattern is used for initiative steering domain selection, where the engineer picks a different workflow domain than the spec's `initial_workflow_domain`. The flow:
1. TUI modal presents domain choices (pre-selects spec's current domain)
2. User selection produces `{ WORKFLOW_DOMAIN_PATH: resolvedPath }`
3. Override replaces the default value from `buildTemplateContext()`
4. Spawned agent receives the overridden context

---

## Maintainer Checklist

When modifying the harness:
- [ ] Read `principles.md` first
- [ ] Identify which First Principle motivates the change
- [ ] Check for graceful degradation on optional dependencies
- [ ] Add validation for new configuration
- [ ] Update relevant reference doc if structural changes made
- [ ] Run `ah validate agents` after profile changes
- [ ] Test hook behavior with Claude Code runner
- [ ] Verify routing table rows match reference files in `references/`
- [ ] Verify each routing table entry has a corresponding thin flow in `flows/harness/`
- [ ] Verify cross-domain navigation links in modified reference docs resolve
- [ ] NEVER run `ah docs validate`/`finalize` on skill references — those commands are scoped to `docs/` only
