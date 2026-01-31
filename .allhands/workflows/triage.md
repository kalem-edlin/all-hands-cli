---
name: triage
type: triage
planning_depth: focused
jury_required: false
max_tangential_hypotheses: 1
required_ideation_questions:
  - "Describe the external signals"
  - "What's the impact and urgency?"
  - "What outcome do you need?"
---

## Domain Knowledge

### External Signal Vocabulary

Triage specs are driven by external signals that demand attention. Signal types to surface and categorize:

| Signal Type | Examples |
|-------------|----------|
| **Error reports** | Stack traces, crash reports, error rate spikes |
| **Analytics anomalies** | Conversion drops, usage pattern shifts, funnel breakdowns |
| **Support tickets** | User complaints, feature requests, confusion patterns |
| **Alerts** | Monitoring alerts, SLA breaches, resource exhaustion warnings |

> **Note**: Full external source integration (PostHog, Sentry, PagerDuty) is deferred. This domain uses manually provided signal data.

### Impact/Urgency Framework

Triage prioritization is grounded in impact and urgency dimensions:

| Dimension | Factors |
|-----------|---------|
| **Users affected** | Single user, subset, all users, public-facing |
| **Revenue impact** | Direct revenue loss, conversion impact, churn risk |
| **SLA risk** | Uptime commitments, response time guarantees, contractual obligations |
| **Escalation trajectory** | Getting worse, stable, intermittent |

### Outcome Taxonomy

Triage outcomes range from diagnosis to action:

| Outcome | Description |
|---------|-------------|
| **Root cause identification** | Diagnose the issue, document findings |
| **Hotfix** | Ship a targeted fix for the immediate problem |
| **Incident report** | Document what happened, impact, and prevention |
| **Escalation** | Route to appropriate team or priority queue |

## Ideation Guidance

Per **Context is Precious**, triage needs external data to ground decisions in reality. The interview captures signal data that would otherwise require tool integration.

### Probe Guidance

- Probe vague signal descriptions — demand specific error messages, metrics, or user reports
- Distinguish urgency from importance — time-sensitive vs high-impact may require different approaches

### Output Sections

Spec body sections for triage domain:
- **Motivation**: External signals and their impact
- **Goals**: Desired triage outcome
- **Technical Considerations**: Manually provided signal data

## Planning Considerations

### External Signal Integration (Deferred)

Full integration with external signal sources (PostHog, Sentry, PagerDuty) is deferred to a future spec. Current planning relies on engineer-provided signal data.

### Urgency-Driven Prioritization

Triage planning should be urgency-aware:
- High urgency signals may require immediate hotfix prompts before diagnosis
- Lower urgency allows for thorough investigation-style planning
- Escalation trajectory informs whether the triage can be methodical or must be rapid

### Prompt Output Range

Triage specs produce 1-3 focused prompts. Triage is inherently rapid — minimal prompts with clear outcomes.
