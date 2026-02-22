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

> **Integrated sources**: Sentry (error tracking) and PostHog (product analytics) are available via MCP tools. PagerDuty integration is deferred. Use `ah tools sentry` and `ah tools posthog` to query production data directly.

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
- **Technical Considerations**: Signal data from Sentry/PostHog MCP tools and engineer-provided context

## Planning Considerations

### MCP Tool Reference

Triage prompts should use these MCP tools to gather production data before diagnosis:

#### Error Visibility (Sentry)

| Question Pattern | Tool | Example |
|-----------------|------|---------|
| What errors are happening? | `ah tools sentry:search_issues "crash on launch"` | Common errors, error rate spikes |
| What's the root cause? | `ah tools sentry:get_issue_details <issue_id>` | Stack traces, tags, frequency |
| What's fixable right now? | `ah tools sentry:analyze_issue_with_seer <issue_id>` | AI root cause analysis, fix suggestions |
| Did a deploy break something? | `ah tools sentry:find_releases` | Release-correlated error spikes |
| Who is affected? | `ah tools sentry:get_issue_tag_values <issue_id> <tag>` | Device, OS, browser distribution |

#### Product Analytics (PostHog)

| Question Pattern | Tool | Example |
|-----------------|------|---------|
| How is a flow performing? | `ah tools posthog:query-run` | Funnel conversion, trend queries |
| Complex analytics question | `ah tools posthog:query-generate-hogql-from-question` | Natural language to HogQL SQL |
| What events exist? | `ah tools posthog:event-definitions-list` | Discover trackable events first |
| What are users saying? | `ah tools posthog:surveys-global-stats` | Aggregated survey/feedback responses |
| Specific survey feedback | `ah tools posthog:survey-stats <survey_id>` | Per-survey response data |
| Existing analytics | `ah tools posthog:insights-get-all` | Pre-built dashboards and insights |
| PostHog error tracking | `ah tools posthog:list-errors` | Errors tracked via PostHog |

#### Recommended Workflow

1. **Discover context**: `ah tools sentry:find_organizations` / `ah tools posthog:projects-get` to identify org/project
2. **Gather signals**: Run relevant query tools above based on the engineer's question
3. **Correlate**: Cross-reference Sentry errors with PostHog analytics to understand user impact
4. **Diagnose**: Use `analyze_issue_with_seer` for AI-assisted root cause on specific issues

### External Signal Integration (Deferred)

PagerDuty integration is deferred to a future spec. Sentry and PostHog are now available via MCP tools (see above).

### Urgency-Driven Prioritization

Triage planning should be urgency-aware:
- High urgency signals may require immediate hotfix prompts before diagnosis
- Lower urgency allows for thorough investigation-style planning
- Escalation trajectory informs whether the triage can be methodical or must be rapid

### Prompt Output Range

Triage specs produce 1-3 focused prompts. Triage is inherently rapid — minimal prompts with clear outcomes.
