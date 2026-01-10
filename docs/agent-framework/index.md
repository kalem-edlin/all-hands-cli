---
description: Claude Code orchestration framework enabling multi-agent workflows through specialized agents, protocols, skills, hooks, and commands that coordinate planning and implementation phases.
---

# Agent Framework

## Overview

The agent framework solves the fundamental challenge of context management in LLM-powered development workflows. Claude Code excels at focused tasks but degrades at approximately 50% context capacity. Rather than trying to hold everything in one conversation, this framework decomposes work across specialized agents, each operating with minimal context for their specific task.

The architecture enforces a strict separation between discovery (read-only analysis) and implementation (write operations). This separation exists because mixing both modes leads to premature commitment - agents that can write tend to implement the first solution they find rather than exploring alternatives. By forcing discovery to complete before implementation begins, the framework surfaces tradeoffs and options that would otherwise be missed.

## Key Decisions

**Agent role specialization over generalist agents**: Each agent has a single responsibility. The surveyor [ref:.claude/agents/surveyor.md::1b91430] only discovers and never implements. The worker [ref:.claude/agents/worker.md::d0d5d7f] only implements and assumes discovery is complete. This prevents role confusion where an agent might oscillate between exploring and building.

**Protocol-driven workflows over ad-hoc delegation**: Agents follow explicit protocols [ref:.claude/protocols/discovery.yaml::6607b05] that define inputs, outputs, and steps. This removes ambiguity about what an agent should do and enables reliable workflow composition. The main agent delegates by naming a protocol, not by explaining the task from scratch.

**Envoy-mediated persistence over return values**: Discovery agents write findings to plan files via envoy commands rather than returning bulk context. This pattern acknowledges that findings often exceed what the main agent can usefully process in its context window. The main agent receives confirmation plus a path, reading details only when needed.

**Skills as loadable expertise rather than inline instructions**: Skills [ref:.claude/skills/discovery-mode/SKILL.md::dbb53d3] provide domain knowledge that agents load on demand. This prevents the CLAUDE.md [ref:CLAUDE.md::6607b05] file from becoming bloated with every possible instruction. The curator agent [ref:.claude/agents/curator.md::6607b05] enforces this by auditing for redundancy.

**Branch-based isolation for parallel work**: Implementation happens in git worktrees derived from a feature branch. This allows multiple variants of the same prompt to be implemented in parallel, with a gate determining which becomes the main solution. Rejected variants become archive branches rather than lost work.

## Patterns

The framework follows a layered architecture where each layer has distinct responsibilities.

**Main agent layer**: The main agent orchestrates but rarely implements. It gathers requirements, segments work by domain, and delegates to specialists. The CLAUDE.md file contains routing rules that help the main agent choose appropriate specialists based on task relevance and scope narrowness.

**Specialist layer**: Domain specialists like the curator handle specific areas (orchestration infrastructure). They have skills loaded automatically and operate with focused context. Specialists may further delegate to generic agents (surveyor, worker) for tasks outside their direct expertise.

**Generic agent layer**: Surveyor and worker serve as fallbacks when no domain specialist matches. They follow the same protocols as specialists but without domain-specific skills loaded.

**Hook layer**: Startup hooks [ref:.claude/hooks/startup.sh::e12e962] initialize context before the main agent receives any prompt. Validation scripts [ref:.claude/hooks/scripts/validate_artifacts.py::c15ff37] ensure configuration integrity. This layer runs without agent involvement, establishing invariants the framework depends on.

## Technologies

The framework builds on Claude Code's native capabilities: the Task tool for subagent delegation, markdown files for agent definitions, YAML frontmatter for configuration. Envoy provides a CLI interface for plan management, git operations, and external service integration (Gemini for audits, Perplexity for research). Git worktrees enable isolated implementation branches without filesystem conflicts.

## Use Cases

**Feature development**: A user invokes the plan command [ref:.claude/commands/plan.md::dbb53d3]. The main agent gathers requirements through progressive disclosure, delegates discovery to relevant specialists, aggregates findings, then hands off to the planner [ref:.claude/agents/planner.md::d0d5d7f] who creates sequenced prompts. The continue command [ref:.claude/commands/continue.md::dbb53d3] then loops through prompts, delegating each to appropriate specialists for implementation.

**Bug investigation**: The debug command [ref:.claude/commands/debug.md::dbb53d3] follows a similar pattern but uses the bug-discovery protocol [ref:.claude/protocols/bug-discovery.yaml::6607b05] for specialists. Approaches become hypotheses about bug causes. The debugging protocol [ref:.claude/protocols/debugging.yaml::c15ff37] extends implementation with structured logging that gets cleaned up after the fix is validated.

**Orchestration maintenance**: When someone needs to create a new agent or skill, the curator agent handles it. The curator loads relevant skills like subagents-development [ref:.claude/skills/subagents-development/SKILL.md::1297377] and skills-development [ref:.claude/skills/skills-development/SKILL.md::4dcde68] automatically. This ensures orchestration components follow established patterns rather than being created ad-hoc.
