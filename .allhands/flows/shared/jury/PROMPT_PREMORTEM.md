<goal>
Identify failure modes in prompts before execution. Per **Quality Engineering**, detecting risks early prevents rework and wasted agent cycles.
</goal>

<inputs>
- Alignment doc path
- Prompts folder path
</inputs>

<outputs>
Structured risk findings in REVIEW_OPTIONS_BREAKDOWN consumable format:
- Tigers (clear threats requiring action)
- Elephants (unspoken concerns worth surfacing)
- Paper Tigers (looks scary but acceptable)
</outputs>

<constraints>
- MUST verify every potential risk before flagging as Tiger
- MUST read prompt files and alignment doc before flagging risks
- MUST output in structured format for REVIEW_OPTIONS_BREAKDOWN
- NEVER flag risks based on pattern-matching alone
</constraints>

## Risk Categories

| Category        | Symbol       | Meaning                                      | Action Required        |
| --------------- | ------------ | -------------------------------------------- | ---------------------- |
| **Tiger**       | `[TIGER]`    | Clear threat that will hurt if not addressed | Must address or accept |
| **Paper Tiger** | `[PAPER]`    | Looks threatening but probably fine          | Acknowledge            |
| **Elephant**    | `[ELEPHANT]` | Concern nobody mentioned yet                 | Surface for discussion |

## Analysis Checklist

Work through each category systematically for the prompt set:

### Prompt Completeness

- [ ] Every prompt has clear acceptance criteria?
- [ ] Dependencies between prompts explicit?
- [ ] Scope per prompt reasonable (2-3 tasks, <7 files)?

### Technical Risks

- [ ] External dependencies with fallbacks?
- [ ] Breaking changes identified?
- [ ] Migration/rollback path defined?
- [ ] Security considerations for auth/data?
- [ ] Error handling coverage?

### Integration Risks

- [ ] Components wire together (API → UI)?
- [ ] Feature flags needed for partial delivery?
- [ ] Testing strategy for cross-prompt work?

### Process Risks

- [ ] Requirements clear and complete?
- [ ] Parallel execution conflicts avoided?

## Verification Protocol

Before flagging ANY Tiger, verify:

```yaml
potential_finding:
  what: "<description of concern>"
  prompt: "<prompt number(s) affected>"

verification:
  context_read: true # Did I read the relevant prompts?
  alignment_check: true # Is this addressed in alignment doc?
  scope_check: true # Is this actually in scope?

result: tiger | paper_tiger | elephant | false_alarm
```

**If ANY verification check is "no" or "unknown", DO NOT flag as Tiger.**

## Output Format

Structure findings for REVIEW_OPTIONS_BREAKDOWN consumption:

```yaml
premortem:
  prompts_analyzed: [01, 02, 03, ...]
  alignment_doc: "<path>"

  tigers:
    - risk: "<description>"
      prompts_affected: [01, 02]
      severity: high | medium
      category: completeness | technical | integration | process
      mitigation_checked: "<what mitigation was looked for and NOT found>"
      suggested_action: "<how to address>"

  elephants:
    - risk: "<unspoken concern worth surfacing>"
      prompts_affected: [all | specific numbers]
      severity: medium
      suggested_action: "<what to discuss>"

  paper_tigers:
    - risk: "<looks scary but acceptable>"
      reason: "<why it's fine - cite evidence from prompts/alignment>"
      prompts_affected: [numbers]

  checklist_gaps:
    - category: "<which checklist section>"
      items_failed: ["<item1>", "<item2>"]
      prompts_affected: [numbers]
```

## Severity Guidelines

| Severity   | Criteria                                           | Examples                                                     |
| ---------- | -------------------------------------------------- | ------------------------------------------------------------ |
| **High**   | Blocks goal achievement, security risk, data loss  | Missing auth check, no rollback plan, circular dependencies  |
| **Medium** | Quality impact, technical debt, maintenance burden | Missing tests, unclear acceptance criteria, over-engineering |

## Integration with Review Flow

This premortem output feeds directly into REVIEW_OPTIONS_BREAKDOWN:

- Tigers become P1 (blocking) or P2 (recommended) items
- Elephants become discussion points for engineer interview
- Paper Tigers are documented as acknowledged acceptable risks
- Checklist gaps inform specific prompt amendments
