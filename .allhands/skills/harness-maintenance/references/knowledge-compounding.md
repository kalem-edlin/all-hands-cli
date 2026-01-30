# Knowledge Compounding

Per **Knowledge Compounding**, everything feeds forward — decisions, pivots, limitations, realizations, best practices, and preferences. The harness captures and surfaces knowledge so future agent work benefits from all past work.

## Documentation Schemas

The harness defines schemas for structured knowledge artifacts. Run `ah schema <type>` to inspect any schema:

| Schema | File Pattern | Purpose |
|--------|-------------|---------|
| `prompt` | `.planning/*/prompts/*.prompt.md` | Task definition and completion records |
| `alignment` | `.planning/*/alignment.md` | Milestone context, prompt summaries, decisions |
| `spec` | `specs/**/*.spec.md` | Feature specifications |
| `skill` | `.allhands/skills/*/SKILL.md` | Domain expertise manifests |
| `validation-suite` | `.allhands/validation/*.md` | Validation tooling definitions |
| `solution` | `docs/solutions/*.md` | Reusable solution documentation |
| `documentation` | `docs/*.md` | General documentation |

Run `ah schema <type> body` to see the body format (not just frontmatter).

## Knowledge Indexes

### Solutions (`docs/solutions/`)
Reusable patterns discovered during work. Searchable by future agents:
- `ah solutions search "<keywords>"` — Find relevant past solutions
- Solutions are created when an agent discovers a reusable pattern worth preserving
- Per **Knowledge Compounding**, solutions prevent re-discovery of known patterns

### Memories (`ah memories`)
Agent learnings and engineer preferences that persist across sessions:
- `ah memories search "<keywords>"` — Find relevant learnings
- Captures: debugging insights, preference decisions, architectural rationale
- Per **Knowledge Compounding**, memories prevent repeated mistakes

### Knowledge Docs
Codebase knowledge indexed for semantic search:
- `ah knowledge docs search <descriptive_query>` — Semantic code search
- Built from codebase during TUI startup (semantic index)
- Per **Context is Precious**, agents search rather than loading full codebase

## How Knowledge Feeds Forward

### Prompt Completion Cycle
Per **Prompt Files as Units of Work**, completed prompts document what was decided:
1. Agent completes prompt tasks
2. Summary appended to prompt file (decisions, deviations, learnings)
3. Summary appended to alignment doc's "## Prompt Summaries" section
4. Future agents read alignment doc to see all completed work without reading each prompt

### Compaction Summaries
Per **Knowledge Compounding**, compaction preserves work across context boundaries:
1. `agent-compact` hook parses transcript for session summary
2. Oracle generates summary with decision (CONTINUE/RESTART/BLOCKED)
3. Summary appended to prompt file
4. Same prompt can be re-run with accumulated learnings

### Skill Improvement
Skills and validation tooling improve with use:
- Skills gain new reference docs as domains expand
- Validation suites crystallize stochastic patterns into deterministic checks
- Solutions capture reusable patterns discovered during implementation

## Compounding Principles from `principles.md`

The **Knowledge Compounding** principle states:
> Everything feeds forward — decisions, pivots, limitations, disagreements, realizations, best practices, preferences. The harness implementation itself improves with use. Future tasks benefit from all past work.

This manifests in:
- **Alignment docs**: Cross-prompt visibility without context bloat
- **Solution docs**: Reusable pattern library growing with each milestone
- **Memories**: Persistent learnings across agent sessions
- **Validation suites**: Crystallized quality checks that compound
- **Skills**: Domain expertise packages that deepen over time

## When to Update This Reference

- Update when adding or modifying documentation schemas (`ah schema` types)
- Update when changing knowledge index commands (`ah solutions`, `ah memories`, `ah knowledge`)
- Update when modifying the prompt completion cycle or summary compounding flow
- Update when changing compaction summary behavior or knowledge preservation patterns. For compaction hook mechanics, see `tools-commands-mcp-hooks.md` instead

## Related References

- [`validation-tooling.md`](validation-tooling.md) — When knowledge artifacts involve validation suites or crystallization
- [`harness_skills.md`](harness_skills.md) — When knowledge compounds through skill improvement or reference docs
