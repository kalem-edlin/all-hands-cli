# Agent Orchestration System

## Core Rule

**MANDATORY DELEGATION**: Main agent MUST NEVER READ/FIND FILES (or use skills) - delegate ALL context-consuming work to subagents. Match task to agent descriptions.

**CURATOR SCOPE**: ANY task involving `.claude/`, hooks, agents, skills, CLAUDE.md, claude-envoy, or external pattern research → delegate to curator. This includes evaluating external repos for adoption patterns.

Main agent: SOLE code modifier WRITE ONLY, get implementation from subagents.
Subagent: READ-ONLY, return needed information/implementation to main agent.

## Planning

- When either:
  - STDOUT Requests planning mode
  - the user explicity requests planning mode,
- you MUST run `/plan` immediately - if the instructions fit the scenario
- `/plan` MUST BE USED before initial calls to the `planner` agent

- If in planning active mode (non direct mode), you MUST read the `.claude/plans/<branch>/plan.md` file into context.

## Main Agent: Delegation First

- Main agent should NEVER use skills - skills are for subagents only

- Main agent MUST delegate to relevant subagents for information instead of WebSearches and WebFetches or directly reading files into context

- Since you are required to delegate, if there is no suitable subagent, you MUST use AskUserQuestion to get explicit user approval to either: Proceed Against the Workflow Rules (dangerous), Suggest a new specialist sub agent, or respond to a new user prompt

## Project Rules

- Never leave comments that mark a update in code given a user prompt to change code.
- When deleting files/functions, use Grep tool to find and update all references.

## Git

- **Plan mode**: Planner agent handles git ops at checkpoints (has git-ops skill)
- **Direct mode** (main branch, no plan): Main agent uses git-ops skill directly

## Human Checkpoints

Use AskUserQuestion before:
- Creating/modifying agents, skills, hooks → delegate to curator for implementation
- External API calls, architectural decisions

## CLAUDE.md Maintenance

This file MUST only be edited via curator agent consultation. Changes require curator approval.

## Research Policy

- **Web search**: Only curator/researcher agents (others blocked by hook)
- **URL extraction**: All agents can use `.claude/envoy/envoy tavily extract "<url>"` for known doc URLs
- **GitHub content**: Use `gh` CLI instead of extract (e.g., `gh api repos/owner/repo/contents/path`)

## Parallel Execution

**Discovery (read-only, in-session):**
`/parallel-discovery <task>` - runs multiple subagents simultaneously

**Implementation (write-capable, cross-session):**
@.claude/docs/parallel-orchestration.md

## claude-envoy Usage

- Ensure you use it via `.claude/envoy/envoy <command> <args>` called relative to the project root.

When any subagent reports an `envoy` command failure:
1. Use AskUserQuestion: "[Tool] failed: [error]. Options: (A) Retry, (B) [use your best inferred alternative], (C) Skip"
2. In auto-accept mode: Infer best alternative and proceed
