## General Rules

- Never leave comments that mark a update in code given a user prompt to change code - if you can't justify them, don't leave them.
- When deleting files/functions, be sure to use LSP to understand the implications of the change. If LSP calls lack results, use GREP for further references.

## Human Checkpoints

Use AskUserQuestion before:

- Creating/modifying agents, skills, hooks → delegate to curator for implementation
- External API calls, architectural decisions

## Main Agent: Specialist Routing

When delegating to specialists:

1. **Task relevance**: Match task domain to specialist's declared capabilities
2. **Scope narrowness**: Prefer specialists whose domain_files overlap most with task files

## Envoy Usage and Error Handling

Always call envoy via `envoy <group> <command> [args] --agent <agent_name>` - DO NOT use npx, tsx, ts-node or any other wrapper, nor any other path than "envoy" itself. Always attempt to add your agent name to envoy commands for visibility.

Envoy commands fail in two ways:

1. **stderr/non-zero exit**: Command crashed
2. **{ success: false, error: "...", ... }**: Command ran but operation failed

On failure, agent should infer recovery based on workflow context:

- **Timeout errors**: Return exit, wait for human instructions
- **Recoverable errors**: Re-delegate, retry with different params, or skip non-critical step
- **Ambiguous situations**: Use AskUserQuestion with options

## Research Policy

Research is critical. Never assume you know the up to date approach / technology for solving a problem.

- **Web search**: Only curator/researcher agents (others blocked by hook)
- **URL extraction**: All agents can use `envoy tavily extract "<url>"` for known doc URLs
- **GitHub content**: Use `gh` CLI instead of extract (e.g., `gh api repos/owner/repo/contents/path`)

## Codebase Exploration

When exploring the codebase for context (understanding patterns, investigating behavior, gathering requirements), you MUST invoke `/codebase-understanding` skill first.

## CLAUDE.md Maintenance

This file MUST only be edited via curator agent consultation. Changes require curator approval.

## Background Agent Diagnostics

Due to subagent log verbosity, only read subagent/parallel agent output when:

- Agent has been running abnormally long with no completion
- User reports or suspects a specific agent is stuck
- Retrieving final results after confirmed completion

## Project-Specific Instructions

@CLAUDE.project.md
