<goal>
Core harness integration for all agents. Per **Context is Precious**, this flow contains only universal behaviors that apply to every agent type.
</goal>

<constraints>
- MUST use `ah knowledge docs search <descriptive_query>` for code search tied to crucial project knowledge for any codebase discovery needs
- MUST use `tldr semantic search <descriptive_query>` for code search when a specific piece of functionality is required to be found
- MUST read `.allhands/principles.md` when making architectural decisions
- NEVER repeat instructions found in sub-flows; reference them instead
</constraints>

## Proactive Delegation

Per **Context is Precious**, delegate work to subtasks. Here are some, but not all flows that you can tell the subtask to read:

- `.allhands/flows/shared/CODEBASE_UNDERSTANDING.md`
- `.allhands/flows/shared/EXTERNAL_TECH_GUIDANCE.md`
- `.allhands/flows/shared/RESEARCH_GUIDANCE.md`
- `.allhands/flows/shared/SKILL_EXTRACTION.md`
