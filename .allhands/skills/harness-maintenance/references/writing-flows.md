# Writing Flows

Per **Context is Precious** and **Frontier Models are Capable**, flows articulate "why" so agents deduce "what" and "how". This reference covers flow authorship patterns, structure conventions, and the progressive disclosure model.

## First Principles Applied

| First Principle | Flow Directive |
|-----------------|----------------|
| **Context is Precious** | Be brief. Progressive disclosure. Don't over-explain. |
| **Frontier Models are Capable** | Provide "why", let agents deduce "what/how". Trust capability. |
| **Knowledge Compounding** | DRY - centralize instructions, reference rather than repeat. |

When a flow instructs a behavior, cite the motivating First Principle. This teaches agents to think like members of a model-first company.

## XML Tags

Reserved for drawing specific attention to rules, use as needed:
- `<goal>`: Motivations and contribution to the wider harness
- `<constraints>`: Hard rules (NEVER/MUST/ALWAYS)
- `<ownership>`: Files and domains the agent is restricted to
- `<success_criteria>`: Validation criteria for task completion
- `<inputs>`: Inputs required for the flow to execute
- `<outputs>`: Outputs expected from the flow

## Structure

Per **Frontier Models are Capable**:
- Start with `<goal>` - the "why" that enables capable deduction
- Organize into `##` sections representing phases or capability chunks
- Use bullet points for individual units of capability:
  - "Read `path/to/FLOW_DOC.md`"
  - "Use `ah [command]` to [action]"
  - "Think deeply about X, Y, and Z"

Per **Context is Precious**:
- Reference other flows for progressive disclosure rather than repeating
- Keep flows brief - agents only see what they need, when they need it

Per **Knowledge Compounding**:
- Centralize instructions, use decision trees that reference capability chunks
- Don't repeat messaging, instructions, or command usage across flows

## File Organization

- `flows/` root: Agent default flows, disclosed immediately on spawn
- `flows/shared/`: Progressively disclosed via references in parent flows
- `flows/shared/jury/`: Specialized review sub-agents

### Progressive Disclosure Pattern
```markdown
- Read `.allhands/flows/shared/SKILL_EXTRACTION.md` and follow its instructions
```

Sub-flows use `<inputs>` and `<outputs>` tags for execution-agnostic subtasks. This decouples the flow from its caller — any agent can execute it given the right inputs.

## Quickfire Writing Tips

- **Action-verb bullets**: Start with verbs ("Read", "Use", "Follow", "Run")
- **Path backticking**: Consistently wrap paths and commands in backticks
- **Conditional simplicity**: Use "If X - Y" pattern, keep logic flat
- **Hierarchical nesting**: Sub-bullets for related sub-tasks only
- **Phase naming**: Section headers as capability phases (Context Gathering, Implementation, Validation, Completion)
- **Exit clarity**: End with explicit stop condition ("commit your work", "Stop")
- **Progressive disclosure**: Reference external flows for complexity ("read `.allhands/flows/FLOW.md` and follow its instructions")
- **Inline commands**: Embed CLI usage directly ("Run `ah schema prompt body`")
- **First Principle citation**: Label motivating principles by name to teach agents the "why" behind directives

## Northstar Example

See `.allhands/flows/PROMPT_TASK_EXECUTION.md` — this flow demonstrates all conventions: `<goal>`, `<constraints>`, phase sections, action-verb bullets, progressive disclosure via sub-flow references, and explicit completion steps.

## When to Update This Reference

- Update when adding or modifying XML tag conventions (`<goal>`, `<constraints>`, `<inputs>`, `<outputs>`, etc.)
- Update when changing flow file organization or directory structure (`flows/`, `flows/shared/`, `flows/shared/jury/`)
- Update when evolving the progressive disclosure pattern or sub-flow referencing conventions
- Update when adding new writing conventions or structure patterns for flows

## Related References

- [`core-architecture.md`](core-architecture.md) — When your flow change touches directory structure, TUI lifecycle, or schema system
- [`harness_skills.md`](harness_skills.md) — When creating a flow that should be discoverable as a skill entry point
