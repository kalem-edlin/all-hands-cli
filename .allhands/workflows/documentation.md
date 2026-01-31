---
name: documentation
type: documentation
planning_depth: focused
jury_required: false
max_tangential_hypotheses: 1
required_ideation_questions:
  - "What areas need documentation?"
  - "Who is the audience?"
  - "Any existing docs to extend or replace?"
  - "What format and location?"
---

## Domain Knowledge

### Audience-First Thinking

Documentation specs are organized around audiences, not features. The same system may need different documentation for different readers:

| Audience | Focus | Depth |
|----------|-------|-------|
| **Developers** | APIs, architecture, contribution guides | Technical, code-level |
| **End users** | Features, workflows, troubleshooting | Task-oriented, no internals |
| **Ops/SRE** | Runbooks, monitoring, deployment | Operational, procedure-focused |
| **New team members** | Onboarding, architecture overview, conventions | Progressive, context-building |

### Documentation State Vocabulary

Existing documentation falls into identifiable states that inform the approach:

| State | Meaning | Action |
|-------|---------|--------|
| **Outdated** | Exists but no longer accurate | Update with current reality |
| **Missing** | No documentation exists | Create from scratch |
| **Scattered** | Information exists across multiple locations | Consolidate and organize |
| **Wrong** | Actively misleading | Correct with high priority |

### Format Taxonomy

Documentation format should match audience and content type:

| Format | Best For |
|--------|----------|
| **README** | Project overview, quickstart, contribution guide |
| **Docs site** | Comprehensive reference, tutorials, guides |
| **Inline code docs** | API reference, function-level documentation |
| **Runbooks** | Operational procedures, incident response |

## Ideation Guidance

Per **Knowledge Compounding**, documentation compounds value when it targets the right audience with the right depth.

### Probe Guidance

- Probe vague coverage requests — demand specific areas and audiences
- Distinguish between "no docs" and "wrong docs" — the approach differs significantly

### Output Sections

Spec body sections for documentation domain:
- **Motivation**: Why current documentation is insufficient
- **Goals**: Coverage targets by audience and area
- **Technical Considerations**: Existing docs state, format preferences, location
- **Open Questions**: Unknowns the planner should investigate

## Planning Considerations

### Coverage-by-Audience-and-Area Framing

Planning should organize documentation work as a coverage matrix:
- Rows: areas/features needing documentation
- Columns: audiences requiring documentation
- Cells: specific documentation deliverables

This framing prevents gaps and avoids redundant documentation across audiences.

### Existing Documentation Assessment

Before writing new documentation, planning should assess what exists:
- Audit existing docs for accuracy and completeness
- Identify reusable content vs content needing replacement
- Map existing documentation to the coverage matrix

### Prompt Output Range

Documentation specs produce 2-5 focused prompts. Each prompt typically covers one audience or one major area.
