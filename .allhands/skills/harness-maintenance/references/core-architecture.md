# Core Architecture

Per **Context is Precious**, this is the architectural map — how harness components connect and what must be preserved when modifying the system.

## Directory Structure

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

## Project Settings

**Location:** `.allhands/settings.json` | **Schema:** `[ref:.allhands/harness/src/schemas/settings.schema.json::edcd9d1]`

Repository-specific, platform-agnostic configuration. Hooks read this to determine behavior.

| Setting | Hook | Purpose |
|---------|------|---------|
| `validation.format` | `ah hooks validation format` | Auto-format after Write/Edit |

Format config: `enabled`, `command` (default), `patterns` (file-specific overrides).

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

## Schema System

### Agent-Facing Schemas (`schemas/*.yaml`)
Exposed via `ah schema <type>`. Define frontmatter for harness-managed files:
- `prompt.yaml` — Prompt file structure
- `alignment.yaml` — Alignment doc structure
- `spec.yaml` — Spec structure
- `skill.yaml` — Skill manifest
- `validation-suite.yaml` — Validation tooling
- `solution.yaml` — Solution documentation (`docs/solutions/`)
- `documentation.yaml` — General documentation (`docs/`)

### Internal Schemas (`[ref:.allhands/harness/src/lib/schemas]`)
Zod schemas for harness configuration. NOT exposed to agents:

**Template Variables Registry** (`[ref:.allhands/harness/src/lib/schemas/template-vars.ts:TemplateVars:aa2cf15]`)
- Single source of truth for valid template variables
- Each has Zod schema + description
- Variables: `SPEC_PATH`, `ALIGNMENT_PATH`, `MILESTONE_NAME`, `PROMPT_NUMBER`, `BRANCH`, `HYPOTHESIS_DOMAINS`, `SPEC_TYPE`, etc.

**Agent Profile Schema** (`[ref:.allhands/harness/src/lib/schemas/agent-profile.ts::aa2cf15]`)
- Raw schema (snake_case from YAML) + normalized interface (camelCase)
- Semantic validation: template vars in `message_template` must match `template_vars` list
- Pattern validation: `PROMPT_NUMBER` must match `^\d{2}$`

### Why Zod for Internal
- Type safety with compile-time checks
- Runtime validation catches misconfigurations at spawn time
- Pattern validation enforces format constraints

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

## Hypothesis Domains

Per **Quality Engineering**, hypothesis domains define available work areas for the emergent planner.

### Configuration
Defined in `settings.json` under `emergent.hypothesisDomains`:
```json
{
  "emergent": {
    "hypothesisDomains": ["testing", "stability", "performance", "feature", "ux", "integration"]
  }
}
```

Per **Frontier Models are Capable**, agents understand domain meanings from names alone — no descriptions needed.

### Integration with Agent Spawning
1. `buildTemplateContext()` loads domains from `settings.json`
2. Domains formatted as `HYPOTHESIS_DOMAINS` template variable
3. Emergent planner receives available domains in spawn message
4. Planner selects domain and creates `type: emergent` prompts for executors

### Diversification Rule
Per **Knowledge Compounding**, the emergent planner tracks work types in alignment doc summaries. If prior prompts cluster on one domain, subsequent prompts should diversify by selecting an underrepresented domain.

## Platform Integration

### Settings Configuration (`[ref:.claude/settings.json::e246ecd]`)
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

### Permissions
```json
"deny": ["Task(claude-code-guide)", "Task(Explore)", "Task(Plan)"]
```

## Extension Points

### Adding New Agents
1. Create YAML profile in `agents/`
2. Create flow file in `flows/`
3. Run `ah validate agents`

### Updating Hypothesis Domains
1. Edit available domains in `settings.json` under `emergent.hypothesisDomains`
2. Domains are passed to emergent planner via `HYPOTHESIS_DOMAINS` template variable

### Adding New Schemas
1. Create YAML in `schemas/` for agent-facing
2. Create Zod schema in `[ref:.allhands/harness/src/lib/schemas]` for internal

## When to Update This Reference

- Update when changing the `.allhands/` directory structure or adding new top-level directories
- Update when modifying the TUI lifecycle, pane layout, or EventLoop behavior
- Update when adding or modifying schema definitions (agent-facing YAML or internal Zod)
- Update when changing agent profile format, spawn configuration fields, or template variables
- Update when modifying project settings structure or hypothesis domain configuration. For hook event matchers, see `tools-commands-mcp-hooks.md` instead

## Related References

- [`tools-commands-mcp-hooks.md`](tools-commands-mcp-hooks.md) — When modifying hooks, CLI commands, or MCP server integration
- [`writing-flows.md`](writing-flows.md) — When changes affect flow directory structure or conventions
- [`harness_skills.md`](harness_skills.md) — When changes affect skill discovery or the schema system
