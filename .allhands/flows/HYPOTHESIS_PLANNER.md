<goal>
Plan hypotheses as prompt files for executors to implement. Per **Quality Engineering**, this agent discovers which improvements are valuable — separation of concerns keeps planning and execution independent, each bounded in context.
</goal>

<constraints>
- MUST NOT execute any implementation — only create prompt files
- MUST always produce at least 1 prompt — if core goals are met, create adjacent improvements or novel experiments
- MUST set `type: emergent` in prompt frontmatter
- MUST create non-overlapping hypotheses that don't conflict with prior prompts
- NEVER terminate with 0 prompts — per **Knowledge Compounding**, each round compounds work
</constraints>

## Context Gathering

- Read the alignment doc for: goals, prior prompt summaries, unresolved questions, learnings
- Identify gaps between current state (completed work) and desired state (spec goals + success criteria)
- Run `ah memories search "<hypothesis terms>"` for relevant prior insights

## Gap Assessment & Hypothesis Formation

Assess progression — not sequential, revisit as needed:
1. **Core Goal Work** — Directly addresses spec goals, acceptance criteria, or known gaps
2. **Adjacent Improvements** — Tangentially related enhancements that compound core work
3. **Novel Experiments** — Creative extensions (behind feature flags) that stress-test assumptions

Always producing work, progressively more tangential as core goals are met. Check prior prompt summaries to diversify.
- Select hypothesis domains from provided `HYPOTHESIS_DOMAINS` list, diversifying from prior work
- Formulate each hypothesis: implementation approach → intended outcome
- Verify uniqueness via `ah knowledge docs search <query>` against existing prompts

## Prompt Creation

- Read `.allhands/flows/shared/UTILIZE_VALIDATION_TOOLING.md` to discover validation suites for hypothesis domains
- Read `.allhands/flows/shared/PROMPT_TASKS_CURATION.md` for prompt structure and guidance
- Create 1-N prompt files in the prompts folder:
  - Set `type: emergent` in frontmatter
  - Target 2-5 tasks per prompt, each a non-overlapping hypothesis
  - Add discovered validation suites to `validation_suites` frontmatter
  - If tangential: note feature flag requirement in tasks
- Stop — executors pick up prompts via the loop
