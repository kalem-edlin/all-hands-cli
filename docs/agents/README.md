---
description: "Index of agent domain documentation covering the configuration system, agent categories (planning, execution, quality, orchestration, knowledge), and workflow orchestration."
---

# Agents

Agent profiles define types, behaviors, and TUI integration via YAML configuration. Agents are grouped by their role in the development lifecycle.

## Configuration

| Topic | Doc |
|---|---|
| YAML schema, validation, template variables | `docs/agents/agent-configuration-system.md` |
| Workflow configs and hypothesis domains | `docs/agents/workflow-agent-orchestration.md` |

## Agent Categories

| Category | Agents | Doc |
|---|---|---|
| Planning | ideation, planner | `docs/agents/planning-agents.md` |
| Execution | executor, emergent | `docs/agents/execution-agents.md` |
| Quality & Review | judge, pr-reviewer, e2e-test-planner | `docs/agents/quality-review-agents.md` |
| Orchestration | coordinator | `docs/agents/orchestration-agent.md` |
| Knowledge | compounder, documentor | `docs/agents/knowledge-agents.md` |
