<goal>
Transform the milestone spec into executable prompts with validated approaches. Per **Quality Engineering**, present approach variants for engineer selection - cheap software means multiple variants can be tested in parallel behind feature flags.
</goal>

<inputs>
- Milestone spec doc path
- Alignment doc path
- Prompts folder path
</inputs>

<constraints>
- MUST research implementation approaches deeply before presenting options
- MUST present recommended approach for each decision point
- MUST verify validation tooling coverage before creating prompts
- MUST spawn plan review jury before finalizing
- NEVER create prompts without validation tooling analysis
</constraints>

## Context Gathering

- Read the alignment doc for existing prompts that may impact planning
- Read the milestone spec doc (high-level engineer intent)
- Read codebase files referenced in spec for initial grounding
- Search documented solutions with `ah solutions search "<keywords>"` for relevant past learnings in this domain

## Deep Research

For each implementation approach area identified from spec, spawn parallel subtasks:
- Read `.allhands/flows/shared/CODEBASE_UNDERSTANDING.md` for codebase grounding
- Read `.allhands/flows/shared/RESEARCH_GUIDANCE.md` for solution exploration

## Validation Tooling Analysis

Per **Agentic Validation Tooling**, prompts without validation tooling are weak:
- Run `ah validation-tools list` to see existing coverage
- For greenfield technology → read `.allhands/flows/shared/CREATE_VALIDATION_TOOLING.md` to research and document new suites
- For brownfield domains → verify existing suites cover scope; flag gaps

This informs acceptance criteria quality for new prompts.

## External Technology Research

Spawn subtasks to read `.allhands/flows/shared/EXTERNAL_TECH_GUIDANCE.md`:
- Dissect open source libraries for guidance
- Consolidate approach against actual documentation
- Derive specific implementation steps

## Engineer Interview

Per **Quality Engineering**, present researched approaches as options:
- Each implementation approach becomes a set of options
- Engineer can choose one OR many (disposable variants)
- When selecting many, create parallel variant prompts behind feature flags
- Engineer MUST choose a **convention** when selecting multiple approaches
- Each option MUST have a recommended approach

Keep interview concise and actionable.

## Disposable Variant Architecture

When engineer selects multiple approaches:
- Create variant prompts that can execute in parallel
- Each variant hidden behind feature flag
- Variants are cheap to implement and test
- Planning agent is the only agent who architects variant prompt structures
- Pass variant knowledge to prompt creation phase

## Prompt Creation

- Read `.allhands/flows/shared/PROMPT_TASKS_CURATION.md` for prompt creation guidance
- Transform researched approaches into executable prompts
- Include validation tooling references in acceptance criteria

## Alignment Doc Setup

- Run `ah schema alignment` for format
- Create alignment doc with top-level goal + objectives
- Document engineer decisions from interview

## Plan Verification

Before spawning jury, self-verify plans can achieve goals:

| Dimension | Check |
|-----------|-------|
| Requirement Coverage | Every spec requirement has task(s)? |
| Task Completeness | Every prompt has clear acceptance criteria? |
| Key Links Planned | Components wire together (API → UI)? |
| Scope Sanity | 2-3 tasks per prompt? <7 files per prompt? |
| Validation Coverage | Each prompt has validation tooling reference? |

If issues found, fix before jury review.

## Plan Review Jury

Spawn parallel review subtasks (provide alignment doc, spec doc, prompts folder paths):

| Jury Member | Flow | Focus |
|-------------|------|-------|
| Expectations Fit | `.allhands/flows/shared/jury/PROMPTS_EXPECTATIONS_FIT.md` | Alignment + prompts fit spec expectations |
| Flow Analysis | `.allhands/flows/shared/jury/PROMPTS_FLOW_ANALYSIS.md` | Prompt dependencies, variant ordering, importance |
| YAGNI | `.allhands/flows/shared/jury/PROMPTS_YAGNI.md` | Holistic over-engineering check |

After jury returns:
- Read `.allhands/flows/shared/REVIEW_OPTIONS_BREAKDOWN.md` for feedback synthesis
- Present actionable options to engineer
- Amend alignment doc / prompts based on engineer choices
- Document engineer decisions (critical for compounding)

## Plan Deepening (Optional)

Per **Knowledge Compounding**, offer to deepen the plan:

Ask engineer: "Would you like to deepen this plan with comprehensive research?"

If yes:
- Read `.allhands/flows/shared/PLAN_DEEPENING.md` and follow instructions
- Applies available skills to each plan section
- Searches solutions for relevant past learnings
- Enhances prompts with research insights
- Preserves original content, only adds research findings

This is recommended for:
- Complex architectural decisions
- High-risk domains (security, payments, data migrations)
- Novel technologies not yet in codebase
- Large milestones with many unknowns

## Completion

Stop once prompts + alignment doc are ready for execution.