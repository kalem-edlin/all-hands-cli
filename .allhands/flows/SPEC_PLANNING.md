<goal>
Transform the spec into executable prompts with validated approaches. Per **Quality Engineering**, present approach variants for engineer selection - cheap software means multiple variants can be tested in parallel behind feature flags.
</goal>

<inputs>
- Spec doc path
- Alignment doc path
- Prompts folder path
</inputs>

<constraints>
- MUST research / gather implementation approaches deeply before presenting options
- MUST present recommended approach for each decision point
- MUST spawn plan review jury before finalizing
</constraints>

## Context Gathering

- Read the spec doc (high-level engineer intent)
- Read the alignment doc for existing prompts that may impact planning (if exists)
- Read codebase files referenced in spec for initial grounding
- Ensure your branch is up to date with base branch
- Search documented solutions with `ah solutions search "<keywords>"` for relevant past learnings in this domain

## Deep Research

Spawn parallel general subtasks to ground yourself with information that will help you be confident making recommendations in the upcoming interview and subsequent writing of this implementation:
- 1-4 Tasks: Read `.allhands/flows/shared/CODEBASE_GROUNDING.md` with understanding relevant implementation approaches in the codebase
- 0-3 Tasks: Read `.allhands/flows/shared/RESEARCH_GUIDANCE.md` with search goals for isolating optimal solutions to the problem (if necessary)

## Engineer Interview

Per **Quality Engineering**, present researched approaches as options using the `AskUserQuestion` tool:
- Ask ONE decision point at a time - do not batch all questions together
- Each implementation approach becomes a set of options (2-4 per question)
- Engineer can choose one OR many (disposable variants)
- When selecting many, create parallel variant prompts behind feature flags
- Engineer MUST choose a **convention** when selecting multiple approaches
- Each option MUST have a recommended approach (mark with "(Recommended)" suffix)
- Adapt subsequent questions based on previous answers when logical dependencies exist

Keep interview concise and actionable.

## Disposable Variant Architecture

When engineer selects multiple approaches:
- Create variant prompts that can execute in parallel
- Each variant hidden behind feature flag
- Variants are cheap to implement and test
- Planning agent is the only agent who architects variant prompt structures
- Pass variant knowledge to prompt creation phase

## External Technology Implementation Usage Research

Spawn subtasks to read `.allhands/flows/shared/EXTERNAL_TECH_GUIDANCE.md`:
- Typically run after understanding the implementation approach and the external technology required
- Can be used to answer questions on open source libraries to help with the engineer interview, where beneficial 
- Consolidate approach against actual documentation
- Derive specific implementation steps

## Prompt Creation

- Read `.allhands/flows/shared/PROMPT_TASKS_CURATION.md` for prompt creation guidance
- Transform researched approaches into executable prompts
- Read `.allhands/flows/shared/UTILIZE_VALIDATION_TOOLING.md` to discover and assign existing validation suites to prompts
- For high-risk domains (auth, payments, data), note TDD approach requirement in prompt
  - Reference `.allhands/flows/shared/TDD_WORKFLOW.md` for TDD execution guidance

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
| Validation Coverage | Prompts reference available validation suites where applicable? |

If issues found, fix before jury review.

## Plan Review Jury

Spawn parallel review subtasks (provide alignment doc, spec doc, prompts folder paths):

| Jury Member | Flow | Focus |
|-------------|------|-------|
| Expectations Fit | `.allhands/flows/shared/jury/PROMPTS_EXPECTATIONS_FIT.md` | Alignment + prompts fit spec expectations |
| Flow Analysis | `.allhands/flows/shared/jury/PROMPTS_FLOW_ANALYSIS.md` | Prompt dependencies, variant ordering, importance |
| YAGNI | `.allhands/flows/shared/jury/PROMPTS_YAGNI.md` | Holistic over-engineering check |
| Premortem | `.allhands/flows/shared/jury/PROMPT_PREMORTEM.md` | Risk analysis - Tigers, Elephants, failure modes |

After jury returns:
- Read `.allhands/flows/shared/REVIEW_OPTIONS_BREAKDOWN.md` for feedback synthesis
- Premortem Tigers become P1/P2 review items; Elephants become discussion points
- Present actionable options to engineer (including risk acceptance decisions)
- Amend alignment doc / prompts based on engineer choices
- Document engineer decisions including accepted risks (critical for compounding)

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
- Large specs with many unknowns

## Completion

Stop once prompts + alignment doc are ready for execution.