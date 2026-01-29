<goal>
Clear instructions on how to maintain flow files. Embodies the practice of defining clear, capable flows that trust frontier models to deduce "what" and "how" from well-articulated "why" alongside tooling/harness capabilities.
</goal>

<constraints>
- ALWAYS read `.allhands/principles.md` when authoring or maintaining flows
- ALWAYS label First Principles by name when they motivate a flow directive
</constraints>

## First Principles Applied

Flow authorship is driven by these principles from `.allhands/principles.md`:

| First Principle | Flow Directive |
|-----------------|----------------|
| **Context is Precious** | Be brief. Progressive disclosure. Don't over-explain. |
| **Frontier Models are Capable** | Provide "why", let agents deduce "what/how". Trust capability. |
| **Knowledge Compounding** | DRY - centralize instructions, reference rather than repeat. |

When a flow instructs a behavior, cite the motivating First Principle. This teaches agents to think like members of a model-first company.

## XML Tags

Reserved for drawing specific attention to rules, use as needed / where applicable:
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

- `flows/` root: Agent default flows, disclosed immediately
- `flows/subdirectories/`: Progressively disclosed flows with `<inputs>` and `<outputs>` tags for execution-agnostic subtasks

## Quickfire Flow Writing Tips

- **Action-verb bullets**: Start with verbs ("Read", "Use", "Follow", "Run")
- **Path backticking**: Consistently wrap paths and commands in backticks
- **Conditional simplicity**: Use "If X - Y" pattern, keep logic flat
- **Hierarchical nesting**: Sub-bullets for related sub-tasks only
- **Phase naming**: Section headers as capability phases (Context Gathering, Implementation, Validation, Completion)
- **Exit clarity**: End with explicit stop condition ("commit your work", "Stop")
- **Progressive disclosure**: Reference external flows for complexity ("read `.allhands/flows/FLOW.md` and follow its instructions")
- **Inline commands**: Embed CLI usage directly ("Run `ah schema prompt body`")
- **First Principle citation**: Label motivating principles by name to teach agents the "why" behind directives

## Northstar Example Flow

See `.allhands/flows/PROMPT_TASK_EXECUTION.md` 