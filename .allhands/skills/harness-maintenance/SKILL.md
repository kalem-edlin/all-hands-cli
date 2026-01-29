---
name: harness-maintenance
description: Domain expertise for maintaining and extending the All Hands harness. Use when working on flows, hooks, commands, agents, schemas, or MCP integrations.
version: 1.0.0
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
Guide maintainers in preserving and improving the harness architecture. This document is the single reference for understanding how components interact, why decisions were made, and how to extend the system while upholding first principles.
</goal>

<constraints>
- MUST read `.allhands/principles.md` before any harness modification
- MUST cite First Principles by name when adding features or changing behavior
- MUST update this document when making structural changes to the harness
- NEVER add complexity without clear first principle justification
- ALWAYS validate changes with `ah validate agents` after profile modifications
</constraints>

## First Principles Applied to Harness Design

| First Principle | Harness Implementation |
|-----------------|------------------------|
| **Context is Precious** | Hooks inject minimal context; read-enforcer returns TLDR for large files; prompts limited to 3-5 tasks |
| **Prompt Files as Units of Work** | Prompts ARE tasks, not descriptions; completed prompts document decisions |
| **Frontier Models are Capable** | Flows provide "why", agents deduce "how"; control flows not micromanagement |
| **Agentic Validation Tooling** | Schema validation on edit; diagnostics hooks; validation suites as acceptance criteria |
| **Knowledge Compounding** | Compaction summaries preserve learnings; skills/validation improve with use |
| **Quality Engineering** | Workflow configs define hypothesis domains; emergent agents diversify work to discover valuable variants |

---

## Architecture Overview

```
.allhands/
├── settings.json    # Repository-specific settings (format, validation)
├── flows/           # Agent instructions (progressive disclosure)
├── agents/          # Agent profiles (YAML spawn configs)
├── workflows/       # Workflow configs (hypothesis domains per workflow type)
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

---

## Project Settings

**Location:** `.allhands/settings.json` | **Schema:** `harness/src/schemas/settings.schema.json`

Repository-specific, platform-agnostic configuration. Hooks read this to determine behavior.

| Setting | Hook | Purpose |
|---------|------|---------|
| `validation.format` | `ah hooks validation format` | Auto-format after Write/Edit |

Format config: `enabled`, `command` (default), `patterns` (file-specific overrides).

---

## TUI Lifecycle

Per **Context is Precious** and **Prompt Files as Units of Work**, the TUI orchestrates agents with bounded context.

### Structure
- **Actions Pane (left)**: Agent spawners, toggles (loop, emergent), utilities
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

### Internal Schemas (`harness/src/lib/schemas/*.ts`)
Zod schemas for harness configuration. NOT exposed to agents:

**Template Variables Registry** (`template-vars.ts`)
- Single source of truth for valid template variables
- Each has Zod schema + description
- Variables: `SPEC_PATH`, `ALIGNMENT_PATH`, `MILESTONE_NAME`, `PROMPT_NUMBER`, `BRANCH`, `HYPOTHESIS_DOMAINS`, `WORKFLOW_TYPE`, etc.

**Agent Profile Schema** (`agent-profile.ts`)
- Raw schema (snake_case from YAML) + normalized interface (camelCase)
- Semantic validation: template vars in `message_template` must match `template_vars` list
- Pattern validation: `PROMPT_NUMBER` must match `^\d{2}$`

**Workflow Schema** (`workflow.ts`)
- Validates workflow configs from `.allhands/workflows/`
- Used by `workflows.ts` loader to parse and validate configs
- Domains defined in `settings.json`, not hardcoded

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

## Workflow Configuration

Per **Quality Engineering**, workflows define what hypothesis domains are available to emergent refinement agents.

### Hypothesis Domains

Defined in `settings.json` under `emergent.hypothesisDomains`:
```json
{
  "emergent": {
    "hypothesisDomains": ["testing", "stability", "performance", "feature", "ux", "integration"]
  }
}
```

Per **Frontier Models are Capable**, agents understand domain meanings from names alone—no descriptions needed.

### Workflow Configs (`workflows/*.yaml`)

Optional configs can restrict which domains are available for specific workflow types:
```yaml
name: debugging
description: Issue diagnosis and resolution
hypothesis_domains:
  - reproduction
  - diagnosis
  - stability
  - testing
```

If no workflow config exists, all domains from `settings.json` are available.

### Integration with Agent Spawning
1. `buildTemplateContext()` loads domains from `settings.json` (or workflow config if specified)
2. Domains formatted as `HYPOTHESIS_DOMAINS` template variable
3. Emergent agent receives available domains in spawn message
4. Agent selects domain and documents work type in summary

### Diversification Rule
Per **Knowledge Compounding**, emergent agents track work types in alignment doc summaries. If prior prompts cluster on one domain, subsequent agents should break the trend by selecting an underrepresented domain.

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

### Adding New Workflows
1. Define available domains in `settings.json` under `emergent.hypothesisDomains`
2. Optionally create YAML config in `workflows/` to restrict domains for specific workflow types
3. Future: Add `workflow` field to spec frontmatter to select workflow type

### Adding New Template Variables
1. Add to `TemplateVars` registry in `src/lib/schemas/template-vars.ts`
2. Include Zod schema and description

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

### Token Efficiency
Read enforcer + context injection + TLDR layers save ~95% on large files.

### Iterative Refinement
Compaction summaries make incomplete work resumable. Per **Prompt Files as Units of Work**, same prompt can be re-run with accumulated learnings.

### Workflow Constraints
Dynamic action items prevent invalid operations. Can't run planner without milestone.

---

## Maintainer Checklist

When modifying the harness:
- [ ] Read `principles.md` first
- [ ] Identify which First Principle motivates the change
- [ ] Check for graceful degradation on optional dependencies
- [ ] Add validation for new configuration
- [ ] Update this document if structural changes made
- [ ] Run `ah validate agents` after profile changes
- [ ] Test hook behavior with Claude Code runner
