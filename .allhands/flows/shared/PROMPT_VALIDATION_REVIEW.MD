<goal>
Review prompt implementation for validation pass/fail. Per **Agentic Validation Tooling**, be critical of validation quality while balancing speed to production.
</goal>

<inputs>
- Prompt file path
- Validation tooling results and checks
- Validation methods used (include validation-suite file paths)
- Work done to account for any previous validation failures
</inputs>

<outputs>
- Verdict: PASS | FAIL
- What it will take to pass (if fail): implementation issues, validation tooling adjustments, or additional convincing results needed
</outputs>

<constraints>
- MUST check git diff of uncommitted work
- MUST be critical of validation quality, not just results
- MUST consider prior failure attempts when evaluating
- NEVER fail for being overly strict when iteration shows genuine progress
</constraints>

## Review Process

### Diff Analysis
- Run `git diff` to review uncommitted work
- Look for immediately noticeable issues

### Goal-Backward Verification

Per **Quality Engineering**, task completion ≠ goal achievement. Verify work is substantive:

| Level | Check |
|-------|-------|
| Existence | Files were created/modified |
| Substantive | Implementation is real, not placeholder |
| Wired | Components are connected (API calls, imports, state rendering) |

### Stub Detection

Scan for placeholder patterns that indicate incomplete work:

| Pattern | Red Flags |
|---------|-----------|
| Placeholder content | `TODO`, `FIXME`, `placeholder`, `coming soon`, `will be here` |
| Empty implementations | `return null`, `return {}`, `return []`, `=> {}` |
| Stub handlers | `onClick={() => {}}`, `onSubmit={(e) => e.preventDefault()}` only |
| Orphaned code | Files created but not imported/used anywhere |
| Unconnected APIs | API calls exist but responses not used |

### Validation Quality Critique

Per **Knowledge Compounding**, bad validation methods should not persist:

| Check | Red Flag |
|-------|----------|
| Mock tests | Do they test real implementation or just pass? |
| Test scope | Is validation curated to this prompt to LOOK like it passes? |
| Product efficacy | Does validation prove actual product stability? |
| Redundancy | Are tests duplicative without adding confidence? |

### Scenario Exploration

Consider edge cases and failure scenarios:

| Scenario | Check |
|----------|-------|
| Happy Path | Normal operation with valid inputs |
| Invalid Inputs | Null, empty, malformed data handling |
| Boundary Conditions | Min/max values, empty collections |
| Concurrent Access | Race conditions, deadlocks |
| Network Issues | Timeouts, partial failures |
| Error Recovery | Graceful degradation, retry logic |

Focus on scenarios that could cause data corruption, security issues, or user-facing failures.

### Prior Failure Context

If previous failures are documented:
- Consider work done to address them
- Recognize genuine progress vs. superficial fixes
- Being overly strict wastes cycles - balance rigor with velocity

## Verdict

### PASS Criteria
- Implementation meets acceptance criteria
- Validation proves product efficacy (not just test passing)
- No immediately noticeable issues in diff

### FAIL Response
Provide actionable feedback:
- Implementation issues needing resolution
- Validation tooling adjustments needed
- Additional convincing results required
- Strong implementation examples where helpful

Per **Knowledge Compounding**, feedback should compound - prevent misuse of validation and bad implementation patterns in future prompts.