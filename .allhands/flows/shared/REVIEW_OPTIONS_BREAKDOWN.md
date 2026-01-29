<goal>
Organize unstructured review feedback into ranked, actionable options for engineer decision. Per **Knowledge Compounding**, both accepted and declined items must be documented.
</goal>

<inputs>
- Unorganized list of review options from multiple sources/perspectives
- Alignment doc path (if unfamiliar with contents)
- Prompt path file for planned/completed implementation summaries
</inputs>

<outputs>
- Engineer's choices (accept/decline per item)
- Updated alignment doc with declined items documented
</outputs>

<constraints>
- MUST present options ranked P1, P2, P3 (most to least important)
- MUST allow engineer to explain why they decline items
- MUST document declined items in alignment doc
</constraints>

## Analysis

For each review item:
- Understand relationship to other items
- Combine duplicates and elevate repeated concerns (proves urgency)
- Consider importance in context of spec doc goals and engineer desires

### Premortem Integration

When premortem findings are present in inputs:

| Premortem Category | Maps To | Handling |
|--------------------|---------|----------|
| **Tigers** (high severity) | P1 | Require explicit accept or fix decision |
| **Tigers** (medium severity) | P2 | Recommend addressing, allow skip |
| **Elephants** | Discussion Points | Surface to engineer, document response |
| **Paper Tigers** | Acknowledged | Note as acceptable risk in alignment doc |
| **Checklist Gaps** | P2 or P3 | Prompt amendments to close gaps |

Tigers with `mitigation_checked` field prove thorough analysis - weight these higher.

## Priority Ranking

| Priority | Criteria |
|----------|----------|
| P1 | Blocking issues, security concerns, core functionality |
| P2 | Important improvements, consistency issues, best practices |
| P3 | Nice-to-haves, polish, minor optimizations |

## Engineer Presentation

Present ranked options:
- Order from most important (P1) to least important (P3)
- For each: describe the issue, explain importance, suggest implementation
- Ask engineer which to accept and which to decline
- Always allow engineer to explain their reasoning

## Decision Documentation

Run `ah schema alignment` to identify where to track declined items.

Document in alignment doc:
- Which items were accepted (will become prompts)
- Which items were declined AND engineer's reasoning
- Accepted risks from premortem (Tigers acknowledged but not mitigated)
- Paper Tigers noted as acceptable risk decisions
- Per **Knowledge Compounding**, this prevents future re-suggestion of rejected approaches