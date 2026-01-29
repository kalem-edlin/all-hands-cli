<goal>
Verify claims made in prompts and alignment docs against actual codebase state. Per **Quality Engineering**, unverified claims lead to incorrect implementations.
</goal>

<inputs>
- Alignment doc path
- Prompts folder path
</inputs>

<outputs>
- List of unverified claims requiring attention
- Verified claims confirmed accurate
- Corrections for false claims
</outputs>

<constraints>
- MUST read actual files before confirming/denying claims
- MUST check multiple search patterns before claiming absence
- NEVER trust grep results alone for existence claims
</constraints>

## Claim Extraction

Scan alignment doc and prompts for factual assertions about:
- What exists ("there is a retry mechanism in...")
- What doesn't exist ("no current handling for...")
- How things work ("the auth flow uses...")
- File/function locations ("located at src/...")

## Verification Process

For each extracted claim:

### Step 1: Categorize

| Claim Type | Verification Method |
|------------|---------------------|
| Existence | Read the referenced file/symbol |
| Absence | Search with multiple patterns, check likely locations |
| Behavior | Read the code, trace the logic |
| Location | Verify file exists and contains referenced content |

### Step 2: Verify

```yaml
claim: "<extracted claim>"
source: "<prompt number or alignment doc section>"

verification:
  method: read | search | trace
  files_checked: ["<paths>"]
  patterns_tried: ["<if search>"]
  context_lines: "<±N lines read>"

result: verified | false | partially_true | unverifiable
correction: "<if false, what's actually true>"
```

### Step 3: Output

Structure findings for REVIEW_OPTIONS_BREAKDOWN:

```yaml
claim_verification:
  verified_claims:
    - claim: "<claim text>"
      source: "<prompt/alignment>"
      evidence: "<file:line or brief explanation>"

  false_claims:
    - claim: "<claim text>"
      source: "<prompt/alignment>"
      actual: "<what's actually true>"
      impact: high | medium | low
      suggested_fix: "<how to correct in source>"

  unverifiable_claims:
    - claim: "<claim text>"
      source: "<prompt/alignment>"
      reason: "<why unverifiable>"
      recommendation: "<what to do>"
```

## Impact Assessment

| Impact | Criteria |
|--------|----------|
| **High** | False claim would cause implementation failure |
| **Medium** | False claim causes rework but not failure |
| **Low** | False claim is cosmetic or non-blocking |

## Common Verification Failures

| Pattern | Why It's Risky |
|---------|---------------|
| "Based on the search results..." | Search may have missed files |
| "As we discussed earlier..." | Memory may be inaccurate |
| "The standard pattern here is..." | May not match actual codebase |
| "Similar to X, Y does..." | Assumption without verification |

**When in doubt, read the code.**
