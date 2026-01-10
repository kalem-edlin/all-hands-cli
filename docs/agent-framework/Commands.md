---
description: Command conventions covering naming patterns, parameter handling, workflow orchestration, and the role of slash commands in exposing framework capabilities to users.
---

# Command Conventions

## Overview

Slash commands are user-facing workflows that expand as prompts in Claude conversations. They provide standardized entry points to framework capabilities, orchestrating agent delegation and user interaction.

Commands bridge user intent to agent execution - they gather context, invoke appropriate agents, and manage multi-step workflows.

## Design Philosophy

### Commands as Orchestrators

Commands don't implement functionality directly. They orchestrate:
1. Context gathering from user and environment
2. Agent delegation with appropriate inputs
3. User gates for approval/feedback
4. Handoff to subsequent commands

The /plan command [ref:.claude/commands/plan.md::abc1234] exemplifies this - it gathers requirements, delegates to specialists, then hands off to /continue.

### Progressive Disclosure

Commands use progressive disclosure for complex workflows. Rather than asking all questions upfront, they:
1. Ask categorical questions first
2. Build domain-specific questions from answers
3. Offer "continue with current context" options

This reduces cognitive load while ensuring sufficient context.

### XML Structure

Command bodies use pure XML tags after YAML frontmatter:

```xml
<objective>...</objective>
<context>...</context>
<process>...</process>
<success_criteria>...</success_criteria>
```

This provides clear section boundaries and better parsing.

## Implemented Commands

### Planning Workflow

**plan** [ref:.claude/commands/plan.md::abc1234]

**Purpose:** Orchestrate full planning workflow
**Arguments:** [user-prompt] [--quick | --create | --refine]
**Behavior:**
- Quick mode: Minimal inference, simple plan, no questions
- Create mode: New feature planning with progressive disclosure
- Refine mode: Amend existing plan with new requirements

The command includes a Feature Knowledge Bank with domain-specific questions for UI/Frontend, Backend/API, Full-stack, Observability, DX, and Infrastructure.

**continue** [ref:.claude/commands/continue.md::abc1234]

**Purpose:** Loop through plan prompts for implementation
**Behavior:**
- Gets next prompts respecting dependencies
- Delegates to specialists for implementation
- Extracts documentation after each prompt
- Runs full review before completion
- Calls mandatory doc audit

**whats-next** [ref:.claude/commands/whats-next.md::abc1234]

**Purpose:** Suggest next steps after plan completion
**Behavior:**
- Analyzes completed plan context
- Generates 3-5 contextual suggestions
- Provides routing guidance (/plan, /debug, /plan --refine)

### Artifact Creation

**create-specialist** [ref:.claude/commands/create-specialist.md::abc1234]

**Purpose:** Create new specialist agent
**Arguments:** [initial context]
**Behavior:**
- Creates curator branch (outside planning material)
- Gathers requirements via input gate
- Delegates to curator for creation
- Runs audit and allows testing before merge

**create-skill** [ref:.claude/commands/create-skill.md::abc1234]

**Purpose:** Create new skill for agent capabilities
**Arguments:** [user prompt]
**Behavior:**
- Similar workflow to create-specialist
- Gathers skill goals, users, reference URLs
- Creates skill directory with SKILL.md

### Documentation

**docs-init** [ref:.claude/commands/docs-init.md::abc1234]

**Purpose:** Initialize documentation for codebase
**Arguments:** [...optional paths] [optional context]
**Behavior:**
- Creates docs branch if on base branch
- Delegates to taxonomist for segmentation
- Runs parallel writers in worktree isolation
- Merges worktrees and validates before PR

**docs-adjust** and **docs-audit** provide incremental updates and validation.

### Utility

**validate** [ref:.claude/commands/validate.md::abc1234]

**Purpose:** Show detailed .claude/ validation errors
**Behavior:** Runs validation script, displays errors

**curator-audit** [ref:.claude/commands/curator-audit.md::abc1234]

**Purpose:** Run curator audit (placeholder, not yet implemented)

## Command Patterns

### Context Injection

Commands inject dynamic context via backtick execution:

```markdown
<context>
Plan status: !`envoy plan check`
Current branch: !`git branch --show-current`
</context>
```

The output becomes part of the expanded prompt. Note: use without space between ! and backtick in actual commands.

### Arguments Handling

**$ARGUMENTS** captures all user input after command name:

```markdown
Fix issue #$ARGUMENTS following our coding standards
```

**Positional arguments** use $1, $2, $3:

```markdown
Review PR #$1 with priority $2 and assign to $3
```

Commands declare expected arguments via `argument-hint` in frontmatter.

### Agent Delegation

Commands delegate to agents with explicit contracts:

```markdown
Delegate to **planner agent**:
* "Run planning-workflow. INPUTS: `{ mode: 'create', feature_branch: '<branch>' }`"
* OUTPUTS: `{ success: true }`
```

The INPUTS/OUTPUTS format ensures both command author and agent understand the contract.

### User Gates

Commands use AskUserQuestion for approval points:

```markdown
AskUserQuestion: "Plan created. Ready to implement?"
Options: ["Yes", "Need changes", "Cancel"]
```

Gates prevent runaway execution and enable user course correction.

### Command Chaining

Commands can invoke other commands:

```markdown
<step name="handoff">
Call /continue command
</step>
```

This enables workflow composition without duplicating logic.

## Naming Conventions

### Verb-First Naming

Commands use verb-first names that describe the action:
- create-specialist (not specialist-create)
- docs-init (not init-docs)
- validate (not validation)

### Domain Prefixes

Related commands share prefixes:
- docs-init, docs-adjust, docs-audit
- create-specialist, create-skill

This groups commands in help output and enables discovery.

### Hyphen Separation

Multi-word commands use hyphens:
- whats-next (not whatsnext or whats_next)
- create-skill (not createskill)

## Required Tags

Every command should include:

**<objective>** - What and why
```xml
<objective>
Create a new specialist agent tailored to a specific domain.
</objective>
```

**<process>** - How, with named steps
```xml
<process>
<step name="setup_branch">...</step>
<step name="input_gate">...</step>
</process>
```

**<success_criteria>** - Definition of done
```xml
<success_criteria>
- Curator branch created
- Specialist requirements gathered
- Changes committed and merged
</success_criteria>
```

## Conditional Tags

**<context>** - For dynamic state loading
**<constraints>** - Hard rules the command must follow
**<knowledge_bank>** - Reference information for complex decisions

## Anti-Patterns

### Commands That Implement

Commands should orchestrate, not implement. If a command contains significant logic, that logic likely belongs in a skill or agent.

### Missing User Gates

Long workflows without checkpoints leave users unable to course correct. Add gates at natural decision points.

### Undocumented Arguments

Commands with arguments must include argument-hint in frontmatter. Users need to know what to provide.

### Monolithic Commands

Commands over 200 lines become hard to maintain. Consider splitting into multiple commands with handoffs.

### Generic Descriptions

Descriptions like "Does useful stuff" don't help routing. Be specific about trigger conditions and outcomes.
