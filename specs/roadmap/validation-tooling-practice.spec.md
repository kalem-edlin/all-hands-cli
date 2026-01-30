---
name: validation-tooling-practice
domain_name: validation
status: roadmap
dependencies: []
branch: feature/validation-tooling-practice
---

# Validation Tooling Practice

## Motivation

The harness's Pillar 10 (**Agentic Validation Tooling**) exists to decouple engineers from the implementation loop — engineers ideate and set expectations, agents implement and validate, engineers return for quality control. This only works if validation tooling is robust, well-categorized, and well-understood by agents.

Today, the harness has almost no validation tooling infrastructure:
- One validation suite (`typescript-typecheck.md`) that doesn't meet the refined suite existence threshold — it has no stochastic dimension and is already enforced by hooks
- A validation-suite schema that models validation as a flat list of commands with no distinction between exploratory agent-driven validation and deterministic CI/CD-integrated validation
- Flows that reference validation suites but don't distinguish how agents should use them (stochastically during implementation vs. deterministically for acceptance criteria)
- No concrete suite demonstrating the model end-to-end

Engineer desires a two-dimensional validation model where every suite covers the same domain across stochastic validation (agent-driven exploratory testing using model intuition) and deterministic integration (binary pass/fail gating for CI/CD). These dimensions follow a crystallization lifecycle: stochastic exploration discovers patterns, patterns crystallize into deterministic checks, deterministic checks get entrenched in CI/CD, and stochastic exploration shifts to the frontier.

## Goals

1. **Establish the validation tooling practice model** — Define the stochastic/deterministic two-dimension taxonomy, the crystallization lifecycle, and the suite existence threshold as the foundational mental model for all validation in the harness

2. **Update the validation-suite schema** — Replace the current body sections (`Purpose`, `When to Use`, `Validation Commands`, `Interpreting Results`, `CICD Integration`) with the refined structure: `Purpose`, `Tooling`, `Stochastic Validation`, `Deterministic Integration`, conditional `ENV Configuration`. Add `tools` frontmatter field (string array, required)

3. **Update harness flows** — Align the following flows with the two-dimensional model:
   - `UTILIZE_VALIDATION_TOOLING.md` — Reference stochastic/deterministic dimensions when matching suites to acceptance criteria
   - `CREATE_VALIDATION_TOOLING_SPEC.md` — New suites must articulate their stochastic dimension to justify existence per the suite threshold
   - `PROMPT_TASK_EXECUTION.md` — Distinguish stochastic exploration (during implementation) from deterministic validation (for acceptance criteria)
   - `E2E_TEST_PLAN_BUILDING.md` — Align categorization with suite taxonomy
   - `COMPOUNDING.md` — Track the crystallization lifecycle: which stochastic patterns should be engrained deterministically

4. **Update Principle #6 in `principles.md`** — Enrich "Agentic Validation Tooling" with the stochastic/deterministic dimension distinction, the crystallization lifecycle concept, and the suite existence threshold

5. **Delete `typescript-typecheck.md`** — Does not meet the suite existence threshold (no stochastic dimension). Type checking is already enforced by the validation hooks (tsc diagnostics on every write) and is intuitive to frontier models

6. **Create `supabase-database.md` as the first real validation suite** — Following the new schema, covering database migration validation with Supabase branching. Includes stochastic playbook (migration + connected services exploration, rollback behavior, production-grade data stress, concurrent access), deterministic integration (migration scripts, schema diff assertions, CI/CD pipeline guidance), and ENV configuration for preview database connection swapping

7. **Define where deterministic-only tools go** — Engineer desires these are simply not suites. They are test commands referenced directly in acceptance criteria and CI/CD pipelines. No new schema type or directory needed — the suite abstraction is reserved for domains with meaningful stochastic dimensions

## Non-Goals

- **CI/CD pipeline implementation** — This milestone defines the practice model and creates the first suite. Actually building GitHub Actions workflows for preview database provisioning, migration-on-push, and deterministic gating is downstream work
- **Playwright suite creation** — The existing `validation-playwright.spec.md` will be superseded by this milestone's practices. A future milestone will create a Playwright suite following the new schema
- **Automated suite matching** — No `ah validation-tools match <file>` command. Suite matching remains agent-driven via glob patterns and semantic inference
- **Cross-suite ENV configuration** — ENV configuration is suite-specific by design. No shared ENV doc or cross-suite ENV management

## Open Questions

- **Supabase CLI setup prerequisites**: What Supabase project configuration is needed before the suite's stochastic playbook can be executed? Architect should research the minimum viable Supabase branching setup and document in the suite's Tooling section
- **Preview database data seeding**: Engineer desires production-grade data for migration testing. Architect should determine the recommended approach for seeding preview databases — Supabase snapshot restore, pg_dump/pg_restore, or synthetic seed scripts — and document tradeoffs in the stochastic playbook
- **Hook validation updates**: The validation hooks in `validation.ts` enforce the current `validation-suite` schema via pattern matching. Architect should determine whether schema enforcement needs code changes to support the new required sections, or whether the YAML schema update is sufficient since enforcement uses the schema file as source of truth

