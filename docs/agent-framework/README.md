---
description: Agent framework meta-documentation covering agent taxonomy, skill composition, hook enforcement, and command patterns for Claude Code orchestration.
---

# Agent Framework

## Overview

This framework provides a structured approach to orchestrating Claude Code agents through composable primitives: agents define roles and capabilities, skills provide domain expertise, hooks enforce behaviors, and commands expose workflows to users.

The framework philosophy centers on **context efficiency** - providing agents with minimal sufficient context for deterministic task execution. Each component serves a specific purpose in the orchestration hierarchy, enabling parallel specialist delegation while maintaining coherent task completion.

## Key Decisions

### Discovery vs Implementation Separation

Agents are designed to perform ONE role - either discovery (research, analysis, findings) or implementation (code changes, file writes). This separation prevents context pollution and enables cleaner handoffs.

The surveyor agent [ref:.claude/agents/surveyor.md::d0d5d7f] exemplifies pure discovery - it can only read and analyze, never modify. The worker agent [ref:.claude/agents/worker.md::d0d5d7f] exemplifies pure implementation.

**Rationale:** Mixed-mode agents accumulate context from both phases, degrading performance at ~50% context capacity. Separation enables specialist delegation with focused context windows.

### Specialist Over Generalist

The framework favors domain-specific specialists over generic helpers. The curator agent [ref:.claude/agents/curator.md::cf5a964] owns all orchestration infrastructure, the researcher agent [ref:.claude/agents/researcher.md::d0d5d7f] owns external information gathering.

**Rationale:** Generic "helper" agents cannot maintain consistent patterns. Specialists develop deep expertise in their domains and produce higher quality outputs.

### Skills as Composable Expertise

Skills are filesystem-based capabilities that agents can reference. Rather than embedding expertise in agent prompts, skills live in the skills directory and are loaded on demand.

**Rationale:** This enables expertise sharing across agents, independent skill evolution, and progressive disclosure - SKILL.md loads essential principles while workflows/ contains detailed procedures.

### Hook-Based Enforcement

Critical behaviors are enforced via hooks rather than prompt instructions. The validation hook [ref:.claude/hooks/scripts/validate_artifacts.py::c15ff37] validates agent/skill/command structure on session start.

**Rationale:** Prompts can be ignored under context pressure. Hooks execute programmatically with blocking capability, providing reliable enforcement.

## Architecture Patterns

### Component Hierarchy

The framework organizes components by their role in the orchestration flow:

| Component | Purpose | Configuration |
|-----------|---------|---------------|
| Agents | Role definitions with tool/skill access | .claude/agents/*.md |
| Skills | Domain expertise modules | .claude/skills/*/SKILL.md |
| Hooks | Behavioral enforcement | .claude/hooks.json + scripts |
| Commands | User-facing workflows | .claude/commands/*.md |

### Agent Routing

The main agent routes tasks to specialists based on description field matching. Each agent's description must contain trigger keywords and differentiate from peers.

The planner agent [ref:.claude/agents/planner.md::d0d5d7f] triggers on "create plan", "refine plan". The documentation-taxonomist [ref:.claude/agents/documentation-taxonomist.md::d923206] triggers on "plan docs", "segment codebase".

### Skill Composition

Agents declare skills in their frontmatter. The curator lists nine skills providing orchestration expertise:

- claude-code-patterns: Native feature documentation
- research-tools: External search capability via envoy
- orchestration-idols: Multi-agent coordination patterns
- discovery-mode: Read-only analysis workflow

### Workflow Protocols

Agents with complex workflows embed INPUTS/OUTPUTS contracts. The planner agent accepts mode, workflow_type, feature_branch and returns success status after user gate approval.

This contract pattern enables reliable delegation - the main agent knows exactly what to send and what to expect back.

## Technologies

### Pure XML Structure

All orchestration files use XML tags rather than markdown headings. This provides:
- Better semantic parsing by Claude
- Token efficiency (no # symbols)
- Clear section boundaries

See the skills-development skill [ref:.claude/skills/skills-development/SKILL.md::4dcde68] for the router pattern using XML tags.

### YAML Frontmatter

Agent and skill files require YAML frontmatter with name, description, and optional fields (tools, skills, model). The validation hook enforces this structure.

### Envoy CLI

The framework uses envoy for external tool access rather than MCP servers. Commands like `envoy perplexity research` and `envoy tavily search` are documented in the research-tools skill [ref:.claude/skills/research-tools/SKILL.md::4dcde68].

## Use Cases

### Planning Workflow

Users invoke `/plan` to start feature planning. The main agent:
1. Gathers requirements via progressive disclosure
2. Delegates to specialists for discovery
3. Delegates to planner for prompt creation
4. Hands off to `/continue` for implementation

### Agent Creation

Users invoke `/create-specialist` when a domain lacks a specialist. The workflow:
1. Creates curator branch (outside planning material)
2. Gathers requirements via input gate
3. Delegates to curator for agent creation
4. Runs audit and testing before merge

### Documentation Generation

Users invoke `/docs-init` for comprehensive documentation. The taxonomist segments the codebase, then parallel writers create knowledge-base docs using symbol references.

## Further Reading

- Agents: Detailed agent taxonomy and role distinctions
- Skills: Skill composition philosophy and router pattern
- Hooks: Hook enforcement patterns and validation strategies
- Commands: Command conventions and parameter patterns
