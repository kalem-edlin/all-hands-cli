<goal>
Create a validation tooling spec for a new domain. Per **Prompt Files as Units of Work**, validation tooling is infrastructure that goes through the full harness loop.
</goal>

<inputs>
- Gap analysis from ASSESS_VALIDATION_TOOLING
- Original spec blocked by this tooling need
</inputs>

<outputs>
- Spec at `specs/roadmap/validation-<name>.spec.md`
- Original spec updated with `dependencies: [validation-<name>]`
</outputs>

<constraints>
- MUST create spec, NOT implement tooling
- MUST get engineer confirmation
- MUST include CICD + meta-testing in acceptance criteria
</constraints>

## Research

Read `.allhands/flows/shared/RESEARCH_GUIDANCE.md` and investigate:
- Best practices: `ah perplexity research "best practices <validation_type> testing <technology>"`
- Available tools: `ah tavily search "<technology> testing tools"`, `ah tools --list`
- CICD patterns: `ah perplexity research "<validation_type> CICD GitHub Actions"`

If valuable MCP not integrated, note as acceptance criterion.

## Engineer Interview

Present: recommended approach, alternatives, CICD impact, effort, MCP availability.

Confirm engineer agrees and understands this creates a blocking dependency.

## Spec Creation

Create `specs/roadmap/validation-<name>.spec.md`:

```yaml
---
name: validation-<name>
domain_name: infrastructure
status: pending
dependencies: []
tags: [validation-tooling]
---
```

Update original spec with `dependencies: [validation-<name>]`.

Body sections: Context, Acceptance Criteria (setup, coverage, meta-testing, CICD, documentation), Technical Constraints, Out of Scope.

## Handoff

Ask engineer: "This validation tooling spec is ready and blocks your original work. Would you like to switch focus to it now?"

If yes (enable now):
- Follow `.allhands/flows/shared/ENABLE_SPEC.md` with `spec_path` set to the newly created spec

If no:
- Inform engineer spec is saved in `specs/roadmap/` and original spec is blocked until this is complete
