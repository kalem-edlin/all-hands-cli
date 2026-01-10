# Documentation System Fix Plan

## Problem Summary

The documentation system produced docs that violate DOCUMENTATION_GOALS.md in multiple ways:

| Category | Issue | Severity |
|----------|-------|----------|
| **Reference Format** | claude-all-hands & envoy-cli used inline `path:symbol` without `[ref:...]` wrapper | Critical |
| **Placeholder Hashes** | agent-framework used `abc1234` instead of real git hashes | Critical |
| **Inline Code** | 16 fenced code blocks found across docs | High |
| **Capability Lists** | Multiple command/option tables instead of knowledge | High |
| **Code Duplication** | State machines, flows transcribed from code | Medium |
| **How-To Content** | Usage documentation instead of rationale | Medium |
| **Missing Use Cases** | Some domains lack product use cases | Medium |
| **Stuck Workers** | Parallel writer got stuck, main agent had no visibility | Medium |

---

## Root Causes

### 1. No Pre-Documentation Commit Gate
- Docs run against uncommitted state
- `format-reference` returns `0000000` for uncommitted files
- Writers use placeholder hashes instead of failing

### 2. Writers Don't Call format-reference
- Agent instructions say to use command but don't enforce it
- Writers wrote refs manually with placeholders
- Some writers skipped ref format entirely

### 3. No Validation Before Commit
- Writers commit without running `envoy docs validate`
- No check for inline code blocks
- No check for placeholder hashes

### 4. Writer Produces API Docs, Not Knowledge
- Instructions unclear on difference
- No anti-pattern examples in agent prompt
- Writer defaults to "document what exists"

### 5. No Parallel Worker Monitoring
- Main agent launches parallel writers and waits
- No visibility into individual worker progress
- Stuck workers not detected until timeout
- No mechanism to investigate or retry stuck workers

---

## Fix Tasks

### Phase 1: Command Infrastructure

#### 1.1 Update docs-init.md - Add commit gate

**File:** `.claude/commands/docs-init.md`

Add step before `delegate_to_taxonomist`:

```xml
<step name="ensure_committed_state">
Before delegating to taxonomist:

1. Check for uncommitted changes:
   ```bash
   git status --porcelain
   ```

2. If changes exist:
   - Use AskUserQuestion: "Uncommitted changes detected. Documentation requires committed state for valid reference hashes."
   - Options:
     - "Commit now" - propose message, gate for approval
     - "Stash and continue" - `git stash`
     - "Cancel" - abort workflow

3. If "Commit now":
   - Run `git diff --cached --stat` for context
   - Propose commit message
   - Gate for user approval
   - Execute: `git add -A && git commit -m "<approved message>"`

4. Verify clean state before proceeding
</step>
```

#### 1.2 Update docs-adjust.md - Add commit gate

**File:** `.claude/commands/docs-adjust.md`

Add same commit gate step as docs-init.md.

#### 1.3 Update format-reference - Fail on uncommitted

**File:** `.claude/envoy/src/commands/docs.ts`

In `getMostRecentHashForFile()` and `getMostRecentHashForRange()`:

```typescript
// After getting hash
if (hash === "0000000" || !success) {
  return this.error(
    "uncommitted_file",
    `File ${relativePath} has uncommitted changes or no git history`,
    "Commit all changes before generating references: git add -A && git commit"
  );
}
```

#### 1.4 Update validate command - Detect new violations

**File:** `.claude/envoy/src/commands/docs.ts`

Add to `ValidateCommand.execute()`:

```typescript
// Placeholder hash detection
const placeholderPattern = /\[ref:[^\]]+:(abc|123|000|hash|test)[a-f0-9]*\]/gi;
const placeholderMatches = content.match(placeholderPattern);
if (placeholderMatches) {
  placeholderErrors.push({
    doc_file: relPath,
    count: placeholderMatches.length,
    examples: placeholderMatches.slice(0, 3),
    reason: "Placeholder hashes detected - writer didn't use format-reference"
  });
}

// Inline code block detection
const codeBlockPattern = /^```\w+$/gm;
const codeBlockMatches = content.match(codeBlockPattern);
if (codeBlockMatches && codeBlockMatches.length > 0) {
  inlineCodeErrors.push({
    doc_file: relPath,
    block_count: codeBlockMatches.length,
    reason: "Documentation contains inline code blocks"
  });
}

