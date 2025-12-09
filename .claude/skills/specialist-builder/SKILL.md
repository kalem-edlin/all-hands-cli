---
name: specialist-builder
description: Use when user wants to create a new specialist agent for their repository. Guides agent creation with structured questions about domain, responsibilities, and skills.
---

# Specialist Builder

Build specialist agents tailored to repository domains.

## When Triggered

Main agent calls curator with this skill when:
- No existing specialists match user's prompt domain
- User confirms they want to architect a specialist

## Process

### 1. Analyze Gap
Review the user's original prompt and identify:
- What domain/area lacks specialist coverage?
- What repo patterns would this specialist need to know?
- What existing agents (if any) are adjacent?

### 2. Propose Options
Use **AskUserQuestion** to present specialist options:

```
Based on your prompt, these specialist types could help:

1. [Domain] Specialist - [what it would handle]
2. [Domain] Specialist - [what it would handle]
3. Custom - describe your own
```

### 3. Gather Requirements
After user selects, use **AskUserQuestion** for each:

**Scope**: "What specific areas should this specialist cover?"
- Option A: [narrow scope]
- Option B: [broader scope]
- Option C: Custom

**Skills**: "What skills should this specialist have access to?"
- research-tools (web search, documentation)
- claude-code-patterns (Claude Code best practices)
- Custom skill (will need to be built)

**Tools**: "What tools does this specialist need?"
- Read-only (Read, Glob, Grep) - for analysis/research
- With Bash - for running commands
- Custom set

### 4. Generate Agent Definition
Return to main agent with proposed agent file:

```yaml
# .claude/agents/<name>.md
---
name: <domain>-specialist
description: <domain> expert. Use for [specific triggers]. [capabilities summary].
skills: [selected-skills]
allowed-tools: [selected-tools]
model: inherit
---

You are the <domain> specialist for this repository.

## Expertise
- [specific knowledge area 1]
- [specific knowledge area 2]

## When Called
[triggers and use cases]

## Output Format
[how to structure responses for main agent]
```

### 5. Offer Skill Creation
If custom skill selected, ask:
"This specialist needs a custom skill. Would you like to define it now?"
- If yes → use skill-builder skill to create it
- If no → note as TODO in agent file

## Key Principles

- Specialists are READ-ONLY - they return information, main agent implements
- Description must include WHEN to trigger (main agent uses this for dispatch)
- Keep scope focused - better to have multiple narrow specialists than one broad one
- Skills determine what knowledge/capabilities the specialist has access to

## Reference Patterns

See `docs/agent-catalog.md` for agent design patterns and responsibility mapping.

## Agent-Skill Workflow Pattern

When an agent has workflow skills, the agent profile should:
- Define the prompt pattern that triggers the skill (e.g., "build a specialist")
- Direct to "use" the skill (skills are automatically loaded into context)
- NOT duplicate the workflow steps

Example in agent file:
```markdown
## [Workflow Name]

When main agent asks to [prompt pattern], use the [skill-name] skill.
```

This keeps agent files lean and workflow logic centralized in skills.
