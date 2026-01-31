---
name: optimization
type: optimization
planning_depth: focused
jury_required: false
max_tangential_hypotheses: 2
required_ideation_questions:
  - "What's slow / expensive?"
  - "What are the performance targets?"
  - "How should improvements be measured?"
  - "Current baseline metrics?"
  - "Any constraints?"
---

## Domain Knowledge

### Performance Vocabulary

Optimization specs are grounded in quantitative measurement. Key performance dimensions:

| Dimension | Metrics | Examples |
|-----------|---------|----------|
| **Latency** | Response time, P50/P95/P99 | "API responds in 200ms P95" |
| **Throughput** | Requests/sec, items/sec | "Process 1000 events/sec" |
| **Resource usage** | Memory, CPU, disk, connections | "Stay under 512MB RSS" |
| **Cost** | $/request, $/month, compute hours | "Reduce Lambda cost by 40%" |

### Baseline-Target-Measurement Triple

Every optimization must establish three things:
1. **Baseline**: Current measured performance ("now it takes 2s P95")
2. **Target**: Concrete improvement goal ("reduce to 500ms P95")
3. **Measurement**: How improvement is verified ("benchmark suite X, dashboard Y")

Without all three, the optimization is underspecified. Probe for missing elements.

### Knowledge Gap Detection

| Signal | Action |
|--------|--------|
| "It feels slow" (no numbers) | Demand concrete metrics — profile first |
| "Make it faster" (no target) | Probe for acceptable thresholds |
| "Optimize everything" (no focus) | Identify the bottleneck — what's the user-facing pain? |
| Assumes cause without profiling | Redirect to measurement — "have you profiled this?" |

## Ideation Guidance

Per **Ideation First**, the optimization interview captures measurable targets so the planner can create profiling-first hypotheses.

### Probe Guidance

- Probe vague targets — demand concrete numbers
- Verify baseline metrics exist or flag measurement as a prerequisite task

### Output Sections

Spec body sections for optimization domain:
- **Motivation**: What's slow/expensive and why it matters
- **Goals**: Performance targets with measurable thresholds
- **Technical Considerations**: Baseline metrics, measurement approach, constraints
- **Open Questions**: Unknowns the planner should profile or research

## Planning Considerations

### Profiling-First Approach

Planning should front-load measurement and profiling:
- First prompt(s) establish baseline measurements if not already available
- Optimization prompts follow, each targeting a specific bottleneck
- Final prompt verifies targets are met against the same measurement approach

### Measurement Method Validation

The measurement approach itself must be validated — unreliable benchmarks produce unreliable results. Planning should ensure the measurement tooling is trustworthy before optimizing against it.

### Backwards Compatibility Constraints

Optimization must not change observable behavior. Planning should surface:
- API contract preservation requirements
- Data format compatibility
- Feature flag needs for gradual rollout of performance changes

### Prompt Output Range

Optimization specs produce 2-6 focused prompts. Measurement setup may require its own prompt if baselines don't exist.
