<goal>
Structured investigation for complex bugs with unclear root causes. Systematic debugging beats random exploration.
</goal>

<inputs>
- Symptom description (error message, unexpected behavior, failing test)
- Optional: suspected area of codebase
</inputs>

<outputs>
- Root cause identification with evidence
- Recommended fix approach
- Optional: prompt file for fix implementation
</outputs>

<constraints>
- MUST gather symptoms before hypothesizing
- MUST verify hypotheses with evidence before concluding
- MUST document investigation path for knowledge compounding
- NEVER guess at root cause without verification
</constraints>

## STATUS: Work In Progress

This flow is under development. Integration points with milestone workflow TBD.

Potential integration approaches:

1. Patch prompt type: `type: debug` prompts following this flow
2. Pre-implementation phase: When initial execution fails
3. Emergent debug: When emergent refinement hits blockers
4. Coordinator service: "Debug Investigation" option in COORDINATION.md

---

## Phase 1: Symptom Gathering

Collect all observable evidence:

| Evidence Type      | How to Gather                             |
| ------------------ | ----------------------------------------- |
| Error messages     | Exact text, stack traces                  |
| Reproduction steps | Minimal sequence to trigger               |
| When it started    | Recent commits, config changes            |
| What changed       | Git diff, dependency updates              |
| Frequency          | Always, intermittent, specific conditions |

```yaml
symptoms:
  error: "<exact error message>"
  reproduction: ["<step 1>", "<step 2>", "..."]
  frequency: always | intermittent | conditional
  conditions: "<when it occurs>"
  recent_changes: ["<commit>", "<config change>"]
```

## Phase 2: Hypothesis Formation

Based on symptoms, form 2-3 ranked hypotheses:

```yaml
hypotheses:
  - id: H1
    description: "<what you think is wrong>"
    confidence: high | medium | low
    evidence_for: ["<symptom that supports>"]
    evidence_against: ["<symptom that contradicts>"]
    verification_method: "<how to confirm/deny>"

  - id: H2
    description: "<alternative explanation>"
    ...
```

## Phase 3: Investigation

For each hypothesis (highest confidence first):

### 3.1 Targeted Search

- Read `.allhands/flows/shared/CODEBASE_UNDERSTANDING.md` for search approach
- Focus on areas suggested by hypothesis
- Use claim verification: read actual code before concluding

### 3.2 Evidence Collection

```yaml
investigation:
  hypothesis: H1
  files_examined: ["<path>"]
  findings:
    - location: "file.ts:42"
      observation: "<what you found>"
      supports_hypothesis: true | false
  conclusion: confirmed | refuted | inconclusive
```

### 3.3 Iteration

If inconclusive:

- Refine hypothesis with new evidence
- Move to next hypothesis
- Expand search scope

## Phase 4: Root Cause Confirmation

Before declaring root cause:

```yaml
root_cause:
  description: "<what's actually wrong>"
  location: "file.ts:42"
  evidence:
    - "<specific finding 1>"
    - "<specific finding 2>"
  why_other_hypotheses_wrong:
    H2: "<why H2 was not the cause>"
  reproduction_confirmed: true
```

## Phase 5: Fix Recommendation

```yaml
fix:
  approach: "<how to fix>"
  files_affected: ["<paths>"]
  risk_level: low | medium | high
  testing_approach: "<how to verify fix>"
  regression_concerns: ["<what could break>"]
```

## Phase 6: Documentation

For knowledge compounding:

### Investigation Summary (for prompt file)

```markdown
## Debug Investigation

**Symptom**: <brief description>
**Root Cause**: <what was wrong>
**Investigation Path**: H1 (refuted) → H2 (confirmed)
**Key Finding**: <location and evidence>
```

## Common Debug Patterns

| Symptom Pattern              | Likely Cause     | First Check                |
| ---------------------------- | ---------------- | -------------------------- |
| "Works locally, fails in CI" | Environment diff | Env vars, paths, deps      |
| "Intermittent failures"      | Race condition   | Async timing, shared state |
| "Started after deploy"       | Recent changes   | Git diff from last working |
| "Only affects some users"    | Data-dependent   | User data differences      |
| "Works sometimes on refresh" | Caching          | Cache invalidation logic   |

## Anti-Patterns to Avoid

| Anti-Pattern                    | Why It's Bad               | Instead                    |
| ------------------------------- | -------------------------- | -------------------------- |
| Shotgun debugging               | Wastes time, creates noise | Form hypothesis first      |
| Assuming error message is cause | Often symptom, not root    | Trace back to origin       |
| Skipping reproduction           | Can't verify fix           | Always reproduce first     |
| Fixing without understanding    | Creates new bugs           | Understand before changing |
