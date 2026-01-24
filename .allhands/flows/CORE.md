<goal>
Core harness integration for all agents. Per **Context is Precious**, this flow contains only universal behaviors that apply to every agent type.
</goal>

<constraints>
- MUST use `ah knowledge search <query>` for code search tied to crucial project knowledge
- MUST use `tldr semantic search <query>` for quick and intelligent code search
- MUST read `.allhands/principles.md` when making architectural decisions
- NEVER repeat instructions found in sub-flows; reference them instead
</constraints>

## Git Base Branch
 
For git commands, you can reference the base branch with `$BASE_BRANCH`