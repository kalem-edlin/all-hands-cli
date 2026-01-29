# Emergent Refinement: Phase-Based Architecture with Randomized Domain Selection

## Overview

This proposal introduces a two-phase emergent refinement system with explicit state tracking and optional randomized domain selection for creative work.

## The Problem

Current emergent refinement has several issues:
- Agents stop early after "core consolidation is complete"
- Agents bias toward familiar/safe domains (testing, stability)
- Single flow file tries to cover both consolidation and creative phases
- No explicit state tracking for phase transitions

## Proposed Architecture

### Phase-Based State Machine

```
[spec created] → CORE_CONSOLIDATION → [flag set] → CREATIVE_TANGENTIAL
```

**Alignment schema addition:**
```yaml
consolidation_complete: false  # Set to true by agent when core refinements are solid
```

When `consolidation_complete` is:
- `false` or unset: Agent reads `CORE_CONSOLIDATION_EMERGENT_REFINEMENT.md`
- `true`: Agent reads `CREATIVE_TANGENTIAL_EMERGENT_REFINEMENT.md`

Both phase-specific flows reference shared principles in `EMERGENT_REFINEMENT_EXECUTION.md` to avoid instruction redundancy.

### Progressive Disclosure

```
.allhands/flows/
├── EMERGENT_REFINEMENT_EXECUTION.md          # Shared principles (goal, constraints)
├── shared/
│   ├── CORE_CONSOLIDATION_EMERGENT_REFINEMENT.md      # Phase 1 instructions
│   └── CREATIVE_TANGENTIAL_EMERGENT_REFINEMENT.md     # Phase 2 instructions
```

**Phase 1 (Core Consolidation):**
- Focus: Testing, stability, error handling, edge cases
- Goal: Fully satisfy original spec acceptance criteria
- Exit condition: Agent sets `consolidation_complete: true` when coverage is solid

**Phase 2 (Creative Tangential):**
- Focus: Adjacent improvements, novel experiments, user-delighting extensions
- Goal: Discover valuable work the user didn't explicitly request
- Feature flags required for tangential implementations

## Randomized Domain Selection

### The Bias Problem

LLMs have inherent biases:
- Testing is "safe" and well-understood
- Features feel "valuable"
- Performance work is "impressive"

This leads to clustering on certain domains while others (ux, integration) get neglected.

### The Randomization Solution

Instead of giving agents the full domain list to choose from, **assign one random domain** for creative tangential work:

```markdown
Your assigned domain for this refinement: **${RANDOM_DOMAIN}**

If this domain is genuinely inapplicable to the current codebase state,
document why in your prompt file and select an alternative. But try hard
to find how it applies - the unexpected angles often yield the most value.
```

**Benefits:**
- Forces even distribution across all domains over time
- Eliminates agent bias toward familiar domains
- Creates unexpected combinations that yield novel value
- Agent must think creatively about how domain applies
- Emergent novelty compounds on itself across runs

**Tradeoffs:**
- Random domain might be genuinely inapplicable
- Agent may waste context justifying ill-fitting domain
- Less predictable than agent-choice

### Configuration Options

```json
{
  "emergent": {
    "hypothesisDomains": ["testing", "stability", "performance", "feature", "ux", "integration"],
    "domainSelectionMode": "random"
  }
}
```

**Selection modes:**
- `agent_choice`: Agent picks from full list (current behavior)
- `random`: Single random domain assigned, escape hatch if inapplicable
- `weighted_random`: Inverse frequency weighting (less-used domains get higher probability)

## Implementation Plan

### 1. Alignment Schema Update
Add `consolidation_complete` boolean field to alignment schema.

### 2. Phase-Specific Flow Files
- Create `CORE_CONSOLIDATION_EMERGENT_REFINEMENT.md`
- Create `CREATIVE_TANGENTIAL_EMERGENT_REFINEMENT.md`
- Refactor `EMERGENT_REFINEMENT_EXECUTION.md` to contain only shared principles

### 3. Spawn Logic Update
Update agent spawning to:
1. Check `consolidation_complete` flag in alignment doc
2. Resolve which flow file to disclose
3. If creative phase + random mode: select random domain before spawn
4. Pass resolved domain via `${ASSIGNED_DOMAIN}` template variable

### 4. Settings Schema Update
Add `domainSelectionMode` to emergent configuration schema.

## Open Questions

1. **Escape hatch design**: How strict should the "try hard to apply" instruction be?
2. **Weighted random**: Should we track domain frequency in alignment doc for weighting?
3. **Phase detection**: Should consolidation_complete be set manually or inferred from prompt summaries?
4. **Hybrid modes**: Allow random for some domains, agent-choice for others?

## Philosophy

This architecture balances predictability with emergence:
- **Predictable**: Clear phase transitions, explicit state tracking
- **Emergent**: Randomization forces exploration beyond agent comfort zones

The goal is not to constrain creativity but to **force diversity** that wouldn't occur naturally due to model biases. True emergent refinement should surprise us - and that requires removing the agent's ability to always choose the "safe" option.
