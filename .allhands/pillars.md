## Functional Pillars of This Harness

These are the load-bearing approaches that realize the First Principles in `principles.md`. Principles define **why**; pillars define **what** the harness structurally delivers.

### 1. Prompt-Driven Execution Loop

Prompt files are atomic units of work executed in tracked loops. Planned prompts deliver scoped tasks from the planner; emergent prompts are created by the emergent planner as non-overlapping hypotheses for executors to implement. Both follow the same execution primitive — the distinction is origin (planned vs emergent-generated), not execution path. Alignment documents track summaries and decisions across iterations.

### 2. Knowledge Compounding

Everything feeds forward. Branch-scoped ephemeral artifacts — pain points, decisions, learnings — distill into persistent knowledge: solutions, memories, and domain documentation. Future initiatives benefit from all past work through structured retrieval at key planning and discovery points.

### 3. Approach Discoverability

Unified tooling makes knowledge and implementation patterns accessible. Embedded documentation search, semantic code analysis, and sub-agent delegation for scoped retrieval — both codebase-specific and external research. Reduces the cost of finding relevant context to near-zero.

### 4. Skills as Domain Practices

Codebase-specific domain knowledge tuned from execution experience. Not documentation but operational guidance — how to use tools, what patterns to follow, what to avoid. Explicitly accessible per domain. Refined through compounding cycles so future agents inherit hard-won learnings.

### 5. Context-Abstracted Tooling

CLI commands, MCP tools, and context handlers that process externally, withholding raw data from agent context windows. Oracle delegation for LLM-enabled deterministic tasks. Deterministic tools applied stochastically by agents via flow-suggested use cases.

### 6. Progressive Flow Architecture

Instruction sets disclosed progressively as agents need them. Flows reference flows, enabling diverse path-finding through predetermined decision trees. Agents work within scoped guidelines toward specific goals without seeing the full system at once.

### 7. Schema-Driven File Contracts

Single source of configuration for how workflow-critical files are structured. Validated on write, eliminating programmatic dependencies. Stochastic agents write to deterministic contracts across ephemeral and persisted files — one schema definition governs interpretation and authoring system-wide.

### 8. Initiative-Based Orchestration

Harness-managed workflows for milestone development, investigation, optimization, refactoring, documentation, and triage — unified under a single entry point (New Initiative). **Workflow domain configs** (`.allhands/workflows/`) encode per-domain knowledge consumed by shared flows: ideation scoping adapts interview depth, spec planning calibrates research and jury gating, and the emergent planner caps tangential hypotheses — all driven by a single config file per domain rather than separate hardcoded flows. **Initiative steering** provides mid-execution deep replanning with domain-aware scope adjustment, pausing the prompt loop while the engineer redirects goals, modifies prompts, and amends alignment. The **two-phase emergence model** (core consolidation → tangential exploration) focuses emergent work on core goals first, then broadens to adjacent improvements once the initiative's foundation is solid. TMUX orchestration, lifecycle management, observability (tracing), TUI capabilities, and coding agent hook injection for maximum engineer visibility and control. Templated message injection provides workflow-state-specific context to dependent agents.

### 9. Disposable Software & Variant Exploration

Open decisions become emergent implementations behind feature flags. The emergent planner creates batches of non-overlapping hypotheses as prompt files; executors implement them as disposable variants. Multiple solutions to the same problem enable quality engineering: engineers choose conventions, kill weak approaches, or refine into A/B tests for production end-user validation. The coordinator filters unwanted emergent work from PRs via existing refinement analysis. Cheap software development with good guardrails and expectation setting during ideation.
