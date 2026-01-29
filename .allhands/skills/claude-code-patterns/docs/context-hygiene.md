# Context Hygiene Patterns

Read this when: building/modifying CLAUDE.md, debugging inconsistent agent behavior, designing multi-step workflows.

## CLAUDE.md Priority Rules

- CLAUDE.md = system rules (immutable, followed sequentially)
- User prompts = requests within rules (flexible, optimized)
- Front-load critical context in CLAUDE.md over dynamic file reads
- Markdown structure prevents instruction bleed

## Poison Context Detection

Signs context is poisoned:
- Agent pairs unrelated actions unexpectedly
- Old instructions persist when they shouldn't
- Competing rules cause inconsistent behavior

Fix: `/clear` or new session. Prevent: explicit task boundaries, avoid action pairing.
