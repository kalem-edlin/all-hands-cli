---
name: milestone
type: milestone
planning_depth: deep
jury_required: true
max_tangential_hypotheses: 5
required_ideation_questions:
  - "What are you trying to accomplish?"
  - "Why does this matter and what worries you about this?"
  - "What can you handle vs need automated?"
  - "What would success look like?"
---

## Domain Knowledge

### Core Interview Dimensions

The `required_ideation_questions` elicit each dimension directly. Also infer dimensions passively from engineer behavior:

| Dimension | Elicit via | Infer from |
|-----------|------------|------------|
| Goals | "What are you trying to accomplish?" | Problem description |
| Motivations | "Why does this matter?" | Frustrations expressed |
| Concerns | "What worries you about this?" | Caveats/hedging |
| Desires | "What would ideal look like?" | Enthusiasm |
| Capabilities | "What can you handle vs need automated?" | Technical language |
| Expectations | "What would success look like?" | Examples given |

### Category Deep Dives

Work through relevant categories based on milestone scope. Each category surfaces domain-specific concerns that engineers often underspecify:

| Category | Key Questions | Knowledge Gap Signals |
|----------|---------------|----------------------|
| **User Experience** | "Walk through: user opens this first time - what happens?" | Describes features instead of journeys |
| **Data & State** | "What needs to be stored? Where does data come from/go?" | Says "just a database" without schema thinking |
| **Technical** | "What systems must this work with? Constraints?" | Picks tech without understanding tradeoffs |
| **Scale** | "How many users/requests? Now vs future?" | Says "millions" without infrastructure thinking |
| **Integrations** | "External services? APIs consumed/created?" | Assumes integrations are simple |
| **Security** | "Who should do what? Sensitive data?" | Says "just basic login" |

### Additional Knowledge Gap Signals

| Signal | Action |
|--------|--------|
| Conflicting requirements | Surface the conflict explicitly and ask for Disposable Variants Approach |

### Completeness Check

Before transitioning from ideation to spec writing, verify coverage:

| Area | Verified |
|------|----------|
| Problem statement clear | [ ] |
| Technical constraints understood | [ ] |
| User expectations deeply understood | [ ] |
| All discernable milestone elements either have a user expectation, or an open question for downstream agents | [ ] |
| No "To Be Discussed" items remaining | [ ] |

If gaps exist, return to surveying for specific categories.

## Ideation Guidance

Per **Ideation First**, engineers control depth — domain config ensures coverage without forcing depth.

### Probe Guidance

- Probe vague responses with category deep dives
- Detect knowledge gaps using the signal tables

### Guiding Principles Synthesis

Synthesize guiding principles from the engineer's philosophy expressed during ideation. Validate synthesized principles with the engineer before proceeding to spec writing.

### Output Sections

Spec body sections for milestone domain:
- **Motivation**: Implicit in goals — why this matters
- **Goals**: What the engineer is trying to accomplish
- **Technical Considerations**: Grounded in codebase reality from exploration subtasks
- **Open Questions**: For architect to research/decide during planning

### Optional: Spec Flow Analysis

Before or after creating the spec, offer flow analysis for complex features. Recommended for user-facing features with multiple paths, complex integrations, or features with unclear scope boundaries.

## Planning Considerations

### Prompt Output Range

Milestone specs produce 5-15 coordinated prompts. Prompts must be fully autonomous — no human intervention during execution.
