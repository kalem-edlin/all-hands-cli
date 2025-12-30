# Agent Orchestration System


## Core Rule

**MANDATORY DELEGATION**: Main agent MUST NEVER READ/FIND/EDIT FILES (or use skills) - delegate ALL context-consuming work to subagents as per workflows and system reminders. Match task to agent descriptions.

**CURATOR SUB-AGENT SCOPE**: ANY task involving `.claude/`, hooks, agents, skills, CLAUDE.md, claude-envoy, or external pattern research → delegate to curator sub-agent. This includes evaluating external repos for adoption patterns.

## Main Agent: Delegation First

- Main agent should NEVER use skills - skills are for subagents only

- Main agent MUST delegate to relevant subagents for information instead of WebSearches and WebFetches or directly reading files into context

- Main agent writing/reading instead of required delegation can be done on one exception: if the current git branch is protected (main, master, develop, development, dev, staging, stage, production, prod, quick/*, curator/)

## General Rules

- Never leave comments that mark a update in code given a user prompt to change code.
- When deleting files/functions, use Grep tool to find and update all references.

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

## Context Budget (50% Rule)

Claude quality degrades at ~50% context usage. Mitigations:
- **Plans**: 2-3 tasks max per implementation step
- **Context gathering**: Delegate to subagents (keeps main agent lean)
- **Large files**: Use repomix `--compress` or targeted reads

## claude-envoy errors 

When any subagent reports an `envoy` command failure:
1. Use AskUserQuestion: "[Tool] failed: [error]. Options: (A) Retry, (B) [use your best inferred alternative], (C) Skip"
2. In auto-accept mode: Infer best alternative and proceed

## Project-Specific Instructions

@CLAUDE.project.md
