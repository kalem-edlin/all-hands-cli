# Validation Tooling

Per **Agentic Validation Tooling**, programmatic validation replaces human supervision. This reference covers how validation suites are created, structured, and how they compound from stochastic exploration into deterministic gates.

## Crystallization Lifecycle

Per **Agentic Validation Tooling**, validation compounds through a lifecycle:

1. **Stochastic exploration** — Agent-driven exploratory testing using model intuition discovers patterns
2. **Pattern crystallization** — Discovered patterns become deterministic checks
3. **CI/CD entrenchment** — Deterministic checks gate releases
4. **Frontier shift** — Stochastic exploration moves to new unknowns

This is how validation compounds. Every domain has both a stochastic dimension (exploratory) and a deterministic dimension (binary pass/fail).

## Suite Existence Threshold

A validation suite must have a meaningful stochastic dimension to justify existing. Deterministic-only tools (type checking, linting, formatting) are test commands referenced directly in acceptance criteria and CI/CD — they are NOT suites.

## Creating Validation Tooling

Follow `.allhands/flows/shared/CREATE_VALIDATION_TOOLING_SPEC.md` for the full process. This creates a spec, not an implementation.

### Research Phase
- Run `ah tavily search "<validation_type> testing tools"` for available tools
- Run `ah perplexity research "best practices <validation_type> testing <technology>"` for best practices
- Determine whether the domain has a meaningful stochastic dimension before proceeding
- Run `ah tools --list` to check existing MCP integrations

### Tool Validation Phase
Per **Agentic Validation Tooling**, research produces assumptions; running the tool produces ground truth:
- Install and verify tool responds to `--help`
- Create a minimal test target (temp directory, not committed)
- Execute representative stochastic workflows
- Systematically try commands against codebase-relevant scenarios
- Document divergences from researched documentation

### Suite Writing Philosophy

Per **Frontier Models are Capable** and **Context is Precious**:

- **`--help` as prerequisite**: Suites MUST instruct agents to pull `<tool> --help` before any exploration — command vocabulary shapes exploration quality. The suite MUST NOT replicate full command docs.
- **Inline command examples**: Weave brief examples into use-case motivations as calibration anchors — not exhaustive catalogs, not separated command reference sections.
- **Motivation framing**: Frame around harness value: reducing human-in-loop supervision, verifying code quality, confirming implementation matches expectations.
- **Exploration categories**: Describe with enough command specificity to orient, not prescriptive sequences that constrain.

Formula: **motivations backed by inline command examples + `--help` as prerequisite and progressive disclosure**. Commands woven into use cases give direction; `--help` reveals depth.

### Evidence Capture

Per **Quality Engineering**, two audiences require different artifacts:

- **Agent (self-verification)**: Primitives used during the observe-act-verify loop (state checks, assertions, console output). Real-time, not recorded.
- **Engineer (review artifacts)**: Trust evidence produced after exploration (recordings, screenshots, traces, reports).

Pattern: explore first, capture second.

## Validation Suite Schema

Run `ah schema validation-suite` for the authoritative schema. Key sections in a suite:

- **Stochastic Validation**: Agent-driven exploratory testing with model intuition
- **Deterministic Integration**: Binary pass/fail commands that gate completion

List available suites: `ah validation-tools list`

## Integration with Prompt Execution

Prompt files reference validation suites in their `validation_suites` frontmatter. During execution:
1. Agent reads suite's **Stochastic Validation** section during implementation for exploratory quality
2. Agent runs suite's **Deterministic Integration** section for acceptance criteria gating
3. Validation review (`PROMPT_VALIDATION_REVIEW.md`) confirms pass/fail

## When to Update This Reference

- Update when creating new validation suites or modifying the suite YAML schema
- Update when changing the crystallization lifecycle stages or suite existence threshold
- Update when modifying the stochastic/deterministic methodology or section conventions
- Update when changing how prompt files reference or integrate validation suites

## Related References

- [`tools-commands-mcp-hooks.md`](tools-commands-mcp-hooks.md) — When validation uses hooks, CLI commands, or MCP research tools
- [`knowledge-compounding.md`](knowledge-compounding.md) — When crystallized patterns need to compound into persistent knowledge
