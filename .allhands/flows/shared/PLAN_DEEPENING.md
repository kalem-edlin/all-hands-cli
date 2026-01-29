<goal>
Enhance planning artifacts with parallel research and skill application. Per **Knowledge Compounding**, surface relevant learnings and best practices before implementation begins.
</goal>

<inputs>
- Alignment doc path
- Prompts folder path
- Spec doc path
</inputs>

<outputs>
- Enhanced prompts with research insights sections
- Updated alignment doc with discovered considerations
- Conflict report (if research conflicts with current plan)
</outputs>

<constraints>
- MUST preserve original prompt content (only add research insights)
- MUST use existing schemas from `.allhands/schemas/`
- NEVER modify prompt task scope
- NEVER add tasks or change acceptance criteria
</constraints>

## Context Analysis

Read planning artifacts to understand enhancement targets:
- Read all prompts in the prompts folder
- Read alignment doc for current decisions
- Read spec doc for original intent
- Identify technology domains, components, and patterns mentioned

## Research Spawning

Spawn parallel subtasks for each research area:

### Skill Application

Per **Frontier Models are Capable**, match skills to plan content:
- Run `ah skills list` to discover available skills
- For each domain in the plan, spawn subtask:
  - Read matched skill's SKILL.md
  - Apply skill patterns to relevant prompts
  - Return best practices and gotchas

### Solutions Search

Per **Knowledge Compounding**, check for relevant past solutions:
- Run `ah solutions search "<domain keywords>"` for each technology area
- Run `ah memories search "<domain keywords>"` for relevant learnings and engineer preferences
- For high-scoring matches, extract:
  - Key insights that apply
  - Gotchas to avoid
  - Patterns to follow

### Codebase Patterns

- Spawn subtasks to read `.allhands/flows/shared/CODEBASE_UNDERSTANDING.md`
- Target: existing implementations of similar patterns
- Return: file references and conventions discovered

### External Research (if needed)

For novel technologies or high-risk domains:
- Spawn subtasks to read `.allhands/flows/shared/RESEARCH_GUIDANCE.md`
- Target: best practices, edge cases, performance considerations

## Synthesis

After all research completes:

### Group by Prompt

For each prompt, collect:
- Relevant skill patterns
- Applicable solutions from docs/solutions/
- Codebase pattern references
- External research findings

### Conflict Detection

Identify conflicts between:
- Research findings and current plan
- Different research sources
- Skills and codebase patterns

Flag conflicts for engineer review - do not resolve automatically.

## Enhancement

For each prompt with research findings:

### Add Research Insights Section

Append to prompt body (after existing content):

```markdown
---

## Research Insights

**Skills Applied**: [List of skills that informed this section]

**Best Practices**:
- [Concrete recommendation from research]
- [Pattern to follow]

**Gotchas to Avoid**:
- [Past solution reference: docs/solutions/...] - [Key insight]
- [Potential pitfall from research]

**Codebase References**:
- [path/to/file.ts:42] - [Pattern to follow]

**External References**:
- [URL] - [Key takeaway]
```

### Update Alignment Doc

If research revealed considerations not in current plan:
- Add "Research Insights" section to alignment doc
- Document discovered risks, patterns, or decisions needed
- Flag items requiring engineer input

## Validation

After enhancement:
- Verify original prompt content unchanged
- Verify only additive changes made
- Check for any unresolved conflicts

## Completion

Present summary to engineer:
```
## Plan Deepening Summary

### Prompts Enhanced
- [Prompt X]: [Skills/solutions applied]
- [Prompt Y]: [Skills/solutions applied]

### Key Discoveries
- [Important finding that may affect approach]

### Conflicts Identified
- [Conflict description] -> [Options for resolution]

### Alignment Doc Updates
- [Sections added or updated]
```

Per **Quality Engineering**, engineer decides how to proceed with conflicts.
