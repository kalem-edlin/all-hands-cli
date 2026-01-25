<goal>
Create a harness improvement spec when compounding identifies systemic issues. Per **Prompt Files as Units of Work**, harness improvements go through the full loop.
</goal>

<inputs>
- Improvement recommendation from compounding
- Problem encountered, fix proposed
</inputs>

<outputs>
- Spec at `specs/roadmap/harness-<name>.spec.md`
</outputs>

<constraints>
- MUST create spec, NOT implement directly
- MUST get engineer confirmation
- MUST scope to single improvement
- Harness specs do NOT block feature specs
</constraints>

## Context & Impact

Receive from compounding: improvement identified, problem it solves, evidence.

Assess: affected flows/commands/hooks, new capability vs fix, risk level.

## Engineer Interview

Present: problem, proposed solution, impact scope, effort, urgency.

If engineer declines: document in `.allhands/memories.md`, exit flow.

## Spec Creation

Create `specs/roadmap/harness-<name>.spec.md`:

```yaml
---
name: harness-<name>
domain_name: harness
status: pending
dependencies: []
tags: [harness-improvement]
---
```

**Note**: `domain_name: harness` triggers skill infrastructure to surface `harness-maintenance` skill during planning.

Body sections: Problem Statement, Proposed Solution, Acceptance Criteria, Affected Components, Testing Strategy.

## Handoff

Ask engineer: "This harness improvement spec is ready. Would you like to enable it now, or save it for later?"

If yes (enable now):
- Follow `.allhands/flows/shared/ENABLE_SPEC.md` with `spec_path` set to the newly created spec

If no:
- Inform engineer spec is saved in `specs/roadmap/` for later activation via TUI
