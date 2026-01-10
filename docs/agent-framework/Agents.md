---
description: Agent taxonomy documenting role distinctions, routing triggers, tool restrictions, and when to use each agent type in the orchestration hierarchy.
---

# Agent Taxonomy

## Overview

Agents are specialized Claude instances with focused roles, tool access, and skill assignments. The framework defines eight agents organized by their primary function in the orchestration flow.

The taxonomy reflects the discovery/implementation separation principle - agents either gather information or execute changes, never both in the same invocation.

## Design Decisions

### Role Specialization

Each agent owns a specific domain with clear boundaries. The curator [ref:.claude/agents/curator.md::cf5a964] owns all .claude/ infrastructure. The researcher [ref:.claude/agents/researcher.md::d0d5d7f] owns external information gathering. This prevents overlap confusion and enables confident routing.

**Why no generic agents?** Generic "helper" agents produce inconsistent outputs. Specialists develop deep patterns for their domains and route cleanly based on task characteristics.

### Tool Least Privilege

Agents receive only the tools their role requires. The surveyor [ref:.claude/agents/surveyor.md::abc1234] has Read, Glob, Grep, Bash - no Write or Edit. The worker [ref:.claude/agents/worker.md::abc1234] has full file manipulation capability.

**Rationale:** Tool restrictions enforce role boundaries. A discovery agent with write access might modify files when it should only gather context.

### Model Selection by Complexity

Agents declare model preference based on task complexity:

| Model | Use Case | Example Agents |
|-------|----------|----------------|
| opus | Complex reasoning, planning | planner, curator, researcher |
| sonnet | Balanced capability | default for most |
| haiku | Simple analysis | surveyor |
| inherit | Match parent context | documentation agents |

The surveyor uses haiku because discovery tasks require pattern recognition, not complex reasoning.

### Skill Bundling

Agents declare skills in frontmatter to receive domain expertise. The curator bundles nine skills covering orchestration, research, and development patterns.

Skills load on agent invocation, providing specialized knowledge without bloating base prompts.

## Agent Categories

### Orchestration Agents

**curator** [ref:.claude/agents/curator.md::cf5a964]
- **Role:** Claude Code infrastructure expert
- **Triggers:** .claude/, CLAUDE.md, hooks, skills, agents, slash commands
- **Skills:** claude-code-patterns, research-tools, orchestration-idols, and six more
- **Key behavior:** Enforces context efficiency across all orchestration components

**planner** [ref:.claude/agents/planner.md::abc1234]
- **Role:** Solutions architect for prompt creation
- **Triggers:** "create plan", "refine plan", "add prompt"
- **Key behavior:** Transforms specialist findings into sequenced, dependency-tracked prompts
- **Output:** Returns success only after user gate approval

### Discovery Agents

**surveyor** [ref:.claude/agents/surveyor.md::abc1234]
- **Role:** Generic codebase discovery
- **Triggers:** Fallback when no domain specialist matches discovery tasks
- **Tools:** Read, Glob, Grep, Bash (no write capability)
- **Model:** haiku (lightweight analysis)
- **Key behavior:** Returns concise findings, never bulk code dumps

**researcher** [ref:.claude/agents/researcher.md::d0d5d7f]
- **Role:** External information gathering
- **Triggers:** Web search, API docs, library documentation
- **Skills:** research-tools (provides envoy commands for Tavily, Perplexity, Grok)
- **Key behavior:** Discovery only - synthesizes findings with sources

### Implementation Agents

**worker** [ref:.claude/agents/worker.md::abc1234]
- **Role:** Generic codebase implementation
- **Triggers:** Fallback when no domain specialist matches implementation tasks
- **Tools:** Full set including Write, Edit
- **Key behavior:** Gathers context before implementing, follows codebase conventions

**code-simplifier** [ref:.claude/agents/code-simplifier.md::abc1234]
- **Role:** Code refinement specialist
- **Triggers:** After code changes, clarity/consistency review
- **Key behavior:** Preserves functionality while improving readability
- **Constraint:** Avoids nested ternaries, prefers explicit over compact code

### Documentation Agents

**documentation-taxonomist** [ref:.claude/agents/documentation-taxonomist.md::abc1234]
- **Role:** Documentation architecture
- **Triggers:** "plan docs", "segment codebase"
- **Key behavior:** Views codebase as products/features, not directories
- **Output:** Creates directory structure, returns writer assignments

**documentation-writer** [ref:.claude/agents/documentation-writer.md::abc1234]
- **Role:** Knowledge-base documentation creation
- **Triggers:** Delegated by taxonomist with specific domain assignment
- **Key behavior:** Uses symbol references, never inline code
- **Constraint:** Works in worktree isolation for parallel execution

## Routing Patterns

### Description-Based Routing

The main agent matches task characteristics against agent descriptions. Descriptions must:
1. State primary responsibility clearly
2. Include trigger keywords
3. Differentiate from peer agents

**Good description:**
> External research specialist with web search capability. Use for ANY external information gathering: API docs, library documentation, best practices, implementation patterns, external URLs.

**Why this works:** Contains explicit triggers (API docs, web search, external URLs) and clarifies scope (external vs internal).

### Fallback Chain

When no specialist matches:
1. Discovery tasks → surveyor agent
2. Implementation tasks → worker agent

Fallbacks use generic capabilities rather than failing the delegation.

### Parallel Delegation

Independent tasks can delegate to multiple agents simultaneously. Documentation writers run in parallel using worktree isolation to prevent merge conflicts.

## Workflow Contracts

### Input/Output Protocol

Agents with workflows define explicit contracts:

**Inputs:** What the main agent must provide
**Outputs:** What the agent returns on completion

The planner accepts:
- mode: "create" | "refine" | "quick"
- workflow_type: "feature" | "debug"
- feature_branch: branch name

And returns:
- success: true (plan accepted)
- or success: false with reason

### Success Criteria

Agents must complete ALL required work before returning. The planner won't return until:
- Prompts written with dependencies
- Dependencies validated
- Gemini audit passed
- User gate approved

Incomplete returns waste main agent context.

## Anti-Patterns

### Mixed Discovery/Implementation

An agent that both discovers and implements accumulates context from both phases. At ~50% context capacity, quality degrades.

**Solution:** Separate into pure discovery and pure implementation agents.

### Generic Helper Agents

Agents named "helper", "assistant", or without clear domain produce inconsistent outputs.

**Solution:** Create task-specific specialists with clear triggers.

### Agents Without Success Criteria

Agents that return without verifiable completion leave the main agent uncertain about task state.

**Solution:** Define explicit success criteria and verify before returning.
