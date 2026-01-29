<goal>
Analyze prompt dependencies and ordering for optimal derisking and parallelization. Per **Quality Engineering**, derisk the most critical logic first to reveal feasibility/stability signals as early as possible.
</goal>

<inputs>
- Alignment doc path
- Prompts folder path
</inputs>

<outputs>
- Dependency analysis with parallelization opportunities
- Reordering recommendations for derisking
- Merge/conflict risk identification
</outputs>

<constraints>
- MUST map all prompt dependencies
- MUST identify critical path for derisking
- MUST balance parallelization with merge risk
</constraints>

## Context Gathering

- Read all prompts in the prompts folder
- Extract `dependencies` from each prompt's frontmatter
- Read alignment doc for goal priorities

## Dependency Analysis

Build dependency graph:
- Map which prompts block which others
- Identify prompts that can run in parallel
- Find critical path (longest dependency chain)

## Derisking Analysis

Think like a tech lead engineer:

| Priority | Question |
|----------|----------|
| Feasibility | Which prompts reveal if implementation is even possible? |
| Stability | Which prompts prove core architecture works? |
| Blockers | Which prompts unblock the most other work? |
| Confidence | Which prompts give earliest signal on success? |
| Wiring | Do prompts plan how components connect, not just create artifacts? |

Order prompts to derisk:
- Most important/revealing work first
- Critical feasibility checks before polish
- Foundation before features

## Parallelization Opportunities

For prompts that could run in parallel:
- Assess merge/conflict risks
- Identify setup/teardown dependencies
- Consider file overlap risks

| Risk Level | Criteria |
|------------|----------|
| Safe | No file overlap, independent domains |
| Medium | Shared utilities, coordinated patterns |
| High | Same files, database migrations, state |

## Output Format

Return findings ordered by priority:

```
## Prompts Flow Analysis

### Critical Path
1. Prompt X (blocks Y, Z)
2. Prompt Y (blocks W)
3. ...

### Parallelization Opportunities
- [Prompts A, B, C] can run in parallel (safe)
- [Prompts D, E] can run in parallel (medium risk: shared utils)

### Derisking Recommendations
- P1: Move Prompt X earlier (reveals feasibility of core feature)
- P2: Split Prompt Y into two (unblocks more parallelization)

### Merge Risks
- [Prompts N, M] have conflict risk if parallel (both touch auth)

## Summary
- [Critical path length]
- [Parallelization potential]
- [Reordering recommendations]
```