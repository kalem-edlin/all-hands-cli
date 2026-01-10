---
description: Agent hierarchy design separating main agent orchestration from specialist execution, with discovery-only and implementation-only roles preventing mode confusion.
---

# Agent Architecture

## Overview

The agent system addresses a core problem: LLMs perform better with focused roles than generalist instructions. By decomposing tasks into specialized agents with constrained responsibilities, each agent operates with minimal context and clear success criteria. The main agent orchestrates but rarely implements, delegating to specialists who either discover (read-only) or implement (write) but never both in the same invocation.

## Key Decisions

**Discovery and implementation as mutually exclusive modes**: An agent invocation is either discovery or implementation, never both. Discovery agents like the surveyor [ref:.claude/agents/surveyor.md::1b91430] have read-only tool access (Glob, Grep, Read) and write findings via envoy commands to plan files. Implementation agents like the worker [ref:.claude/agents/worker.md::d0d5d7f] have write access (Write, Edit) and assume all discovery is complete. This separation prevents the common failure mode where an agent explores a problem, finds a partial solution, and immediately implements it without considering alternatives.

**Curator as orchestration owner**: The curator [ref:.claude/agents/curator.md::6607b05] owns all Claude Code infrastructure: agents, skills, hooks, commands, envoy. Any modification to orchestration components routes through the curator, which has skills loaded for each subsystem. This prevents ad-hoc changes that might break the framework's assumptions. The curator also audits changes for context efficiency, ensuring new content doesn't bloat the system.

**Planner as plan owner**: The planner [ref:.claude/agents/planner.md::d0d5d7f] transforms discovery findings into implementation prompts. It sequences tasks, tracks dependencies, and handles the complexity of variant approaches. The planner never implements - it creates the roadmap that implementation agents follow. This separation means planning decisions (what to build, in what order) are made once, then implementation agents execute without second-guessing.

**Researcher for external context**: The researcher [ref:.claude/agents/researcher.md::d0d5d7f] handles all external information gathering through web search, API documentation lookup, and URL extraction. By isolating external research to a dedicated agent, the framework avoids polluting implementation agents' context with research artifacts. The researcher returns synthesized findings, not raw data.

**Generic fallbacks for unmatched tasks**: Surveyor and worker exist as generic versions of discovery and implementation agents. When the main agent cannot confidently match a task to a domain specialist, these fallbacks ensure work continues. They follow the same protocols as specialists but without domain-specific skills.

## Patterns

**Agent frontmatter configuration**: Every agent file starts with YAML frontmatter specifying name, description, tools, model, and skills. The description field is critical for routing - it should include trigger keywords that help the main agent identify when to delegate. Tools follow least-privilege: discovery agents get read tools, implementation agents get write tools.

**Success criteria completeness**: Agents must complete all required work before returning to the main agent. Incomplete returns waste main agent context because it must re-delegate with additional instructions. The success criteria section of each agent defines what "done" means, and agents should not return until those criteria are met.

**Protocol compatibility**: Most agents are protocol-compatible, meaning they can follow any protocol that matches their capabilities. Protocol-compatible agents have internal workflows prefixed with "Fallback workflow. Use only when no protocol explicitly requested." Non-protocol agents like planner have their workflows as primary since they serve specific orchestration roles.

**Model selection by complexity**: Simple discovery tasks use haiku for speed and cost efficiency. Complex reasoning tasks use opus. The model field in frontmatter controls this. Agents can specify "inherit" to use whatever model the main conversation is using.

## Use Cases

**Main agent receives implementation request**: The main agent segments the request by domain, identifies which specialists have relevant domain_files overlap, and delegates discovery segments. After discovery completes, findings go to the planner. After planning completes with user approval, the main agent enters the implementation loop via continue command, delegating prompts to specialists based on the files each prompt touches.

**No specialist matches**: When no domain specialist confidently matches a discovery segment, the main agent asks the user whether to create a new specialist. If the user declines, the surveyor handles discovery. For implementation, the worker serves as fallback. This ensures work proceeds even without specialized agents.

**Curator modification request**: When someone asks to modify agents, skills, or hooks, the main agent delegates to the curator. The curator loads relevant skills automatically and follows patterns for that component type. After modification, the curator may invoke validation hooks to ensure the change didn't break assumptions.
