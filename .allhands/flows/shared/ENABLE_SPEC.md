<goal>
Enable a spec by setting up its planning directory and activating it. Per **Frontier Models are Capable**, you manage branch decisions - the harness is a "dumb filing cabinet" that tracks your choices.
</goal>

<inputs>
- spec_path: Path to the spec file (e.g., `specs/roadmap/taskflow-mvp.spec.md`)
</inputs>

<outputs>
- `.planning/{spec}/` directory with `status.yaml` and `prompts/`
- Spec set as active via `.planning/.active`
- Appropriate git branch checked out
- `last_known_branch` updated in status.yaml
</outputs>

<constraints>
- MUST validate spec exists before proceeding
- NEVER work directly on `$BASE_BRANCH` or other protected branches
</constraints>

## Activate Spec

Run `ah planning activate <spec_path>` - this:
- Creates `.planning/{spec}/` if it doesn't exist
- Sets the spec as active
- Returns status including `last_known_branch`

Parse the JSON response to get the spec name and branch state.

## Branch Setup

Ensure you have an isolated branch for this spec's work:

- Check `last_known_branch` from the activate response
- If prior branch exists and is not `$BASE_BRANCH`, continue there
- Otherwise create a new branch off `$BASE_BRANCH`
- Update tracking with `ah planning update-branch --spec <spec> --branch <branch>`

## Confirm

Report: spec name, branch, planning directory path, ready for planning.
