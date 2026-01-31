<goal>
Write a spec file with proper schema, persist to base branch. Single source of truth for spec creation.
</goal>

## Write Spec

Run `ah schema spec` for the schema format. Write `specs/roadmap/{name}.spec.md` following the schema.

## Branch Prefix Convention

Per **Frontier Models are Capable**, derive the default branch prefix from the spec `type` field:

| Spec Type | Branch Prefix |
|-----------|---------------|
| `milestone` (or missing) | `feature/` |
| `investigation` | `fix/` |
| `optimization` | `optimize/` |
| `refactor` | `refactor/` |
| `documentation` | `docs/` |
| `triage` | `triage/` |

The `branch` field on the spec is always the source of truth — this convention applies to the default suggestion when the spec doesn't specify one.

## Create

Run: `ah specs create specs/roadmap/{name}.spec.md --json`

This assigns the branch name (using type-based prefix convention with collision handling), commits the spec file to the base branch, and pushes to origin. Parse `branch` from response for the final branch name. No branch is created at this step — branch creation happens at activation time.

Run: `ah knowledge roadmap reindex`

## Confirm

Report spec name and branch to engineer.

Ask: "Would you like to start working on this now?"

If yes, activate the spec (which creates the branch and sets up planning):
```bash
ah specs activate {name}
```
