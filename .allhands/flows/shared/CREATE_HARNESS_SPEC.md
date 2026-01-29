<goal>
Create a harness improvement spec when compounding identifies systemic issues. Per **Prompt Files as Units of Work**, harness improvements go through the full loop.
</goal>

<inputs>
- Engineer-selected improvement issues from compounding (one or more)
- Problems encountered, fixes proposed
- Per-tool impact map from compounding signal analysis (evidence for spec motivation)
</inputs>

<outputs>
- Spec at `specs/roadmap/harness-<name>.spec.md`
</outputs>

<constraints>
- MUST create spec, NOT implement directly
- MUST get engineer confirmation
- MUST scope to engineer-selected improvements from a single compounding session
- Harness specs do NOT block feature specs
</constraints>

## Context & Impact

Receive from compounding: improvement identified, problem it solves, evidence.

Assess: affected flows/commands/hooks, new capability vs fix, risk level.

## Engineer Interview

Present: problem, proposed solution, impact scope, effort, urgency.

If engineer declines: document in `docs/memories.md`, exit flow.

## Spec Creation

Use `name: harness-{name}` and `domain_name: harness` (triggers `harness-maintenance` skill during planning).

Body sections: Problem Statement, Proposed Solution, Affected Components, Testing Strategy (brief - how to verify the improvement works).

Follow `.allhands/flows/shared/CREATE_SPEC.md`.

## Handoff

Ask engineer: "This harness improvement spec is ready. Would you like to start working on it now?"

If yes: checkout the branch and run `ah planning ensure`

If no: inform engineer spec is saved in `specs/roadmap/` for later activation via TUI
