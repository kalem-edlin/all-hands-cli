<goal>
Review implementation for domain best practices compliance. Per **Knowledge Compounding**, findings feed back to improve skills and documentation.
</goal>

<inputs>
- Alignment doc path
- Spec doc path
- Specific domain to focus on (e.g., react-native/expo, trpc/serverless, database/drizzle/supabase, web/tanstack/nextjs, dev tooling, CICD)
</inputs>

<outputs>
- Critical review of best practices compliance
- Improvements needed, ordered by priority
- Summary of violations (for compounding to encode back into harness)
</outputs>

<constraints>
- MUST extract skills using SKILL_EXTRACTION.md subtask
- MUST search codebase knowledge for established patterns
- MUST order issues by priority for fixing
</constraints>

## Context Gathering

- Read the alignment doc for prompt summaries
- Identify domain-relevant implementation files changed from base branch
- Identify and read prompts that touched this domain

## Best Practices Extraction

Spawn subtask to read `.allhands/flows/shared/SKILL_EXTRACTION.md`:
- Provide the domain files as input
- Extract patterns, preferences, and pitfalls for this domain

Search codebase knowledge:
- Run `ah knowledge docs search "<domain> best practices"` for established patterns
- Run `ah knowledge docs search "<domain> architecture"` for design decisions

## Review Process

Compare implementation against extracted best practices:

| Check | Question |
|-------|----------|
| Patterns | Does implementation follow established code patterns? |
| Preferences | Are library/approach preferences honored? |
| Pitfalls | Does implementation avoid known pitfalls? |
| Consistency | Is style consistent with codebase conventions? |
| Wiring | Are components properly connected (imports, API calls, state flow)? |
| Completeness | Is implementation substantive or placeholder-heavy? |

## Output Format

Return findings ordered by priority:

```
## Domain: <domain-name>

### P1 (Blocking)
- [Issue]: [What violates] -> [How to fix]

### P2 (Important)
- [Issue]: [What violates] -> [How to fix]

### P3 (Minor)
- [Issue]: [What violates] -> [How to fix]

## Compounding Notes
- [What should be encoded into skills/docs to prevent recurrence]
```

Compounding agent will use this to update harness based on engineer decisions.