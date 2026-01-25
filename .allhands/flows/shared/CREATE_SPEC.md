<goal>
Write a spec file with proper schema, create its branch, and persist to base. Single source of truth for spec creation.
</goal>

## Write Spec

Run `ah schema spec` for the schema format. Write `specs/roadmap/{name}.spec.md` following the schema.

## Persist

Run: `ah specs persist specs/roadmap/{name}.spec.md --json`

This creates the branch, resolves naming collisions, and commits. Parse `specBranch` from response for the final branch name.

Run: `ah knowledge roadmap reindex`

## Confirm

Report spec name and branch to engineer.

Ask: "Would you like to start working on this now?"

If yes:
```bash
git checkout {branch}
ah planning ensure
```