// Capability list detection (tables with Command/Purpose headers)
const capabilityTablePattern = /\|\s*(Command|Option|Flag)\s*\|.*\|\s*(Purpose|Description)\s*\|/i;
if (capabilityTablePattern.test(content)) {
  capabilityListWarnings.push({
    doc_file: relPath,
    reason: "Possible capability list table detected"
  });
}
```

Return new fields in output:
```typescript
placeholder_errors: placeholderErrors,
inline_code_errors: inlineCodeErrors,
capability_list_warnings: capabilityListWarnings,
```

#### 1.5 Update docs-init.md & docs-adjust.md - Add parallel worker monitoring

**Files:** `.claude/commands/docs-init.md`, `.claude/commands/docs-adjust.md`

**Problem:** During parallel documentation-writer execution, one worker may get stuck (permissions, tool blocks, errors) while others complete. Main agent loses visibility into stuck workers.

**Solution:** Add monitoring step in `parallel_writers` to detect and investigate lagging workers.

Update `<step name="parallel_writers">`:

```xml
<step name="parallel_writers">
For each segment from taxonomist, delegate to **documentation-writer agent** in parallel:

**INPUTS (per writer):**
```yaml
mode: "write"
domain: "<segment.domain>"
files: <segment.files>
output_path: "<segment.output_path>"
worktree_branch: "<segment.worktree_branch>"
depth: "<segment.depth>"
notes: "<segment.notes>"
```

**OUTPUTS:**
```yaml
success: true
```

All writers run in parallel using worktree isolation.

**Parallel Worker Monitoring:**

1. Launch all writers as background tasks, track task IDs
2. Set monitoring interval (every 60 seconds while tasks running)
3. On each interval:
   - Check task completion status for all workers
   - If some workers completed but others still running after 2+ intervals:
     a. Read output file of lagging worker(s): `tail -100 <output_file>`
     b. Check for patterns indicating issues:
        - "permission" / "denied" / "blocked" → permission issue
        - "AskUserQuestion" / "waiting" → blocked on user input
        - "error" / "failed" / "timeout" → execution error
        - No recent output (>2 min) → possible hang
     c. Report findings to user via AskUserQuestion:
        - "Writer for <domain> appears stuck. Issue: <detected_issue>"
        - Options: ["Investigate output", "Kill and retry", "Wait longer", "Cancel all"]
4. If user selects "Investigate output":
   - Show last 50 lines of worker output
   - Ask for next action
5. If user selects "Kill and retry":
   - Kill stuck task
   - Re-launch single writer (not parallel)
   - Continue monitoring

**Completion handling:**
- Wait for all workers OR user cancellation
- Collect success/failure status per worker
- Report summary before proceeding to merge
</step>
```

Add new constraint:

```xml
<constraints>
...existing constraints...
- MUST monitor parallel workers for stuck/blocked state
- MUST report lagging workers to user after reasonable timeout
- MUST provide options to investigate, retry, or cancel stuck workers
</constraints>
```

---

### Phase 2: Writer Agent Updates

#### 2.1 Update documentation-writer.md - Enforce ref command usage

**File:** `.claude/agents/documentation-writer.md`

Replace step 6 in `<write_workflow>`:

```xml
6. Write knowledge-base documentation with MANDATORY ref commands:

   For EVERY file or code mention:
   a. Call `envoy docs format-reference <file> [symbol]`
   b. Check response status:
      - If `status: "success"`: use `data.reference` string EXACTLY
      - If `status: "error"` with `symbol_not_found`: retry without symbol for file-only ref
      - If `status: "error"` with `uncommitted_file`: STOP and report to main agent
      - If `status: "error"` with `file_not_found`: investigate path, don't skip
   c. NEVER write `[ref:...]` by hand - ALWAYS use command output
   d. NEVER use placeholder hashes (abc1234, 0000000, etc.)
```

Add new step 7.5:

```xml
7.5. Validate before commit:

   a. Run: `envoy docs validate --path docs/<domain>/`
   b. Check response:
      - `invalid_count` must be 0
      - `placeholder_errors` must be empty
      - `inline_code_errors` must be empty
   c. Run: `grep -r '^\`\`\`' docs/<domain>/*.md | wc -l`
      - Result must be 0 (no fenced code blocks)
   d. If any check fails:
      - Fix the issue
      - Re-validate
      - Do NOT commit until all checks pass
```

#### 2.2 Update documentation-writer.md - Add anti-pattern awareness

**File:** `.claude/agents/documentation-writer.md`

Add new section after `<what_to_document>`:

```xml
<anti_patterns>
**NEVER write these patterns:**

1. **Capability tables** - Tables listing commands, options, features
   BAD: `| Command | Purpose |` tables
   GOOD: Explain WHY a pattern exists with selective refs

2. **State machines from code** - Transcribing status flows
   BAD: `draft -> in_progress -> implemented -> tested`
   GOOD: Explain WHY the lifecycle matters, ref the implementation

