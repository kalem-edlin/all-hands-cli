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

## Repository Agnosticism

This reference file is a generic rule file that ships with the harness. It MUST NOT contain references to project-specific validation suites, commands, or infrastructure. All examples must either:
- Reference existing default validation suites shipped with this repo (currently: xcode-automation, browser-automation)
- Use generic/hypothetical descriptions that any target repository can map to their own context

When examples are needed, use **snippets from the existing default suites** rather than naming suites or commands that belong to a specific target project. Target repositories create their own suites for their domains — this file teaches how to create and structure them, not what they should be called.

**Why**: Target repositories consume this file as authoritative guidance. Project-specific references create confusion (agents look for suites that don't exist), couple the harness to a single project, and violate the principle that this file teaches patterns, not inventories. If a pattern needs a concrete example, draw it from xcode-automation or browser-automation.

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
- **Exploration categories**: Describe with enough command specificity to orient. For untested territory, prefer motivations over prescriptive sequences — the agent extrapolates better from goals than rigid steps. For patterns verified through testing, state them authoritatively (see below).

Formula: **motivations backed by inline command examples + `--help` as prerequisite and progressive disclosure**. Commands woven into use cases give direction; `--help` reveals depth.

### Proven vs Untested Guidance

Validation suites should be grounded in hands-on testing against the actual repo, not theoretical instructions. The level of authority in how guidance is written depends on whether it has been verified:

- **Proven patterns** (verified via the Tool Validation Phase): State authoritatively within use-case motivations — the pattern is established fact, not a suggestion. These override generic tool documentation when they conflict. Example: "`xctrace` requires `--device '<UDID>'` for simulator" is a hard requirement discovered through testing, stated directly alongside the motivation (why: `xctrace` can't find simulator processes without it). The motivation formula still applies — proven patterns are *authoritative examples within motivations*, not raw command catalogs.
- **Untested edge cases** (not yet exercised in this repo): Define the **motivation** (what the agent should achieve and why) and reference **analogous solved examples** from proven patterns. Do NOT write prescriptive step-by-step instructions for scenarios that haven't been verified — unverified prescriptions can mislead the agent into rigid sequences that don't match reality. Instead, trust that a frontier model given clear motivation and a reference example of how a similar problem was solved will extrapolate the correct approach through stochastic exploration.

**Why this matters**: Frontier models produce emergent, adaptive behavior when given goals and reference points. Unverified prescriptive instructions constrain this emergence and risk encoding incorrect assumptions. Motivation + examples activate the model's reasoning about the problem space; rigid untested instructions bypass it. The Tool Validation Phase exists to convert untested guidance into proven patterns over time — the crystallization lifecycle in action.

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

## Command Documentation Principle

Two categories of commands exist in validation suites, each requiring different documentation approaches:

**External tooling commands — Document explicitly**: Commands from external tools (`xctrace`, `xcrun simctl`, `agent-browser`, `playwright`, `curl`, etc.) are stable, unfamiliar to agents by default, and unlikely to change with codebase evolution. Document specific commands, flags, and use cases inline with motivations. Example from xcode-automation: `xcrun xctrace record --template 'Time Profiler' --device '<UDID>' --attach '<PID>'` — the flags, ordering constraints, and PID discovery method are all external tool knowledge that the suite documents explicitly.

**Internal codebase commands — Document patterns, not inventories**: Project-specific scripts, test commands, and codebase-specific CLI wrappers evolve rapidly. Instead:
1. **Document core infrastructure commands explicitly** — commands that boot services, manage environments, and are foundational to validation in the target project. These are stable and essential per-project, but suites should teach agents how to discover them (e.g., "check `package.json` scripts" or "run `--help`"), not hardcode specific script names.
2. **Teach patterns for everything else** — naming conventions, where to discover project commands, what categories mean, and how to build upon them.
3. **Document motivations** — why different test categories exist, when to use which, what confidence each provides.

Per **Frontier Models are Capable**: An agent given patterns + motivations + discovery instructions outperforms one given stale command inventories. Suites that teach patterns age gracefully; suites that enumerate commands require maintenance on every change.

## Decision Tree Requirement

Every validation suite MUST include a decision tree that routes agents to the correct validation approach based on their situation. Decision trees:
- Distinguish which instructions are relevant to which validation scenario (e.g., UI-only test vs full E2E with native code changes)
- Show where/when stochastic vs deterministic testing applies
- Surface deterministic branch points where other validation suites must be utilized (e.g., "Does this branch have native code changes? → Yes → follow xcode-automation decision tree")
- Cleanly articulate multiple expected use cases within a single suite

The decision tree replaces flat prerequisite lists with structured routing. An agent reads the tree and follows the branch matching their situation, skipping irrelevant setup and finding the right cross-references.

## tmux Session Management Standard

All suites that require long-running processes (dev servers, Expo servers, Flask API, Metro bundler) MUST use the tmux approach proven in xcode-automation:

```bash
# CRITICAL: -t $TMUX_PANE pins split to agent's window, not user's focused window
tmux split-window -h -d -t $TMUX_PANE \
  -c /path/to/repo '<command>'
```

**Observability**: Agents MUST verify processes are running correctly via tmux pane capture (`tmux capture-pane -p -t <pane_id>`) before proceeding with validation. This prevents silent failures where a dev server fails to start but the agent proceeds to test against nothing.

**Teardown**: Reverse order of setup. Kill processes via `tmux send-keys -t <pane_id> C-c` or kill the pane.

**Worktree isolation**: Each worktree uses unique ports (via `.env.local`), so tmux sessions in different worktrees don't conflict. Agents must use the correct repo path (`-c`) for the worktree they're operating in.

Reference xcode-automation as the canonical tmux pattern.

## Hypothesis-First Validation Workflow

New suites should be drafted, then tested hands-on on a feature branch before guidance is marked as proven. This aligns with the Proven vs Untested Guidance principle:

1. **Draft**: Write suite files based on plan and codebase analysis (mark unverified practices as hypotheses)
2. **Test on feature branch**: Check out a feature branch and exercise each suite's practices hands-on — boot services, run commands, verify workflows, test worktree isolation
3. **Verify & adjust**: Document what works, what doesn't, what needs adjustment. Worktree-specific concerns get explicit verification.
4. **Solidify**: Only after verification do practices become authoritative guidance. Unverified practices stay framed as motivations per the Proven vs Untested Guidance principle.

The plan/handoff document persists as the hypothesis record. If implementation runs long, it serves as the handoff document for future work.

## Cross-Referencing Between Suites

**Reference** when complex multi-step setup is involved (e.g., simulator setup spanning multiple tools) — point to the authoritative suite's decision tree rather than duplicating instructions.

**Inline** when the command is simple and stable (e.g., `xcrun simctl boot <UDID>`) — no need to send agents to another document for a single command.

Decision trees are the natural place for cross-references — branch points that route to another suite's decision tree. Example from browser-automation: "Does the change affect native iOS rendering? → Yes → follow xcode-automation decision tree for build and simulator verification."

## Testing Scenario Matrix

Target repositories should build a scenario matrix mapping their validation scenarios to suite combinations. The matrix documents which suites apply to which types of changes, so agents can quickly determine what validation is needed. Structure as a table:

| Scenario | Suite(s) | Notes |
|----------|----------|-------|
| _Description of change type_ | _Which suites apply_ | _Any special setup or cross-references_ |

Example using this repo's default suites:

| Scenario | Suite(s) | Notes |
|----------|----------|-------|
| Browser UI changes only | browser-automation | Dev server must be running |
| Native iOS/macOS changes | xcode-automation | Simulator setup via session defaults |
| Cross-platform changes (web + native) | browser-automation + xcode-automation | Each suite's decision tree routes to the relevant validation path |

When a suite serves as a shared dependency for multiple scenarios (e.g., a database management suite referenced by both API and front-end suites), it should be cross-referenced via decision tree branch points rather than duplicated.

## Environment Management Patterns

Validation suites that depend on environment configuration should document these patterns for their domain:

**ENV injection**: Document how the target project injects environment variables for different contexts (local development, testing, production). Suites should teach the pattern (e.g., "check for `.env.*` files and wrapper scripts") rather than hardcoding specific variable names.

**Service isolation**: When validation requires running services (dev servers, databases, bundlers), document how to avoid port conflicts across concurrent worktrees or parallel agent sessions. Reference the suite's ENV Configuration table for relevant variables.

**Worktree isolation**: Each worktree should use unique ports and isolated service instances where possible. Suites should document which resources need isolation and how to configure it (e.g., xcode-automation documents simulator isolation via dedicated simulator clones and derived data paths).

## Suite Creation Guidance

When creating a new validation suite for a new domain:

**Engineer provides**: Testing scenarios, tooling requirements, CI/CD integration needs, cross-references to existing suites.

**Suite author follows**:
1. Follow the validation suite schema (`ah schema validation-suite`)
2. Validate the stochastic dimension meets the existence threshold
3. Apply the Command Documentation Principle — external tools explicit, internal commands via patterns + discovery
4. Include a Decision Tree routing agents to the correct validation path
5. Use tmux Session Management Standard for long-running processes
6. Document proven vs untested guidance per the Hypothesis-First Validation Workflow
7. Cross-reference other suites at decision tree branch points

**Structural templates** (reference the existing default suites for patterns):
- xcode-automation — external-tool-heavy suite (MCP tools, xctrace, simctl). Reference for suites that primarily wrap external CLI tools with agent-driven exploration.
- browser-automation — dual-dimension suite (agent-browser stochastic, Playwright deterministic). Reference for suites that have both agent-driven exploration and scripted CI-gated tests.

## Related References

- [`tools-commands-mcp-hooks.md`](tools-commands-mcp-hooks.md) — When validation uses hooks, CLI commands, or MCP research tools
- [`knowledge-compounding.md`](knowledge-compounding.md) — When crystallized patterns need to compound into persistent knowledge
