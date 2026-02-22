<goal>
Transform the spec into executable prompts with domain-appropriate planning depth. Per **Quality Engineering**, deep domains get full planning with variant architecture and jury review. Per **Frontier Models are Capable**, focused domains get lightweight scoping that leaves room for hypothesis-driven discovery. The workflow domain config at `WORKFLOW_DOMAIN_PATH` drives planning behavior.
</goal>

<inputs>
- Spec doc path
- Alignment doc path
- Prompts folder path
- `WORKFLOW_DOMAIN_PATH` — path to the workflow domain config file
</inputs>

<constraints>
- MUST read the workflow domain config before planning — `planning_depth` determines the planning path
- MUST present recommended approach for each decision point
- MUST NOT re-ask questions already solidified by the spec — the spec represents resolved decisions from ideation
- MUST NOT ask questions with obvious answers derivable from spec context or research findings
- MUST leverage research findings to propose alternatives, challenge approaches, and surface unforeseen constraints — never enter the interview uninformed
- MUST include jury review when domain config sets `jury_required: true`
- NEVER read jury review files (`.allhands/flows/shared/jury/*`) directly — subtasks load their own flows per **Context is Precious**
- Focused planning domains MUST document unresolved questions in alignment doc for emergent planner consumption
- Prompts MUST be fully autonomous — no human intervention during execution
</constraints>

## Context Gathering

- Read the spec doc
- Read the workflow domain config at `WORKFLOW_DOMAIN_PATH`
  - **Defensive fallback**: If `WORKFLOW_DOMAIN_PATH` is empty or the file does not exist, default to deep planning behavior (`planning_depth: deep`, `jury_required: true`). Per **Knowledge Compounding**, this handles backward compatibility with specs created before domain config was active.
  - Note `planning_depth`, `jury_required`, and the Planning Considerations section
- Read the alignment doc for existing prompts that may impact planning (if exists)
- Read codebase files referenced in spec for initial grounding
- Ensure your branch is up to date with base branch
- Run `ah solutions search "<keywords>"` for relevant past learnings and engineer preferences

## Idempotency Check

Per **Knowledge Compounding**, detect existing planning artifacts and offer modes:

- Check if the prompts folder contains existing prompt files and/or an alignment doc exists
- If no existing artifacts — proceed directly to Planning Depth
- If existing artifacts detected, ask the engineer using `AskUserQuestion`:
  - **Start fresh** — Clear prompts and alignment doc, replan from spec
  - **Amend** — Read existing alignment doc and prompts, produce amendments without re-litigating existing decisions
- In amend mode:
  - Use **reference integrity check** for staleness: decisions referencing prompts that no longer exist or have been significantly modified are flagged as stale and re-presented to the engineer
  - Decisions whose referenced prompts still exist and are structurally intact are preserved
  - Focus research and interview on new/changed areas only

## Planning Depth

Per **Frontier Models are Capable**, the domain config's `planning_depth` determines the planning path — deduce appropriate behavior:

| Planning Depth       | Planning Path    | Research             | Interview                       | Jury                     | Output                                           |
| -------------------- | ---------------- | -------------------- | ------------------------------- | ------------------------ | ------------------------------------------------ |
| `deep` (or fallback) | Deep Planning    | 1-4 deep subtasks    | Full decision interview         | Gated by `jury_required` | 5-15 prompts + detailed alignment doc            |
| `focused`            | Focused Planning | 1-2 focused subtasks | Open questions only (skippable) | No                       | 0-3 seed prompts + problem-focused alignment doc |

The domain config's **Planning Considerations** section drives domain-specific behavior within each path — surface its constraints, limitations, and edge cases during research and interview phases.

## Deep Planning

### Deep Research

Spawn parallel subtasks to ground recommendations before the engineer interview:

- 1-4 Tasks: Tell them to read `.allhands/flows/shared/CODEBASE_UNDERSTANDING.md` to understand relevant implementation approaches
- 0-3 Tasks: Tell them to read `.allhands/flows/shared/RESEARCH_GUIDANCE.md` to isolate optimal solutions (if necessary)
- Apply domain config's Planning Considerations to focus research scope and priorities

After research completes, synthesize findings to identify: approach alternatives the spec didn't consider, constraints or limitations the spec may not account for, edge cases surfaced by codebase reality, and feasibility concerns with stated approaches. Bring these to the interview — don't wait for the engineer to ask.

### Engineer Interview

The interview covers genuinely open decisions — not re-litigation of spec content. The spec represents resolved ideation outcomes; respect them. Per **Quality Engineering**, come to the interview with a researched perspective and present it using `AskUserQuestion`:

- **Only ask about open decisions**: Do not re-ask what the spec has decided. Do not ask questions whose answers are obvious from spec context or research findings. Focus on implementation approach decisions that genuinely require engineer input.
- **Bring your own analysis**: For each decision point, present what research revealed — alternatives the spec didn't consider, constraints discovered in the codebase, tradeoffs between approaches, edge cases that need handling. The engineer should be responding to informed proposals, not generating options from scratch.
- Ask ONE decision point at a time — do not batch all questions together
- Each implementation approach becomes a set of options (2-4 per question)
- Engineer can choose one OR many (disposable variants)
- When selecting many, create parallel variant prompts behind feature flags if they can't work together at the same time
- If variant prompts used, engineer MUST choose a **convention** when selecting multiple approaches
- Each option MUST have a recommended approach (mark with "(Recommended)" suffix)
- Adapt subsequent questions based on previous answers when logical dependencies exist
- Use domain config's Planning Considerations to inform approach evaluation criteria

Keep interview concise and actionable.

### Disposable Variant Architecture

When engineer selects multiple approaches:

