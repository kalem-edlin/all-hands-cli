<goal>
Analyze emergent refinement prompts to determine which should be kept, improved, or eliminated. Per **Quality Engineering**, present options to the engineer for variant selection.
</goal>

<inputs>
- Alignment doc path
- Prompts file directory
</inputs>

<outputs>
- User-patch prompts for improvements/eliminations
- Updated alignment doc with engineer decisions
</outputs>

<constraints>
- MUST analyze all prompts with `type: emergent` frontmatter
- MUST document engineer decisions in alignment doc and prompt files
- MUST use git hashes from prompts to identify file changes for reversion
</constraints>

## Context Gathering

- Read the alignment doc for milestone goal and context
- Read all prompts in the directory with `type: emergent` frontmatter
- Extract git hashes from each prompt to identify affected files

## Prompt Analysis

For each emergent refinement prompt, evaluate:

| Criterion | Question |
|-----------|----------|
| Hypothesis | What did it propose to accomplish? |
| Approach | How did it attempt to solve the outcome? |
| Effectiveness | Did validation results prove goal contribution? |
| Alignment | Does it push toward alignment doc goals? |

## Classification

Categorize each emergent prompt:

| Category | Criteria | Action |
|----------|----------|--------|
| **Keep** | Strong hypothesis, effective, aligned | No action needed |
| **Improve** | Good hypothesis, but execution gaps | Create improvement patch prompt |
| **Eliminate** | Hypothesis doesn't support goal | Create reversion patch prompt |

For "Improve" prompts, document:
- Why they aren't "Keep" status
- What changes would elevate them

## Engineer Decision

Present findings holistically:
- Compare emergent refinements against each other
- Highlight patterns of effective vs ineffective hypotheses
- Offer recommendations per prompt

Allow engineer to:
- Accept suggestions as-is
- Provide custom adjustments
- Decide eliminations

## Prompt Creation

For accepted changes:
- Read `.allhands/flows/shared/PROMPT_TASKS_CURATION.md` for guidance
- Create `type: user-patch` prompts for improvements
- Create `type: user-patch` prompts for eliminations (include reversion steps using git hash file references)

## Decision Documentation

Per **Knowledge Compounding**, document engineer decisions:
- Add rationale to alignment doc
- Amend individual prompt files with engineer steering
- Capture why prompts were kept/improved/eliminated