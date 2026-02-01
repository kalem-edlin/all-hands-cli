<goal>
Acquire explicit documentation and implementation inspiration from external technologies. Per **Frontier Models are Capable**, this provides the specific implementation guidance needed to deduce "how" from "why".
</goal>

<inputs>
- Query for context7 or open source repo exploration
- Query type indication: open source GitHub project OR proprietary documentation only
- Relevant codebase files to inject into query context (if applicable)
</inputs>

<outputs>
- Summary of guidance provided
- Strong implementation examples/suggestions inferred from tool responses
</outputs>

<constraints>
- MUST use context7 for documentation references
- MUST clone open source repos to `.reposearch/` for local exploration
- MUST run both approaches in parallel when query benefits from dual perspective
- MUST NOT USE OTHER TOOLING THAN DESCRIBED HERE UNLESS BOTH OPTIONS ARE FAILING TO PROVIDE RESULTS
</constraints>

## Tool Selection

| Query Type | Tool | Purpose |
|------------|------|---------|
| Documentation lookup | `ah context7 search` | Official docs and API references |
| Open source exploration | `gh search` + clone | Clone repo locally for full file navigation |
| Both applicable | Run in parallel | Well-rounded perspective |

## Usage Patterns

### Documentation Only (context7)

For proprietary domains with documentation pages:
- Run `ah context7 search "<technology> <query>"`
- Extract API patterns, configuration examples
- Note version-specific behaviors

### Open Source Inspiration (`ah spawn reposearch`)

Use `ah spawn reposearch` to clone external GitHub repos and delegate research to an AI agent that searches across both the current project and external codebases.

**OSS codebase answers** — ask how a specific project handles something:
```bash
ah spawn reposearch "How does this project handle authentication?" --repos https://github.com/org/project
```

**Cross-repo comparison** — compare our implementation vs an external project:
```bash
ah spawn reposearch "Compare our error handling approach vs theirs" --repos https://github.com/org/project
```

**Multi-framework comparison** — check out 2+ repos, compare approaches side-by-side:
```bash
ah spawn reposearch "How do these projects handle routing?" --repos https://github.com/a/repo,https://github.com/b/repo
```

Re-running the same command with the same repos is fast — repos are cached locally between invocations.

### Parallel Exploration

Most cases benefit from both tools:
- Documentation gives official guidance
- Source code reveals actual implementation patterns
- Cross-reference for comprehensive understanding

## Query Formulation

When injecting codebase context:
- Include relevant file paths from this codebase
- Explain how query relates to existing implementation
- Ask specific questions about integration approach

## Output Synthesis

Provide:
- Summary of what guidance was found
- Specific implementation suggestions
- Code patterns to follow
- Gotchas or edge cases discovered