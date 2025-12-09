---
name: orchestration-idols
description: Use when designing agent orchestration, memory systems, or multi-agent coordination. Contains patterns from wshobson/agents and claude-flow repositories with doc URLs for deeper research.
---

# Idol Repository Patterns

Patterns from production agent orchestration systems. Use doc URLs below for deeper research when implementing specific features that should be inspired by these patterns.

## wshobson/agents

Simpler agent coordination patterns.

**Documentation:**
- Architecture: https://github.com/wshobson/agents/blob/main/docs/architecture.md
- README: https://github.com/wshobson/agents/blob/main/README.md

## claude-flow

Enterprise AI orchestration with extensive tooling. Achieves Claude Code goals via non-Claude-Code-API tooling - useful for understanding what's possible and adapting patterns.

**Core Documentation:**
- README: https://github.com/ruvnet/claude-flow/blob/main/README.md
- Architecture: https://github.com/ruvnet/claude-flow/blob/main/docs/architecture/ARCHITECTURE.md

**Skills & Agents:**
- Skills Tutorial: https://github.com/ruvnet/claude-flow/blob/main/docs/skills/skills-tutorial.md
- Agents Reference: https://github.com/ruvnet/claude-flow/blob/main/docs/reference/AGENTS.md
- Skill Builder: https://github.com/ruvnet/claude-flow/blob/main/.claude/skills/skill-builder/SKILL.md

**Methodology:**
- SPARC: https://github.com/ruvnet/claude-flow/blob/main/docs/reference/SPARC.md
- MCP Tools: https://github.com/ruvnet/claude-flow/blob/main/docs/reference/MCP_TOOLS.md

**Memory & Reasoning:**
- ReasoningBank: https://github.com/ruvnet/claude-flow/blob/main/docs/reasoningbank/README.md
- ReasoningBank Architecture: https://github.com/ruvnet/claude-flow/blob/main/docs/reasoningbank/architecture.md
- Claude Code Integration: https://github.com/ruvnet/claude-flow/blob/main/docs/reasoningbank/CLAUDE-CODE-INTEGRATION.md
- Reasoning: https://github.com/ruvnet/claude-flow/blob/main/docs/reasoning/README.md
- AgentDB Integration: https://github.com/ruvnet/claude-flow/blob/main/docs/agentdb/AGENTDB_INTEGRATION_PLAN.md

## Key Patterns Summary

### Registry Pattern
Dynamic agent loading via central registry. Agents discovered by config, not hardcoded.

### Hive-Mind Consensus
Decentralized coordination, not top-down control. Shared memory for state alignment.

### Hybrid Memory
- Vector search (AgentDB/HNSW): Fast semantic retrieval
- SQLite fallback (ReasoningBank): Reliable, no API keys
- Auto-consolidates successful patterns

### Context Management
- 5-exchange conversation limit per task
- Context recovery files for persistence across sessions

### Work-Stealing Load Balancing
Dynamic task redistribution from overloaded to underutilized agents.

## When to Research Deeper

Use deep-research skill with these URLs when:
- Implementing specific patterns (need exact structures)
- Adapting memory/reasoning systems
- Building new agent types
- Debugging coordination issues