- Create variant prompts that can execute in parallel
- Each variant hidden behind feature flag
- Variants are cheap to implement and test
- Planning agent is the only agent who architects variant prompt structures
- Pass variant knowledge to prompt creation phase

### External Technology Implementation Usage Research

Spawn subtasks to read `.allhands/flows/shared/EXTERNAL_TECH_GUIDANCE.md`:

- Typically run after understanding the implementation approach and the external technology required
- Can inform the engineer interview where beneficial
- Consolidate approach against actual documentation
- Derive specific implementation steps

### Prompt Creation

- Read `.allhands/flows/shared/PROMPT_TASKS_CURATION.md` for prompt creation guidance
- Transform researched approaches into executable prompts

### Deep Alignment Doc

- Run `ah schema alignment` for format
- Create alignment doc with Overview + Hard User Requirements sections
- Document engineer decisions ONLY when they deviate from recommendations:
  - Record: what you recommended, what they chose instead, their stated reasoning
  - Do NOT record when engineer accepts the recommended approach
  - Purpose: future agents need to know where human judgment overrode AI suggestions
- Do NOT write prompt summaries — those are appended by executor after prompt completion

### Plan Verification

Before jury review (if applicable), self-verify plans achieve goals:

| Dimension            | Check                                       |
| -------------------- | ------------------------------------------- |
| Requirement Coverage | Every spec requirement has task(s)?         |
| Task Completeness    | Every prompt has clear acceptance criteria? |
| Key Links Planned    | Components wire together (API → UI)?        |
| Scope Sanity         | 2-3 tasks per prompt? <7 files per prompt?  |

Fix issues before proceeding.

### Plan Review Jury

**Gated by `jury_required` from domain config.** If `jury_required: false` — skip this section entirely.

Spawn parallel review subtasks (provide alignment doc, spec doc, prompts folder paths):

| Jury Member      | Flow                                                      | Focus                                             |
| ---------------- | --------------------------------------------------------- | ------------------------------------------------- |
| Expectations Fit | `.allhands/flows/shared/jury/PROMPTS_EXPECTATIONS_FIT.md` | Alignment + prompts fit spec expectations         |
| Flow Analysis    | `.allhands/flows/shared/jury/PROMPTS_FLOW_ANALYSIS.md`    | Prompt dependencies, variant ordering, importance |
| YAGNI            | `.allhands/flows/shared/jury/PROMPTS_YAGNI.md`            | Holistic over-engineering check                   |
| Premortem        | `.allhands/flows/shared/jury/PROMPT_PREMORTEM.md`         | Risk analysis — Tigers, Elephants, failure modes  |

After jury returns:

- Read `.allhands/flows/shared/REVIEW_OPTIONS_BREAKDOWN.md` for feedback synthesis
- Premortem Tigers become P1/P2 review items; Elephants become discussion points
- Present actionable options to engineer (including risk acceptance decisions)
- Amend prompts based on engineer choices, respecting PROMPT_TASKS_CURATION limits:
  - Do NOT pack substantial refinements into existing prompts
  - Create NEW prompts for additions that exceed scope limits (tasks, files)
  - Update prompt dependencies when inserting new prompts
- Document only deviations from recommendations (including accepted risks that were flagged)

### Plan Deepening (Optional)

Per **Knowledge Compounding**, offer to deepen the plan:

Ask engineer: "Would you like to deepen this plan with comprehensive research?"

If yes:

- Read `.allhands/flows/shared/PLAN_DEEPENING.md` and follow instructions
- Applies available skills to each plan section
- Searches solutions for relevant past learnings
- Enhances prompts with research insights
- Preserves original content, only adds research findings

Recommended for complex architectural decisions, high-risk domains, novel technologies, or large specs with many unknowns.

## Focused Planning

### Focused Research

Spawn 1-2 targeted research subtasks grounded in the problem area:

- Tell them to read `.allhands/flows/shared/CODEBASE_UNDERSTANDING.md` focused on the specific problem domain
- Only spawn external research (`.allhands/flows/shared/RESEARCH_GUIDANCE.md`) if the spec references external tools or novel approaches
- Apply domain config's Planning Considerations to focus research direction

### Engineer Scope Narrowing

Present spec open questions and concerns to the engineer using `AskUserQuestion`:

- Each open question becomes a question — engineer can answer to narrow scope or skip
- For each question, present what research revealed and your recommended resolution — the engineer should be responding to an informed proposal, not an open-ended prompt
- Skipped/unanswered questions remain open for hypothesis-driven discovery
- Keep interview brief — focused domains intentionally leave room for discovery

### Seed Prompt Creation

- Read `.allhands/flows/shared/PROMPT_TASKS_CURATION.md` for prompt creation guidance
- Create 0-3 seed prompts as testable hypotheses grounded in research findings
- Seed prompts target the most concrete, immediately actionable aspects of the spec
- Remaining open questions are left for the emergent planner to design experiments around

### Focused Alignment Doc

- Run `ah schema alignment` for format — use the same schema sections with type-appropriate content:
  - **Overview**: Problem statement, evidence, context, and unresolved questions — the emergent planner reads these to design experiments
  - **Hard User Requirements**: Success criteria and constraints
  - **Engineer Decisions**: Only deviations from recommendations (same as deep planning)
- Document unresolved questions (skipped interview questions, open spec questions) prominently in Overview — per **Knowledge Compounding**, this enables emergent planner to discover and test answers
- Document concerns and limitations as context for hypothesis formation
- Do NOT write prompt summaries — those are appended by executor after prompt completion

## Completion

- Finalize prompts and alignment doc
- Edit `.planning/<branch>/status.yaml` to set `stage: executing` — this signals the event loop to begin picking up prompts for execution
- Stop
