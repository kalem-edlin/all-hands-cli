# Harness Skills

Per **Knowledge Compounding**, skills are domain expertise packages that compound over time — agents discover them automatically and load only what they need per **Context is Precious**.

## Skill Schema

Skills are defined by a YAML frontmatter manifest. Run `ah schema skill` for the authoritative schema. Key fields:

- **name**: Skill identifier (e.g., `harness-maintenance`)
- **description**: When to use this skill — agents match on this
- **version**: Semver for tracking changes
- **globs**: File patterns that trigger skill discovery (e.g., `".allhands/flows/**/*.md"`)

## Directory Conventions

```
.allhands/skills/
├── <skill-name>/
│   ├── SKILL.md          # Hub: frontmatter + routing table
│   └── references/       # Domain-specific reference docs (optional)
│       ├── topic-a.md
│       └── topic-b.md
```

- `SKILL.md` is the entry point — always a compact routing hub
- `references/` (or `docs/`) contains deep domain knowledge
- Agents read the hub first, then load only the reference matching their scenario

## Discovery Mechanism

Skills are discovered via glob matching against the files an agent is working on:

1. Agent touches a file (e.g., `.allhands/flows/shared/MY_FLOW.md`)
2. Harness matches file against all skill globs
3. Matching skill(s) are surfaced to the agent
4. Agent reads `SKILL.md` hub for routing context

List all skills: `ah skills list`

## Hub-and-Spoke Pattern

This restructure establishes the convention for all harness skills:

**Hub** (`SKILL.md`):
- Compact (<100 lines) routing document
- Contains `<goal>`, `<constraints>`, cross-cutting patterns
- **Routing table**: Maps scenarios to specific reference docs
- Agents always start here

**Spokes** (`references/*.md`):
- Deep, domain-specific knowledge
- Loaded only when the routing table directs
- Flexibly structured per domain (no rigid template)
- Grounded in codebase reality (file paths, commands, schema fields)

### When to Create a New Skill vs Extend Existing

**Create new** when:
- The domain is distinct (different file patterns, different expertise)
- The knowledge doesn't fit under any existing skill's glob patterns
- Agents working in this domain need dedicated context

**Extend existing** when:
- The knowledge falls within an existing skill's glob patterns
- Adding a new reference doc to the existing hub covers it
- The domain is a sub-specialty of an existing skill

## Reference Doc Guidelines

Per **Context is Precious**, each reference doc should:
- Start with the most relevant first principles for that domain
- Be grounded in codebase reality (file paths, schema fields, command examples)
- Structure itself flexibly to fit its domain
- Be concise — agents load only what they need

## Existing Skills

| Skill | Purpose | Pattern |
|-------|---------|---------|
| `harness-maintenance` | Harness architecture and extension | Hub + `references/` |
| `claude-code-patterns` | Claude Code native features | Hub + `docs/` |

## Related References

- [`writing-flows.md`](writing-flows.md) — When authoring reference docs or skill entry-point flows
- [`knowledge-compounding.md`](knowledge-compounding.md) — When skills need to compound knowledge via schemas or indexes
- [`core-architecture.md`](core-architecture.md) — When skill globs or discovery interact with directory structure
