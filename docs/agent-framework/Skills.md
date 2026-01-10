---
description: Skill composition philosophy covering the router pattern, progressive disclosure, skill categories, and how skills provide composable domain expertise to agents.
---

# Skill Composition

## Overview

Skills are modular, filesystem-based capabilities that provide domain expertise on demand. When an agent declares a skill, that skill's SKILL.md is loaded into the agent's context, providing specialized knowledge without bloating base prompts.

The skill system embodies the framework's context efficiency principle - expertise lives in skills, not agents, enabling sharing and independent evolution.

## Design Philosophy

### Skills Are Prompts

All prompting best practices apply to skill authoring. Skills must be clear, direct, and use XML structure. The assumption is that Claude is intelligent - skills add only what Claude doesn't inherently know.

The skills-development skill [ref:.claude/skills/skills-development/SKILL.md::abc1234] documents this principle with guidance on prompt engineering within skills.

### SKILL.md Is Always Loaded

When a skill is invoked, Claude reads SKILL.md. This guarantee drives the organization:
- Essential principles belong in SKILL.md (cannot be skipped)
- Workflow-specific content belongs in workflows/
- Reusable knowledge belongs in references/

### Progressive Disclosure

Skills should remain under 500 lines. Detailed content splits into reference files that load only when needed for the current workflow.

This prevents context bloat while ensuring agents have access to deep expertise when required.

## Structure Patterns

### Simple Skill (Single File)

For focused expertise without complex workflows:

```
skill-name/
  SKILL.md    # Everything in one file
```

The git-ops skill [ref:.claude/skills/git-ops/SKILL.md::abc1234] demonstrates this pattern - git operations documented in a single SKILL.md with named workflows.

### Router Pattern (Complex Skill)

For skills with multiple workflows and reference material:

```
skill-name/
  SKILL.md              # Router + essential principles
  workflows/            # Step-by-step procedures
  references/           # Domain knowledge
  templates/            # Output structures
  scripts/              # Executable code
```

The skills-development skill [ref:.claude/skills/skills-development/SKILL.md::abc1234] demonstrates this pattern with workflows for creating, auditing, and upgrading skills.

**Router mechanics:** SKILL.md asks "what do you want to do?" then routes to the appropriate workflow. Workflows specify which references to read.

### Folder Purposes

| Folder | Content Type | Agent Action |
|--------|--------------|--------------|
| workflows/ | Multi-step procedures | FOLLOW steps exactly |
| references/ | Domain knowledge | READ for context |
| templates/ | Output structures | COPY and FILL |
| scripts/ | Executable code | EXECUTE as-is |

## Skill Categories

### Orchestration Skills

**claude-code-patterns** [ref:.claude/skills/claude-code-patterns/SKILL.md::abc1234]
- Reference for Claude Code native features
- Points to ~/.claude-code-docs/docs/ for authoritative documentation
- Categorizes docs by task type (skills, agents, hooks, MCP)

**orchestration-idols** [ref:.claude/skills/orchestration-idols/SKILL.md::abc1234]
- Patterns from production agent systems (wshobson/agents, claude-flow)
- Registry pattern, hive-mind consensus, hybrid memory
- Provides doc URLs for deeper research

**claude-envoy-patterns** [ref:.claude/skills/claude-envoy-patterns/SKILL.md::abc1234]
- Patterns for extending the envoy CLI
- Empty in current state, placeholder for future content

### Development Skills

**skills-development** [ref:.claude/skills/skills-development/SKILL.md::abc1234]
- Meta-skill for creating and auditing skills
- Router pattern with workflows for each operation
- Defines YAML requirements and structure principles

**subagents-development** [ref:.claude/skills/subagents-development/SKILL.md::abc1234]
- Guidance for creating custom agents
- File structure, configuration fields, system prompt guidelines
- References for evaluation, error handling, orchestration patterns

**hooks-development** [ref:.claude/skills/hooks-development/SKILL.md::abc1234]
- Expert guidance for hook creation
- Hook types, matchers, input/output schemas
- Security checklist and debugging guidance

**commands-development** [ref:.claude/skills/commands-development/SKILL.md::abc1234]
- Slash command creation patterns
- XML structure requirements, arguments handling
- Common patterns with examples

### Workflow Skills

**discovery-mode** [ref:.claude/skills/discovery-mode/SKILL.md::abc1234]
- Read-only codebase analysis mode
- Agents write findings via envoy commands
- Enables parallel specialist dispatch

**implementation-mode** [ref:.claude/skills/implementation-mode/SKILL.md::abc1234]
- Prompt execution lifecycle
- History tracking, review iteration, commit workflow
- Normal and feedback modes

**research-tools** [ref:.claude/skills/research-tools/SKILL.md::abc1234]
- External research via envoy commands
- Tavily (search/extract), Perplexity (deep research), Grok (X/Twitter)
- Decision tree for tool selection

### Process Skills

**git-ops** [ref:.claude/skills/git-ops/SKILL.md::abc1234]
- Standardized git operations
- Commit messages, PR creation, conflict resolution
- Safety rules for destructive operations

**brainstorming** [ref:.claude/skills/brainstorming/SKILL.md::abc1234]
- Design exploration before implementation
- Progressive questioning approach
- Validates designs in small sections

**documentation-taxonomy** [ref:.claude/skills/documentation-taxonomy/SKILL.md::abc1234]
- Reference for documentation system
- Envoy docs commands, complexity metrics, symbol reference format
- Segmentation strategies and worktree patterns

## Composition Patterns

### Agent-Skill Binding

Agents declare skills in frontmatter:

```yaml
skills: research-tools, discovery-mode
```

Skills load when the agent is invoked. The curator binds nine skills, giving it comprehensive orchestration expertise.

### Skill Chaining

Workflows can reference other skills. The brainstorming skill mentions using "elements-of-style:writing-clearly-and-concisely skill if available".

This enables expertise composition without duplicating content.

### Skill as Documentation

Skills serve as living documentation for codebase areas. The commands-development skill documents how to create slash commands while providing actionable guidance.

When an agent needs to create a command, the skill provides both the "how" and the "why".

## Authoring Guidelines

### YAML Requirements

Required frontmatter fields:
- name: lowercase-with-hyphens, matches directory
- description: What it does AND when to use it (third person)

Name conventions: create-*, manage-*, setup-*, generate-*, build-*

### Pure XML Structure

Skills use XML tags, not markdown headings:

```xml
<objective>...</objective>
<quick_start>...</quick_start>
<process>...</process>
<success_criteria>...</success_criteria>
```

Markdown formatting remains valid within content (bold, lists, code blocks).

### Success Criteria

Every skill defines success criteria - how to know the skill was applied correctly. This enables agents to self-verify their work.

## Anti-Patterns

### Duplicate Expertise

Skills should not duplicate content already in agents or CLAUDE.md. If information belongs in multiple places, it likely belongs in a skill.

### Skills Too Large

Skills over 500 lines cause context bloat. Split into router pattern with workflows and references.

### Missing Routing

Complex skills without intake questions force agents to guess which workflow applies. Add explicit routing for multi-workflow skills.

### No Success Criteria

Skills without success criteria leave agents uncertain whether they applied the skill correctly.
