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

## Workflow Issues (Heal Pattern)

When user spots issues with .claude/ artifacts or workflow:
1. **Delegate to curator** with the complaint
2. Curator investigates → proposes fix with before/after diff
3. Get user approval before applying
4. Curator applies fix and commits

Never attempt to fix workflow issues directly - curator handles all .claude/ maintenance.

## CLAUDE.md Maintenance

This file MUST only be edited via curator agent consultation. Changes require curator approval.

## Research Policy

- **Web search**: Only curator/researcher agents (others blocked by hook)
- **URL extraction**: All agents can use `.claude/envoy/envoy tavily extract "<url>"` for known doc URLs
- **GitHub content**: Use `gh` CLI instead of extract (e.g., `gh api repos/owner/repo/contents/path`)

## Context Budget (50% Rule)

Claude quality degrades at ~50% context usage. Mitigations:
- **Plans**: 2-3 tasks max per implementation step
- **Context gathering**: Delegate to subagents (keeps main agent lean)
- **Large files**: Use repomix `--compress` or targeted reads
- **Session handoff**: Use `/whats-next` before context exhaustion

## Parallel Execution

**Mode 1: `/parallel-discovery`** (read-only, in-session)
- Spawns multiple subagents simultaneously
- Use for: planning research, multi-perspective analysis

**Mode 2: `parallel-worker` agent** (write-capable, cross-session)
- Spawns worktree subprocess via `envoy parallel spawn`
- Use for: isolated implementation tasks that can run in parallel
- Commands: `envoy parallel spawn/status/results/cleanup`

## claude-envoy Usage

- Ensure you use it via `.claude/envoy/envoy <command> <args>` called relative to the project root.

When any subagent reports an `envoy` command failure:
1. Use AskUserQuestion: "[Tool] failed: [error]. Options: (A) Retry, (B) [use your best inferred alternative], (C) Skip"
2. In auto-accept mode: Infer best alternative and proceed

## Project-Specific Instructions

@CLAUDE.project.md
