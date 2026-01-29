<goal>
Scope an optimization spec — capture performance targets and measurement approach. Per **Ideation First**, define what "better" means upfront so the planner can create measurable hypotheses.
</goal>

## Scoping Interview

Ask the engineer via AskUserQuestion (one at a time):

1. **What's slow / expensive?** — Identify the bottleneck: latency, throughput, resource usage, cost
2. **What are the performance targets?** — Concrete numbers: response time, requests/sec, memory ceiling, cost reduction
3. **How should improvements be measured?** — Benchmarks, profiling tools, monitoring dashboards, before/after comparison
4. **Current baseline metrics?** — What does "now" look like — establishes the gap
5. **Any constraints?** — Backwards compatibility, memory limits, no new dependencies, incremental rollout

Per **Frontier Models are Capable**, let the engineer's answers drive depth — probe vague targets, skip questions they've already answered.

## Spec Creation

- Synthesize answers into spec content:
  - **Motivation**: What's slow/expensive and why it matters
  - **Goals**: Performance targets with measurable thresholds
  - **Technical Considerations**: Baseline metrics, measurement approach, constraints
  - **Open Questions**: Unknowns the planner should profile or research
- Set `type: optimization` in spec frontmatter
- Follow `.allhands/flows/shared/CREATE_SPEC.md` to write, persist, and optionally enable the spec
