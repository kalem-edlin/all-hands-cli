---
name: discovery-mode
description: Read-only codebase analysis mode. Agents write findings via envoy commands, not direct file writes. Enables parallel specialist dispatch with explicit naming.
---

<objective>
Enable agents to perform read-only codebase analysis during planning phase. Agents gather context, analyze patterns, and write findings via envoy commands. ALL specialists can propose options when alternatives exist.
</objective>

<quick_start>
```bash
# Write approach (required)
envoy plans write-approach \
  --specialist "<your-name>" \
  --summary "2-3 sentence summary" \
  --files '[{"path": "src/auth/service.ts", "purpose": "Core auth logic"}]' \
  --content "Full analysis..."

# Write options (when alternatives exist)
envoy plans write-option \
  --specialist "<your-name>" \
  --id "1A" --group "Token storage" --name "httpOnly cookies" \
  --summary "Store tokens in httpOnly cookies..." \
  --trade-offs '{"pros": ["XSS protection"], "cons": ["CSRF required"]}' \
  --recommendation "Best for same-origin apps" \
  --content "Full implementation details..."
```
</quick_start>

<constraints>
- **Read-only mode** - NO file edits except via envoy findings commands
- **Envoy-mediated writes** - use `write-approach` and `write-option` commands
- **Use assigned specialist name** - main agent provides name for findings subdirectory
</constraints>

<workflow>
### 1. Receive Context
Main agent provides: target directories, questions, specialist name

### 2. Analyze Codebase
Use: Glob, Grep, Read

### 3. Write Findings

**Approach (required)**:
```bash
envoy plans write-approach \
  --specialist "<name>" \
  --summary "Brief summary for main agent" \
  --files '[{"path": "...", "purpose": "..."}]' \
  --related-options '["1A", "1B"]' \
  --content "Full analysis"
```

**Options (only if alternatives exist that the approach file mentions)**:
```bash
envoy plans write-option \
  --specialist "<name>" \
  --id "1A" \
  --group "Token storage" \
  --name "httpOnly cookies" \
  --summary "Brief summary" \
  --trade-offs '{"pros": [...], "cons": [...]}' \
  --recommendation "When to use this option" \
  --content "Full details"
```

### 4. Return Confirmation
Return path + 1-2 line summary. Do NOT return full analysis.
</workflow>

<option_schema>
Options use simplified schema:
- `--id`: Single identifier (e.g., "1A", "1B", "2A")
- `--group`: Display grouping (options with same prefix are related)
- `--status`: Defaults to "pending" (main agent sets to selected/rejected)

Related options share group prefix: "1A" and "1B" are alternatives in group "1".
</option_schema>

<replace_mode>
When re-invoked after user feedback (re-discovery loop):

```bash
# Check for existing findings
envoy plans has-findings --specialist "<name>"

# Read previous approach
envoy plans read-finding --specialist "<name>" --type approach

# Write new approach with --replace (clears existing options)
envoy plans write-approach \
  --specialist "<name>" \
  --replace \
  --summary "..." \
  --files '[...]' \
  --content "Combined previous + new analysis"
```

Replace mode: read previous → combine with new prompt → overwrite findings.
</replace_mode>

<success_criteria>
- Approach file written via envoy
- Options written when alternatives exist
- Brief confirmation returned (not full analysis)
- No direct file modifications
</success_criteria>
