<goal>
Discover ALL documentable approaches/features within a domain. Per **Frontier Models are Capable**, identify engineering knowledge comprehensively - it's better to over-discover than under-discover.

Engineering knowledge sources: prompts, commit messages, and alignment docs when provided (Incremental mode), otherwise infer decisions and intent from the code itself (Fill-the-Gaps mode).
</goal>

<inputs>
- `domain`: Name of the domain to analyze
- `source_paths`: Directories/files to scan
- `mode`: "fill-gaps" or "incremental"
- `session_context`: (incremental only) Summary from alignment doc
</inputs>

<outputs>
- List of approaches with associated files and symbols
- Recommended documentation structure
</outputs>

<constraints>
- MUST use `ah knowledge docs search` to check existing documentation coverage
- MUST return structured approach list, not prose
- MUST cover all significant features, grouping by feature to stay **under 20 approaches**
- NEVER propose approaches already fully documented
- NEVER split a single command/feature into multiple approaches
</constraints>

## Analysis Strategy

Run `tldr structure <source_path>` to get full codemap, then identify **user-facing features and systems**:

### What makes a good approach (= one doc file)?
- A CLI command with all its implementation details
- A subsystem that serves a clear purpose (e.g., "MCP integration", "TUI components")
- A workflow or pattern used across the codebase
- An integration with external services

### What should NOT be separate approaches?
- Helper functions (belong in parent feature's doc)
- Internal utilities (group with related features)
- Implementation details of a larger feature
- Multiple files that serve the same purpose

## Coverage Check

- Run `ah knowledge docs search "<domain>"` to find existing docs
- For each identified approach:
  - Check if already documented
  - If partial coverage, note gaps
  - If no coverage, mark as new

## Grouping Heuristics

**One approach = one documentation file.** Group aggressively:

| Pattern | Grouping |
|---------|----------|
| CLI command + all its helpers/implementation | **Single approach** |
| Related utilities (even 5-10 functions) | **Single approach** |
| Subsystem with multiple files serving one purpose | **Single approach** |
| Large system with truly distinct user-facing parts | Multiple approaches |
| Cross-cutting pattern used everywhere | Single pattern-focused approach |

**Key principle**: Only create separate approaches when someone would realistically search for them as distinct topics. Most helper functions, internal utilities, and implementation details belong in their parent feature's doc.

## Output Format

Return structured YAML with **intelligent directory groupings**:

```yaml
domain: "<domain-name>"
approaches:
  - name: "<approach-name>"
    description: "<one-line purpose>"
    group: "<subdirectory-name>"  # e.g., "cli", "tui", "hooks", or null for flat
    files:
      - "<path/to/file.ts>"
    symbols:
      - "<FunctionName>"
      - "<ClassName>"
    existing_coverage: "none" | "partial" | "full"
    notes: "<gaps or special considerations>"
recommended_structure:
  directories:
    - name: "cli"
      description: "Command-line interface commands"
      approach_count: 16
    - name: "tui"
      description: "Terminal UI components"
      approach_count: 4
    # Groups with <3 approaches stay flat (group: null)
  flat_files:
    - "docs/<domain>/test-harness.md"  # Single approach, no subdirectory
```

### Directory Grouping Rules

1. **Create subdirectory** when 3+ approaches share a logical category
2. **Keep flat** when approaches don't group logically or group has <3 files
3. **Name by concept**, not by source path (e.g., `cli/` not `commands/`)
4. **Common groupings** to consider:
   - `cli/` - Command implementations
   - `tui/` - UI components
   - `hooks/` - Hook categories
   - `integrations/` - External service integrations
   - `core/` - Core libraries (only if needed to disambiguate)

## Completeness Check

Before returning, verify:
- Are major user-facing features covered?
- Are key subsystems documented?
- Have you grouped related functionality together?

**Warning signs of over-discovery:**
- More than 20 approaches for a domain
- Multiple approaches for the same CLI command
- Separate approaches for helper/utility functions
- Approaches that would result in very short docs

If you exceed 20 approaches, consolidate related ones until under the limit.
