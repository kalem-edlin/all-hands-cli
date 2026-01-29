---
description: "Guidelines for authoring harness flow files driven by first principles and adding MCP server integrations to extend harness capabilities"
---

# Flow Authoring and MCP Tool Integration

Two complementary authoring guidelines: one for writing harness flows (the instruction layer), one for adding MCP server integrations (the tool layer). Both shape how agents receive direction and capability.

---

## Flow Authoring

[ref:.allhands/flows/shared/WRITING_HARNESS_FLOWS.md::79b9873]

### Principle-to-Directive Mapping

Every flow directive traces back to a first principle from [ref:.allhands/principles.md::79b9873]. This mapping is the foundation of flow authoring:

| First Principle | What It Means for Flows |
|-----------------|------------------------|
| **Context is Precious** | Be brief. Progressive disclosure. Reference rather than repeat. |
| **Frontier Models are Capable** | Provide "why," trust agents to deduce "what" and "how." |
| **Knowledge Compounding** | DRY -- centralize instructions, use decision trees that reference capability chunks. |

When a flow instructs a behavior, it must cite the motivating principle by name. This teaches agents to think in terms of the harness philosophy, not just follow instructions.

### Flow Anatomy

Flows use XML tags for structural attention:

| Tag | Purpose |
|-----|---------|
| `<goal>` | Motivations and contribution to the wider harness |
| `<constraints>` | Hard rules (NEVER / MUST / ALWAYS) |
| `<ownership>` | Files and domains the agent is restricted to |
| `<success_criteria>` | Validation criteria for task completion |
| `<inputs>` | Inputs required for the flow to execute |
| `<outputs>` | Outputs expected from the flow |

Body sections use `##` headers as capability phases (Context Gathering, Implementation, Validation, Completion). Bullet points start with action verbs. Paths and commands are backtick-wrapped. Conditionals use flat "If X - Y" patterns.

### File Organization

- `flows/` root: Agent default flows, disclosed immediately on agent startup
- `flows/subdirectories/`: Progressively disclosed flows with `<inputs>` and `<outputs>` tags, invoked by other flows

The northstar example flow is [ref:.allhands/flows/PROMPT_TASK_EXECUTION.md::79b9873].

---

## MCP Server Integration

[ref:.allhands/flows/shared/WRITING_HARNESS_MCP_TOOLS.md::79b9873]

### Integration Phases

```mermaid
flowchart LR
    R[Research] --> B[Build Config]
    B --> E[Environment Setup]
    E --> V[Validation]
```

**Research**: Investigate the MCP package via `ah tavily search` and `ah context7 search`. Identify transport type (stdio, http, sse), command/args, environment variables, and authentication method.

**Build Config**: Copy the template at `.allhands/harness/src/mcp/_template.ts` and populate with researched values -- name, description, transport config, environment variable references using `${VAR_NAME}` syntax, statefulness, and tool hints.

**Environment Setup**: Document required variables (name, where to obtain, expected format) without adding actual values. Check `.env.ai` for existing variables.

**Validation**: Build harness, verify server appears in `ah tools --list`, verify tools are discovered via `ah tools <server-name>`, and test a read-only tool call.

### Config Structure

Each MCP server config lives at `.allhands/harness/src/mcp/<server-name>.ts` and specifies:

| Field | Purpose |
|-------|---------|
| `name` | Short identifier (used in `ah tools <name>:tool`) |
| `description` | What the server provides |
| `type` | Transport: `stdio`, `http`, or `sse` |
| `command` / `args` | For stdio transport |
| `url` | For http/sse transport |
| `env` | Environment variable references |
| `stateful` | Whether server maintains session state |
| `toolHints` | Helpful hints for key tools |

### Design Decision: Sub-agent Execution

MCP integration runs as a sub-agent to avoid blocking the main thread. The main thread can proceed knowing the MCP server is (or will be) available, receiving a completion report with config path, available tools, environment requirements, and validation status.