## Technical Considerations

- **Schema is source of truth**: The `validation-suite.yaml` schema file is loaded by `loadSchema()` in `validation.ts` and enforced on every write to `.allhands/validation/*.md`. Changing the schema file should propagate enforcement automatically, but the section validation logic in `validateFrontmatter()` may need review
- **`ah validation-tools list` command**: The `listValidationSuites()` function in `validation-tools.ts` reads frontmatter fields `name`, `description`, `globs`. Adding the `tools` field means this command should also surface `tools` in its output for richer discovery
- **Existing flow references**: Multiple flows reference validation suites. The updated suite schema changes body section names, which means any flow that instructs agents to "read the Validation Commands section" or "check the CICD Integration section" needs updating to reference the new section names
- **`validation-playwright.spec.md` supersession**: This spec exists at `specs/roadmap/validation-playwright.spec.md`. It was written under the old schema model. Future work on Playwright validation should follow the practices established by this milestone. The existing spec should be marked as superseded or updated to reference this milestone's practices
- **Pillar 10 in `pillars.md`**: The newly created `pillars.md` describes Agentic Validation Tooling as the 10th pillar. The practices established in this milestone are the concrete realization of that pillar. No changes to `pillars.md` are needed — it already captures the two-dimensional model at the pillar level
- **Stochastic terminology**: Engineer deliberately chose "stochastic" over "heuristic" — deterministic/stochastic is an established CS pair. All flows and documentation should use this terminology consistently
- **Suite existence threshold enforcement**: Assuming the CREATE_VALIDATION_TOOLING_SPEC flow update is sufficient to enforce the threshold during suite creation. No programmatic enforcement needed — per **Frontier Models are Capable**, the flow guidance is sufficient

## Implementation Reality

### What was actually implemented vs planned

All 7 Goals were achieved, with one significant pivot and substantial emergent work:

**Goal 6 pivoted**: Spec planned `supabase-database.md` but implementation created `browser-automation.md` instead. The engineer chose browser automation as the first suite — it demonstrated the stochastic/deterministic model more clearly with agent-browser (stochastic) and Playwright (deterministic) as distinct tools for each dimension. Open Questions about Supabase CLI setup and data seeding became moot.

**Goal 7 resolved by design**: Deterministic-only tools were defined as "not suites" through principle/flow updates. No separate schema or directory was needed.

**Open Question on hook validation**: Resolved — `validateFrontmatter()` only checks frontmatter fields, not body sections. Body section definitions in the schema YAML are documentation-only, not hook-enforced. Accepted per **Frontier Models are Capable**.

### How engineer desires evolved

1. **Documentation philosophy reversal (Prompt 05→09)**: Engineer initially chose detailed CLI commands for browser-automation suite, then reversed after hands-on agent-browser testing. Discovery: commands are discoverable via `--help`; suite value is teaching agents HOW TO THINK about using a tool. This spawned Prompt 08 (suite creation flow refinement with documentation principles) before Prompt 09 applied it.

2. **Pillar terminology override**: Engineer overrode spec instruction to "leave pillars.md as-is" and updated "heuristic" → "stochastic" for cross-document consistency.

3. **validation-playwright.spec.md**: Engineer deleted directly rather than marking superseded through the review process.

### Emergent work (all kept)

- **147 new tests** across 3 emergent testing prompts (06, 07, 10) for previously untested schema validation infrastructure
- **Suite creation flow refinement** (Prompt 08) — Tool Validation phase, documentation principles, evidence capture guidance, 6-subsection stochastic structure
- **Dual validation path consolidation** — Emergent testing (Prompt 10) documented 4 divergences between `hooks/validation.ts` and `lib/schema.ts`, enabling Jury Review to consolidate both paths into single-source-of-truth delegation

### Key technical decisions

- **Schema enforcement is frontmatter-only**: Body section validation is documentation-only in schema YAML, not hook-enforced. Per **Frontier Models are Capable**, flow guidance suffices.
- **Triple extractFrontmatter consolidation**: `hooks/validation.ts`, `commands/validation-tools.ts`, and `lib/schema.ts` all had independent implementations. Consolidated to lib as single source of truth.
- **Array item-type validation**: Added to both validation paths — `tools: [123]` now rejected when `items: string` specified in schema.
- **blockTool format mismatch**: Discovered `blockTool()` outputs `{ decision: 'block' }` while hook-runner expects `{ continue: false }`. Documented as known harness inconsistency.
