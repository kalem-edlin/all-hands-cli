---
name: specialist-builder
description: Use when user asks to "create an agent", "add a subagent", or needs guidance on agent frontmatter, triggering examples, system prompts, tools, or colors.
---

# Specialist Builder

Build specialist agents tailored to repository domains.

For initial research this is a great researouce of specialist plugins (which ship agents with their commands and skills) (see their agent.md files):
**https://github.com/wshobson/agents/tree/main/plugins**

## When Triggered

Main agent calls curator with this skill when:
- No existing specialists match user's prompt domain
- User confirms they want to architect a specialist
- User says "create an agent", "add an agent", "write a subagent"

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

**Agent Pattern**: "What type of agent is this?"
- Analysis (code review, security audit, research)
- Generation (code, tests, docs)
- Validation (linting, checking, verification)
- Orchestration (multi-step workflows)

**Skills**: "What skills should this specialist have access to?"
- research-tools (web search, documentation)
- claude-code-patterns (Claude Code best practices)
- Custom skill (will need to be built)

**Tools**: "What tools does this specialist need?"
- Read-only (Read, Glob, Grep) - for analysis/research
- With Bash - for running commands
- Full access - omit tools field to inherit all

### 4. Generate Agent Definition
Return to main agent with proposed agent file following the structure below.

### 5. Offer Skill Creation
If custom skill selected, ask:
"This specialist needs a custom skill. Would you like to define it now?"
- If yes: use skill-development skill to create it
- If no: note as TODO in agent file

## Agent File Structure

### Complete Format

```markdown
---
name: agent-identifier
description: |
  [Role description with trigger keywords and responsibility scope].

  <example>
  user: "trigger1 | trigger2 | trigger3"
  </example>
model: inherit
color: blue
allowed-tools: Read, Glob, Grep
skills: skill-name
---

You are [agent role description]...

**Your Core Responsibilities:**
1. [Responsibility 1]
2. [Responsibility 2]

**Process:**
[Step-by-step workflow]

**Output Format:**
[What to return]
```

## Frontmatter Fields

### name (required)

Agent identifier used for namespacing and invocation.

**Format:** lowercase, numbers, hyphens only
**Length:** 3-50 characters
**Pattern:** Must start and end with alphanumeric

**Good examples:**
- `code-reviewer`
- `test-generator`
- `api-docs-writer`

**Bad examples:**
- `helper` (too generic)
- `-agent-` (starts/ends with hyphen)
- `my_agent` (underscores not allowed)
- `ag` (too short)

### description (required)

Defines when Claude should trigger this agent. **Most critical field.**

**Must include:**
1. Concise description with trigger keywords and responsibility scope
2. ONE `<example>` block with variant syntax for compression

**Format (condensed pattern):**
```yaml
description: |
  [Role description with trigger keywords].

  <example>
  user: "trigger1 | trigger2 | trigger3"
  </example>
```

**Variant syntax:** Use `|` to separate trigger phrase variants within a single example. This compresses multiple triggering scenarios into minimal context.

**Example:**
```yaml
description: |
  Research specialist for web search, documentation lookup, external info gathering.

  <example>
  user: "Research [topic] | Find docs for [library] | What are best practices for [pattern]?"
  </example>
```

**Do NOT include:**
- Multiple `<example>` blocks (use variant syntax instead)
- `<commentary>` blocks (description conveys reasoning)
- Context or assistant response lines

See `references/triggering-examples.md` for additional patterns.

### model (required)

Which model the agent should use.

**Options:**
- `inherit` - Use same model as parent (recommended)
- `sonnet` - Claude Sonnet (balanced)
- `opus` - Claude Opus (most capable)
- `haiku` - Claude Haiku (fast)

### color (required)

Visual identifier for agent in UI.

**Guidelines:**
| Color | Use For |
|-------|---------|
| blue/cyan | Analysis, review |
| green | Success-oriented tasks |
| yellow | Caution, validation |
| red | Critical, security |
| magenta | Creative, generation |

### allowed-tools (optional)

Restrict agent to specific tools. **Principle of least privilege.**

**Common tool sets:**
- Read-only analysis: `Read, Grep, Glob`
- Code generation: `Read, Write, Grep`
- Testing: `Read, Bash, Grep`
- Full access: Omit field to inherit all

### skills (optional)

Skills to auto-load when agent starts. Comma-separated list.

## System Prompt Patterns

Four patterns for agent system prompts. See `references/system-prompt-patterns.md` for templates.

| Pattern | Use When |
|---------|----------|
| Analysis | Reviewing, auditing, researching |
| Generation | Creating code, tests, docs |
| Validation | Checking, verifying, linting |
| Orchestration | Multi-step workflows |

## AI-Assisted Agent Generation

For complex agents, use this prompt template:

```json
{
  "request": "[USER DESCRIPTION]",
  "requirements": {
    "core_intent": "Extract primary purpose",
    "persona": "Define expert role for domain",
    "system_prompt": {
      "behavioral_boundaries": true,
      "specific_methodologies": true,
      "edge_case_handling": true,
      "output_format": true
    },
    "identifier": "lowercase-hyphens, 3-50 chars",
    "description": "trigger keywords + ONE condensed example block",
    "example": "ONE <example> with variant syntax (trigger1 | trigger2 | trigger3)"
  }
}
```

## Key Principles

- Specialists are READ-ONLY - they return information, main agent implements
- Description must include WHEN to trigger (main agent uses this for dispatch)
- Keep scope focused - better to have multiple narrow specialists than one broad one
- Skills determine what knowledge/capabilities the specialist has access to
- Use ONE condensed `<example>` block with variant syntax (`|`) for trigger phrases

## Reference Files

| File | Content |
|------|---------|
| `references/triggering-examples.md` | Example block anatomy and patterns |
| `references/system-prompt-patterns.md` | Four agent pattern templates |
| `examples/complete-agent-examples.md` | Full working agent examples |
| `scripts/validate-agent.sh` | Validate agent file structure and content |

## Agent-Skill Workflow Pattern

When an agent has workflow skills, the agent profile should:
- Define the prompt pattern that triggers the skill
- Direct to "use" the skill (skills are automatically loaded into context)
- NOT duplicate the workflow steps

Example in agent file:
```markdown
## [Workflow Name]

When main agent asks to [prompt pattern], use the [skill-name] skill.
```

**Why this works:**
- Agent's `skills:` frontmatter lists skills to auto-load into context
- Main agent triggers agent based on description examples
- Agent body references skill by name - skill content already available
- No duplication: skill owns workflow logic, agent owns triggering conditions

This keeps agent files lean and workflow logic centralized in skills.
