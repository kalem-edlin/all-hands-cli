<goal>
Scope a triage spec — capture external signals for prioritization and diagnosis. Per **Context is Precious**, triage needs external data (PostHog, Sentry, support tickets) to ground decisions in reality.
</goal>

> **Note**: Full external source integration (PostHog, Sentry, PagerDuty) is deferred to a future spec. This flow uses manual input as a fallback.

## Scoping Interview

Ask the engineer via AskUserQuestion (one at a time):

1. **Describe the external signals** — Paste or summarize: error reports, analytics anomalies, support tickets, alerts
2. **What's the impact and urgency?** — Users affected, revenue impact, SLA risk
3. **What outcome do you need?** — Root cause identified, hotfix shipped, incident report written

## Spec Creation

- Synthesize answers into spec content:
  - **Motivation**: External signals and their impact
  - **Goals**: Desired triage outcome
  - **Technical Considerations**: Manually provided signal data
- Set `type: triage` in spec frontmatter
- Follow `.allhands/flows/shared/CREATE_SPEC.md` to write, persist, and optionally enable the spec
