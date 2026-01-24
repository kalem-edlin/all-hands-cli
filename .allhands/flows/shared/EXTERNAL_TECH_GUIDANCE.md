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

### Open Source Inspiration (Clone & Browse)

For exploring GitHub repositories locally:

1. **Search for repositories**:
   ```bash
   gh search repos "<query>" --limit 5
   ```

2. **Clone to local research folder**:
   ```bash
   # Clone into .reposearch folder (gitignored)
   mkdir -p .reposearch
   git clone --depth 1 <repo-url> .reposearch/<repo-name>
   ```

   Note: Ensure `.reposearch/` is in the project's `.gitignore`.

3. **Browse locally with standard tooling**:
   - Use `Glob` to find files by pattern
   - Use `Grep` to search code content
   - Use `Read` to examine specific files
   - Use `ls` to explore directory structure

4. **Clean up when done** (optional):
   ```bash
   rm -rf .reposearch/<repo-name>
   ```

This approach leverages the agent's superior local file navigation capabilities:
- Full regex search across the codebase
- Fast pattern matching and file discovery
- Direct file reading without API encoding issues
- Study implementation patterns in similar projects
- Extract architectural decisions
- Note how libraries handle similar problems

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