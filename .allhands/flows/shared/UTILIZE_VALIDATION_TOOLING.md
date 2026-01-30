<goal>
Find and apply existing validation tooling to build strong acceptance criteria. Per **Agentic Validation Tooling**, matching the right suite to the task ensures programmatic validation without engineer intervention.
</goal>

<inputs>
- Files/domains involved in the implementation task
- Nature of the changes (UI, backend, database, etc.)
</inputs>

<outputs>
- Matched suite file paths for `validation_suites` frontmatter
- Acceptance criteria derived from suite commands
</outputs>

<constraints>
- MUST run `ah validation-tools list` to discover available suites
- MUST match suites via both glob patterns AND description inference
- MUST document gaps for CREATE_VALIDATION_TOOLING follow-up
- MUST order validation progressively (compiles → unit tests → integration → E2E)
</constraints>

## Step 1: Discover Available Suites

- Run `ah validation-tools list`
- Returns JSON with: `name`, `description`, `globs`, `file` path, `tools`

## Step 2: Identify Relevant Suites

Match suites using two approaches:

**Glob pattern matching** (programmatic):
- Compare files you're touching against each suite's `globs`
- Suites with matching patterns are likely relevant

**Description inference** (semantic):
- Read suite descriptions
- Match against task nature (UI, DB migrations, API endpoints, etc.)

Select all suites that apply to implementation scope.

## Step 3: Read Suite Documentation

For each relevant suite:
- Run `cat .allhands/validation/<suite-name>.md`

Understand:
- **Purpose**: What quality aspects it validates
- **Tooling**: What tools are needed and how to install/configure them
- **Stochastic Validation**: How to use the suite for exploratory agent-driven validation during implementation
- **Deterministic Integration**: What CI-gated commands to run for acceptance criteria

## Step 4: Integrate into Acceptance Criteria

Per **Agentic Validation Tooling**, use each dimension at the right phase:

- **During implementation**: Follow the **Stochastic Validation** section — use model intuition to probe edge cases, test user flows, and verify quality beyond deterministic checks
- **For acceptance criteria**: Reference the **Deterministic Integration** section — these are binary pass/fail commands that gate completion
- Stochastic exploration informs quality during the work but is not an acceptance criterion — acceptance criteria must be deterministic

Order validation progressively when writing acceptance criteria:

Example:
```markdown
## Acceptance Criteria
- [ ] Code compiles without errors
- [ ] `npx vitest run --coverage` passes with >80% coverage on changed files
- [ ] `npx playwright test auth.spec.ts` passes all auth flow scenarios
- [ ] No regressions in existing test suites
```

## Step 5: Note Gaps

If validation needs have no matching suite:
- Document the gap explicitly
- Flag for CREATE_VALIDATION_TOOLING follow-up
- Proceed with available validation (compiles, type checks, basic tests)

## For Prompt Curation

When used via PROMPT_TASKS_CURATION:
- Add suite file paths to prompt's `validation_suites` frontmatter
- Use the `file` field from `ah validation-tools list` output
- Makes validation approach explicit and reviewable
- Executors can read referenced suite files directly
