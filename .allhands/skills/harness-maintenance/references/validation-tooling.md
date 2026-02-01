# Validation Tooling

Programmatic validation replaces human supervision. Validation suites compound from stochastic exploration into deterministic gates.

## Crystallization Lifecycle

1. **Stochastic exploration** — Agent-driven exploratory testing discovers patterns
2. **Pattern crystallization** — Discovered patterns become deterministic checks
3. **CI/CD entrenchment** — Deterministic checks gate releases
4. **Frontier shift** — Stochastic exploration moves to new unknowns

Every domain has both a stochastic dimension (exploratory) and a deterministic dimension (binary pass/fail).

## Suite Existence Threshold

A suite must have a meaningful stochastic dimension to justify existing. Deterministic-only tools (type checking, linting, formatting) are test commands in acceptance criteria and CI/CD — they are NOT suites.

## Repository Agnosticism

This file MUST NOT contain project-specific references. All examples must either reference default suites shipped with this repo (currently: xcode-automation, browser-automation) or use generic descriptions. This file teaches patterns, not inventories.

Project-specific references cause agents to look for suites that don't exist in target repos and couple the harness to a single project. If a pattern needs a concrete example, draw it from xcode-automation or browser-automation.

## Creating Validation Tooling

Follow `.allhands/flows/shared/CREATE_VALIDATION_TOOLING_SPEC.md` for the full process. This creates a spec, not an implementation.

### Research Phase
- `ah tavily search "<validation_type> testing tools"` for available tools
- `ah perplexity research "best practices <validation_type> testing <technology>"` for best practices
- Determine whether the domain has a meaningful stochastic dimension before proceeding
- `ah tools --list` to check existing MCP integrations

### Tool Validation Phase
Research produces assumptions; running the tool produces ground truth:
- Install and verify tool responds to `--help`
- Create a minimal test target (temp directory, not committed)
- Execute representative stochastic workflows
- Try commands against codebase-relevant scenarios
- Document divergences from researched documentation

### Suite Writing Philosophy

- **`--help` as prerequisite**: Suites MUST instruct agents to run `<tool> --help` before exploration. Suites MUST NOT replicate full command docs.
- **Inline command examples**: Weave brief examples into use-case motivations as calibration anchors — not exhaustive catalogs.
- **Motivation framing**: Frame around reducing human-in-loop supervision, verifying quality, confirming implementation matches expectations.
- **Exploration categories**: Enough command specificity to orient. Untested territory: motivations over prescriptive sequences. Verified patterns: state authoritatively.

Formula: **motivations + inline command examples + `--help` for progressive disclosure**.

### Proven vs Untested Guidance

- **Proven patterns** (verified via Tool Validation Phase): State authoritatively within use-case motivations. Override generic tool docs when they conflict. Example: "`xctrace` requires `--device '<UDID>'` for simulator" is a hard requirement discovered through testing, stated directly alongside the motivation.
- **Untested edge cases**: Define the motivation and reference analogous solved examples. Do NOT write prescriptive steps for unverified scenarios — frontier models given clear motivation and a reference example extrapolate better than they follow rigid untested instructions.

The Tool Validation Phase converts untested guidance into proven patterns over time — the crystallization lifecycle in action.

### Evidence Capture

- **Agent (self-verification)**: State checks, assertions, console output during observe-act-verify. Real-time, not recorded.
- **Engineer (review artifacts)**: Recordings, screenshots, traces, reports produced after exploration.

Pattern: explore first, capture second.

## Validation Suite Schema

Run `ah schema validation-suite` for the authoritative schema. Key sections:

- **Stochastic Validation**: Agent-driven exploratory testing
- **Deterministic Integration**: Binary pass/fail commands that gate completion

## Integration with Prompt Execution

Prompt files reference suites in `validation_suites` frontmatter. During execution:
1. Agent reads **Stochastic Validation** during implementation
2. Agent runs **Deterministic Integration** for acceptance criteria gating
3. Validation review (`PROMPT_VALIDATION_REVIEW.md`) confirms pass/fail

## Command Documentation Principle

- **External tooling** (xctrace, simctl, playwright, etc.) — Document explicitly: commands, flags, use cases inline with motivations. Stable and unfamiliar to agents by default. Example from xcode-automation: `xcrun xctrace record --template 'Time Profiler' --device '<UDID>' --attach '<PID>'` — flags, ordering constraints, and PID discovery are external tool knowledge that belongs in the suite.
- **Internal codebase commands** — Document patterns, not inventories: teach discovery (`package.json` scripts, `--help`), naming conventions, motivations for test categories. Pattern-based suites age gracefully; command inventories require constant maintenance.
- **Anti-pattern — exhaustive command tables**: A deterministic section listing every `test:*` command as individual rows goes stale as suites evolve. Instead: document the minimum CI gate command explicitly, teach the naming pattern, point to the source of truth (e.g., `package.json`), and explain how to choose scope. The agent reads the source at execution time — always fresher than a static table.

