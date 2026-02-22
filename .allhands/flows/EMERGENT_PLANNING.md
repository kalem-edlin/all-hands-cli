<goal>
Plan hypotheses as prompt files for executors to implement. Per **Quality Engineering**, this agent discovers which improvements are valuable — separation of concerns keeps planning and execution independent, each bounded in context. A two-phase model ensures core goals are solidified before exploring tangential improvements.
</goal>

<constraints>
- MUST NOT execute any implementation — only create prompt files
- MUST set `type: emergent` in prompt frontmatter — both phases use the same type
- MUST create non-overlapping hypotheses that don't conflict with prior prompts
- NEVER terminate with 0 prompts — per **Knowledge Compounding**, each round compounds work
- NEVER pursue tangential exploration while `core_consolidation: pending`
- MUST respect `max_tangential_hypotheses` cap from workflow domain config
</constraints>

## Context Gathering

- Read the alignment doc for: goals, prior prompt summaries, unresolved questions, learnings
- Read `core_consolidation` from alignment doc frontmatter (default: `pending` if missing)
- Read the workflow domain config at `WORKFLOW_DOMAIN_PATH` for `max_tangential_hypotheses`
- Identify gaps between current state (completed work) and desired state (spec goals + success criteria)
- Run `ah solutions search "<hypothesis terms>"` for relevant prior insights

## Phase Determination

Per **Quality Engineering**, core goals must be convincingly met before exploring adjacent work.

**Phase 1 — Core Consolidation** (`core_consolidation: pending`):

- Focus hypotheses exclusively on verifying, solidifying, and compounding the implementation to meet core initiative goals
- Assess gaps between current implementation state (prompt summaries, completed work) and the alignment doc's stated goals and expectations
- Do NOT pursue tangential exploration — all hypotheses must directly address spec goals, acceptance criteria, or known gaps
- After each hypothesis round, assess whether all core goals are convincingly met based on: alignment doc goals, prompt summaries, implementation state

**Phase 2 — Tangential Exploration** (`core_consolidation: complete`):

- Hypotheses extend the implementation with ideas adjacent to but not explicitly requested in initial goals
- Feature ideas, consolidation, future-proofing, edge case coverage
- Track tangential hypothesis count across rounds — enforce `max_tangential_hypotheses` cap from the workflow domain config
- If cap is reached, stop — no further emergent work

**Transition**: When core consolidation is convincingly met, set `core_consolidation: complete` in the alignment doc frontmatter. This is a judgment call based on alignment doc goals, prompt summaries, and implementation state. Subsequent runs enter Phase 2.

**Self-Gate**: After transitioning `core_consolidation` to `complete`, check the emergent toggle value from context. If the toggle is `off`, STOP immediately — do not create any Phase 2 prompts. The toggle being off means the user has disabled tangential exploration. The harness allowed this spawn only for core consolidation work, which is now complete.

## Hypothesis Formation

- Select hypothesis domains from provided `HYPOTHESIS_DOMAINS` list, diversifying from prior work
- Formulate each hypothesis: implementation approach → intended outcome
- Verify uniqueness via `ah knowledge docs search <query>` against existing prompts
- Phase 1: hypotheses target core goal gaps and verification
- Phase 2: hypotheses explore adjacent improvements and novel experiments (behind feature flags)

## Prompt Creation

- Read `.allhands/flows/shared/PROMPT_TASKS_CURATION.md` for prompt structure and guidance
- Create 1-N prompt files in the prompts folder:
  - Set `type: emergent` in frontmatter
  - Target 2-5 tasks per prompt, each a non-overlapping hypothesis
  - If Phase 2: note feature flag requirement in tasks
- Stop — executors pick up prompts via the loop