3. **How-to content** - Command usage examples
   BAD: "Run `envoy plan next -n 3` to get prompts"
   GOOD: Explain WHY parallel dispatch exists, ref the implementation

4. **Folder listings** - Directory structure diagrams
   BAD: ASCII tree of folder contents
   GOOD: Explain WHY structure exists, ref canonical example

5. **Inline code** - Fenced code blocks
   BAD: ```typescript\nconst x = ...```
   GOOD: Explain in prose, ref the actual implementation

**Self-check before each paragraph:**
- Am I explaining WHY or just WHAT?
- Would this be better as a ref to actual code?
- Is this knowledge or documentation?
</anti_patterns>
```

#### 2.3 Update documentation-writer.md - Require use cases

**File:** `.claude/agents/documentation-writer.md`

Update `<documentation_format>`:

```xml
<documentation_format>
**Structure (REQUIRED sections marked with *):**

```markdown
# Domain Name

## Overview *
Why this exists, what problem it solves. Pure knowledge.

## Key Decisions *
Design choices with rationale:
- Decision 1: Why this approach [ref:example::hash]

## Patterns
How to work with this code - only if genuinely needed.

## Technologies
What's used and why - only if not obvious.

## Use Cases *
What users/systems accomplish:
- Use case 1: Real scenario, how it works at product level
- Use case 2: Another real scenario
```

**REQUIRED sections:** Overview, Key Decisions, Use Cases
**Optional sections:** Patterns, Technologies (only if add value)
</documentation_format>
```

---

### Phase 3: Delete and Regenerate Docs

#### 3.1 Delete current docs

```bash
rm -rf docs/
git add -A
git commit -m "chore: remove non-compliant documentation for regeneration"
```

#### 3.2 Run docs-init with fixes applied

After Phase 1 and Phase 2 are complete:

```bash
/docs-init .claude/ src/
```

This will regenerate all documentation with proper enforcement.

---

### Phase 4: Validation and Audit

#### 4.1 Run full validation

```bash
envoy docs validate
```

Check:
- `invalid_count == 0`
- `stale_count == 0` (fresh generation)
- `placeholder_errors == []`
- `inline_code_errors == []`

#### 4.2 Manual spot-check

Review each doc against DOCUMENTATION_GOALS.md checklist:
- [ ] Zero fenced code blocks
- [ ] All refs use real hashes
- [ ] Explains WHY, not WHAT
- [ ] No capability tables
- [ ] Has Use Cases section
- [ ] Under 100 lines

#### 4.3 Fix any remaining violations

If violations found, run `/docs-adjust` to fix specific files.

---

## Implementation Order

```
Phase 1.3 → Phase 1.4 → Phase 1.1 → Phase 1.2 → Phase 1.5 → Phase 2.1 → Phase 2.2 → Phase 2.3 → Phase 3.1 → Phase 3.2 → Phase 4
```

**Rationale:**
1. Fix format-reference first (infrastructure)
2. Fix validate command (infrastructure)
3. Add commit gates to commands
4. Add parallel worker monitoring to commands
5. Update writer agent enforcement
6. Delete old docs
7. Regenerate with all fixes
8. Validate result

---

## Success Criteria

After all phases complete:

1. `envoy docs validate` returns:
   - `invalid_count: 0`
   - `placeholder_errors: []`
   - `inline_code_errors: []`
   - `capability_list_warnings: []`

2. Manual review confirms:
   - Every doc explains WHY decisions were made
   - No command/option tables
   - No state machine transcriptions
   - All refs point to real code with real hashes
   - Each doc has Use Cases section
   - Each doc under 100 lines

3. Semantic search test:
   - Query "how does authentication work" finds relevant knowledge
   - Query "what commands exist" finds nothing (not knowledge)

---

## Files to Modify

| File | Changes |
|------|---------|
| `.claude/commands/docs-init.md` | Add commit gate step, add parallel worker monitoring |
| `.claude/commands/docs-adjust.md` | Add commit gate step, add parallel worker monitoring |
| `.claude/envoy/src/commands/docs.ts` | Fail on uncommitted, detect violations |
| `.claude/agents/documentation-writer.md` | Enforce refs, add anti-patterns, require use cases |

## Files to Delete

| File | Reason |
|------|--------|
| `docs/agent-framework/*` | Non-compliant (placeholder hashes, inline code) |
| `docs/claude-all-hands/*` | Non-compliant (wrong ref format) |
| `docs/envoy-cli/*` | Non-compliant (wrong ref format, inline code) |

## Files Already Updated

| File | Status |
|------|--------|
| `DOCUMENTATION_GOALS.md` | Updated with anti-patterns and enforcement requirements |