## Decision Tree Requirement

Every suite MUST include a decision tree routing agents to the correct validation approach:
- Distinguish relevant instructions per scenario (e.g., UI-only vs full E2E)
- Show where stochastic vs deterministic testing applies
- Surface branch points where other suites must be utilized (e.g., "Does this branch have native code changes? → Yes → follow xcode-automation decision tree")

The decision tree replaces flat prerequisite lists with structured routing — an agent follows the branch matching their situation, skipping irrelevant setup.

## tmux Session Management Standard

Suites requiring long-running processes MUST use tmux:

```bash
# -t $TMUX_PANE pins split to agent's window, not user's focused window
tmux split-window -h -d -t $TMUX_PANE \
  -c /path/to/repo '<command>'
```

- **Observability**: Verify via `tmux capture-pane -p -t <pane_id>` before proceeding
- **Teardown**: Reverse order. `tmux send-keys -t <pane_id> C-c` or kill the pane
- **Worktree isolation**: Unique ports per worktree (`.env.local`), correct repo path (`-c`)

Reference xcode-automation as the canonical tmux pattern.

## Hypothesis-First Validation Workflow

New suites: draft, then test on a feature branch before marking guidance as proven.

1. **Draft**: Write suite based on plan/analysis (mark unverified practices as hypotheses)
2. **Test on feature branch**: Exercise practices hands-on
3. **Verify & adjust**: Document what works, what doesn't
4. **Solidify**: Only verified practices become authoritative guidance

The plan/handoff document persists as the hypothesis record for future work.

## Established Practice vs Unvalidated Ideas

Suites contain two kinds of guidance, both authoritative:

- **Established practice**: Verified hands-on. Stated authoritatively — agents follow directly.
- **Unvalidated ideas**: Worth pursuing but not yet exercised. Authoritative as direction — agents encountering them should attempt, assess feasibility, and document outcomes.

Ideas carry an implicit mandate: try to make them work, then capture what happened (see Learnings Destination). Over time, ideas that prove out become established practice. Ideas that prove infeasible get revised or removed. This is the crystallization lifecycle applied to the documentation itself.

## Learnings Destination

When agents discover something during validation:

- **Suite-level learnings** (about the validation *practice*) → update the suite doc directly. The suite is what agents read — improvements compound immediately. Examples: tool flag doesn't work on this OS, one approach is more reliable than another.
- **Task-specific learnings** (about *what was validated*) → knowledge compounding via prompt files or knowledge docs. Examples: endpoint edge case behavior, migration quirks.

Distinction: if it helps any agent validating in this domain regardless of task, it belongs in the suite. If it's specific to a feature, it compounds through knowledge docs.

## Cross-Referencing Between Suites

- **Reference** for complex multi-step setup — point to the authoritative suite's decision tree
- **Inline** for simple, stable commands — no redirect needed for a single command

Decision tree branch points are the natural place for cross-references.

## Suite Discoverability

Suite discovery is programmatic, not manual. No maintained inventories or mapping tables.

- **During creation**: `ah validation-tools list` — check for overlap and cross-reference points before creating a new suite.
- **During utilization**: Agents run `ah validation-tools list` to discover suites via glob patterns and descriptions. Decision trees handle routing.

## Environment Management Patterns

Suites depending on environment configuration should document:

- **ENV injection**: Teach discovery patterns (e.g., "check `.env.*` files") rather than hardcoding variable names
- **Service isolation**: How to avoid port conflicts across concurrent worktrees/sessions
- **Worktree isolation**: Unique ports and isolated service instances per worktree

## Suite Creation Checklist

1. Follow `ah schema validation-suite`
2. Validate stochastic dimension meets existence threshold
3. External tools explicit, internal commands via patterns + discovery
4. Include a Decision Tree
5. Use tmux standard for long-running processes
6. Mark proven vs untested guidance
7. Cross-reference other suites at decision tree branch points

**Structural templates**: xcode-automation (external-tool-heavy), browser-automation (dual stochastic/deterministic).

## Related References

- [`tools-commands-mcp-hooks.md`](tools-commands-mcp-hooks.md) — Validation using hooks, CLI commands, or MCP tools
- [`knowledge-compounding.md`](knowledge-compounding.md) — Crystallized patterns compounding into persistent knowledge
