---
description: Audit documentation for stale/invalid symbol references
argument-hint: [--fix] [optional docs path]
---

<objective>
Validate all documentation symbol references and fix stale/invalid references via documentation-writer agents. Main agent NEVER fixes documentation directly - writers must review source diffs to ensure prose accuracy.
</objective>

<context>
Current branch: !`git branch --show-current`
</context>

<critical-constraint>
**MAIN AGENT MUST NEVER EDIT DOCUMENTATION FILES DIRECTLY.**

Even "simple" hash updates require documentation-writer review because:
- Source file changed since doc was written
- Writer must diff the source change to verify prose still accurate
- Prose may need rewriting if implementation semantics changed
- Only documentation-writer agents have the context and mandate to make doc changes
</critical-constraint>

<process>
<step name="parse_arguments">
Parse $ARGUMENTS:
- `--fix` flag: automatically fix issues after presenting findings
- Path: specific docs path to audit (default: docs/)
</step>

<step name="run_validation">
Run validation:
```bash
envoy docs validate [--path <docs_path>]
```

Parse output - the `by_doc_file` field contains issues grouped by documentation file.
</step>

<step name="present_findings">
Present findings **grouped by doc file** (matching delegation format):

```markdown
## Documentation Audit Results

**Total references:** {total_refs}
**Stale:** {stale_count} | **Invalid:** {invalid_count}
**Doc files affected:** {affected_file_count}

### By Documentation File

**{doc_file_1}** ({issue_count} issues)
| Type | Reference | Details |
|------|-----------|---------|
| stale | `file.ts` | cf5a964 → 6607b05 |
| invalid | `removed.ts:fn` | file not found |

**{doc_file_2}** ({issue_count} issues)
...
```

If no issues:
- Report "All references valid" and exit
</step>

<step name="user_decision">
If issues found and `--fix` not provided:

AskUserQuestion: "How should we handle these {issue_count} issues across {file_count} doc files?"
Options:
- "Fix all" - Delegate to documentation-writers for review and fixes
- "Skip" - Don't fix, just report

If `--fix` provided:
- Proceed to delegation step automatically
</step>

<step name="batch_and_delegate">
**Batching for parallel delegation (max 5 agents):**

1. Count affected doc files from `by_doc_file`
2. If ≤5 files: one agent per file
3. If >5 files: distribute files across 5 agents
   - Agent 1: files 1, 6, 11...
   - Agent 2: files 2, 7, 12...
   - etc.

**Delegation format (per agent):**

Each agent receives a `doc_files` array (1+ files per agent):

```yaml
mode: "audit-fix"
doc_files:
  - path: "<doc file path>"
    stale_refs:
      - reference: "[ref:path/file.ts:symbol:hash]"
        ref_type: "symbol" | "file-only"
        file_path: "path/file.ts"
        symbol_name: "symbol" | null
        stored_hash: "abc1234"
        current_hash: "def5678"
    invalid_refs:
      - reference: "[ref:path/removed.ts:fn:hash]"
        reason: "file not found" | "symbol not found"
  - path: "<another doc file>"
    stale_refs: [...]
    invalid_refs: [...]
```

**Extract from reference string:**
- `[ref:path/to/file.ts:symbolName:hash]` → file_path="path/to/file.ts", symbol_name="symbolName"
- `[ref:path/to/file.yaml::hash]` → file_path="path/to/file.yaml", symbol_name=null

**Launch all agents in parallel using single message with multiple Task tool calls.**

**Expected output (per agent):**
```yaml
success: true
doc_files_processed: ["path1", "path2"]
changes:
  - doc_file: "<path>"
    ref: "<reference>"
    action: "hash_update" | "prose_rewrite" | "ref_removed" | "ref_updated"
    reason: "<why this action>"
```
</step>

<step name="verify_and_report">
After all agents complete:

1. Run validation again:
```bash
envoy docs validate [--path <docs_path>]
```

2. If issues remain, report which failed and why

3. Report completion:
```markdown
## Audit Complete

**Agents dispatched:** {agent_count}
**Files processed:** {file_count}
**Changes made:**
- Hash updates: {hash_update_count}
- Prose rewrites: {prose_rewrite_count}
- References removed: {ref_removed_count}
- References updated: {ref_updated_count}

**Validation:** {pass|fail with details}
```
</step>
</process>

<success_criteria>
- Validation run on docs
- Findings presented grouped by doc file
- User decision collected (if not --fix)
- Documentation-writer agents dispatched in parallel (max 5)
- All agents complete successfully
- Re-validation passes after fixes
</success_criteria>

<constraints>
- **NEVER edit documentation files directly** - always delegate to documentation-writer
- MUST present findings grouped by doc file (matches delegation format)
- MUST batch files if >5 affected (max 5 parallel agents)
- MUST launch agents in parallel (single message, multiple Task calls)
- MUST re-validate after fixes complete
- MUST report any remaining issues after fix attempt
</constraints>
