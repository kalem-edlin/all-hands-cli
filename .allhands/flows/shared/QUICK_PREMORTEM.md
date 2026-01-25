<goal>
Fast risk check for single prompts before execution. Per **Quality Engineering**, even lightweight tasks benefit from brief failure mode consideration.
</goal>

<inputs>
- Single prompt file path
- Optional: alignment doc path for context
</inputs>

<outputs>
- Brief risk assessment (2-3 minutes max)
- Go/adjust/block recommendation
</outputs>

<constraints>
- MUST complete in under 3 minutes
- MUST verify findings before flagging
- NEVER block without high-severity verified Tiger
</constraints>

## Quick Questions

Answer these five questions for the prompt:

| # | Question | If Yes → |
|---|----------|----------|
| 1 | What's the single biggest thing that could go wrong? | Flag as Tiger if unmitigated |
| 2 | Any external dependencies that could fail? | Flag as Tiger if no fallback |
| 3 | Is rollback possible if this breaks? | Flag as Elephant if unclear |
| 4 | Edge cases not covered in acceptance criteria? | Note for prompt amendment |
| 5 | Unclear requirements that could cause rework? | Flag as Tiger if blocking |

## Output Format

```yaml
quick_premortem:
  prompt: "<number or name>"
  duration: "<minutes>"

  recommendation: go | adjust | block

  tigers:  # Only verified, high-impact
    - risk: "<brief description>"
      action: "<specific fix>"

  notes:  # Lower severity, awareness only
    - "<observation>"

  adjustment_needed:  # If recommendation is "adjust"
    - "<what to add/change in prompt>"
```

## When to Use

| Context | Use Quick Premortem |
|---------|---------------------|
| Emergent refinement prompts | Before execution |
| Judge-produced review-fix prompts | Before execution |
| PR-review produced prompts | Before execution |
| Single deterministic fix | Optional |

For full milestone prompt sets, use `.allhands/flows/shared/jury/PROMPT_PREMORTEM.md` instead.

## Recommendation Thresholds

| Recommendation | Criteria |
|----------------|----------|
| **Go** | No Tigers, or Tigers have clear mitigations already |
| **Adjust** | Tigers exist but fixable with prompt amendment |
| **Block** | High-severity Tiger requiring engineer decision |
