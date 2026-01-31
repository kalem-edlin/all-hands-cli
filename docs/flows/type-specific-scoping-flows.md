---
description: "Type-specific scoping flows for the unified initiative system -- five interview-driven flows that capture engineer intent for investigation, optimization, refactor, documentation, and triage specs before delegating to the shared spec creation pipeline"
---

# Type-Specific Scoping Flows

The harness supports six spec types: milestone, investigation, optimization, refactor, documentation, and triage. Milestone specs enter through the ideation session (see [spec-planning](spec-planning.md)). The remaining five types each have a dedicated scoping flow that interviews the engineer and delegates to the shared spec creation pipeline.

## Shared Pattern

All five scoping flows follow a two-phase structure:

1. **Scoping Interview** -- Ask targeted questions via `AskUserQuestion`, one at a time. Per **Frontier Models are Capable**, the agent adapts depth based on engineer responses -- probing vague answers, skipping questions already addressed.
2. **Spec Creation** -- Synthesize interview answers into spec content (Motivation, Goals, Technical Considerations, Open Questions), set the `type` field in spec frontmatter, and delegate to [ref:.allhands/flows/shared/CREATE_SPEC.md::e145081] for persistence.

The interview dimensions differ per type because each problem class has distinct information needs. An investigation needs evidence and symptoms; an optimization needs baselines and targets.

## Per-Type Interview Dimensions

| Spec Type | Flow | Questions | Key Dimensions |
|-----------|------|-----------|----------------|
| Investigation | [ref:.allhands/flows/INVESTIGATION_SCOPING.md::4eddba4] | 5 | Symptom description, evidence/reproduction, success criteria, constraints, suspected root causes |
| Optimization | [ref:.allhands/flows/OPTIMIZATION_SCOPING.md::4eddba4] | 5 | Bottleneck identification, performance targets, measurement approach, baseline metrics, constraints |
| Refactor | [ref:.allhands/flows/REFACTOR_SCOPING.md::4eddba4] | 5 | Scope boundaries, invariants to preserve, target architecture, migration strategy, constraints |
| Documentation | [ref:.allhands/flows/DOCUMENTATION_SCOPING.md::4eddba4] | 4 | Coverage areas, target audience, existing docs state, format and location |
| Triage | [ref:.allhands/flows/TRIAGE_SCOPING.md::4eddba4] | 3 | External signals, impact and urgency, desired outcome (stub) |

### Triage: Stub Status

The triage scoping flow is a manual-input stub. Full external source integration (PostHog, Sentry, PagerDuty) is deferred to a future spec. Engineers paste or summarize external signals rather than the harness pulling them automatically.

## Branch Prefix Convention

Each spec type maps to a default branch prefix when the spec does not specify one explicitly. The `branch` field on the spec is always the source of truth.

| Spec Type | Branch Prefix |
|-----------|---------------|
| `milestone` (or missing) | `feature/` |
| `investigation` | `fix/` |
| `optimization` | `optimize/` |
| `refactor` | `refactor/` |
| `documentation` | `docs/` |
| `triage` | `triage/` |

These conventions are defined in [ref:.allhands/flows/shared/CREATE_SPEC.md::e145081] and applied during `ah specs persist`.

## Downstream Impact

Scoped specs flow into type-aware planning. Per [spec-planning](spec-planning.md), milestone specs receive deep planning with jury review (5-15 prompts), while all other types receive exploratory planning (1-2 research subtasks, 0-3 seed prompts). The spec `type` field set during scoping drives this branching.
