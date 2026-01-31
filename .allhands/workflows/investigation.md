---
name: investigation
type: investigation
planning_depth: focused
jury_required: false
max_tangential_hypotheses: 2
required_ideation_questions:
  - "What's broken / what's the issue?"
  - "What evidence do you have?"
  - "What does 'fixed' look like?"
  - "Any constraints?"
  - "Any suspected root causes?"
---

## Domain Knowledge

### Problem-Evidence-Fix Framing

Investigation specs are structured around a symptom-first approach: capture what's wrong, gather evidence, define what "fixed" means. The engineer describes symptoms, not suspected causes — root cause identification is the investigation's output, not its input.

### Evidence Vocabulary

Evidence types to surface and categorize:

| Evidence Type | Examples |
|---------------|----------|
| **Error logs** | Stack traces, error messages, log patterns |
| **Reproduction steps** | Exact sequence to trigger the issue |
| **Affected scope** | Users affected, environments, frequency |
| **Temporal patterns** | When it started, intermittent vs constant, correlation with deploys |
| **Metrics** | Error rates, latency spikes, resource exhaustion signals |

### Suspected Root Causes as Hypothesis Seeds

Engineer-provided suspected causes are hypothesis seeds, not conclusions. They inform investigation direction but should not constrain the search space. Weight them alongside evidence-based hypotheses generated during planning.

### Knowledge Gap Detection

| Signal | Action |
|--------|--------|
| "It just broke" (no timeline) | Probe for recent changes, deploys, config updates |
| "It happens sometimes" (no pattern) | Probe for environmental differences, load conditions |
| "I think it's X" (premature diagnosis) | Acknowledge hypothesis, still gather full evidence |
| Symptom described as cause | Redirect to observable behavior — "what do you see?" |

## Ideation Guidance

Per **Ideation First**, the investigation interview captures the problem space so the planner can ground hypotheses in evidence.

### Probe Guidance

- Probe vague symptom descriptions — demand concrete evidence
- Separate symptoms from suspected causes — capture both but label them distinctly

### Output Sections

Spec body sections for investigation domain:
- **Motivation**: The problem and its impact
- **Goals**: Success criteria from "what does fixed look like"
- **Technical Considerations**: Evidence, constraints, suspected causes
- **Open Questions**: Unknowns the planner should investigate

## Planning Considerations

### Focused Research

Focused research on the problem domain rather than broad codebase exploration. Investigation planning should:
- Ground hypotheses in gathered evidence
- Prioritize hypotheses by evidence weight and impact
- Design diagnostic steps that narrow the search space efficiently

### Hypothesis-Driven Investigation Approach

Prompts should be structured as hypothesis validation steps:
- Each prompt tests one or more hypotheses
- Early prompts gather diagnostic data; later prompts apply fixes
- Evidence correlation patterns guide hypothesis ordering

### Prompt Output Range

Investigation specs produce 2-5 focused prompts. Investigation is inherently iterative — fewer, targeted prompts are preferred over broad sweeps.
