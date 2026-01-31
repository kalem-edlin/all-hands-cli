---
name: refactor
type: refactor
planning_depth: focused
jury_required: false
max_tangential_hypotheses: 2
required_ideation_questions:
  - "What's the scope?"
  - "What invariants must be preserved?"
  - "What's the target architecture?"
  - "Incremental or big-bang?"
  - "Any constraints?"
---

## Domain Knowledge

### Invariant Preservation

Refactor specs are defined by what must NOT change alongside what should. Key invariant categories:

| Invariant Type | Examples |
|----------------|----------|
| **API contracts** | Public function signatures, REST endpoints, event schemas |
| **Observable behavior** | Output for given inputs, side effects, error handling |
| **Test coverage** | Existing tests continue to pass without modification |
| **External interfaces** | Database schemas, file formats, wire protocols |

Invariants are the safety rails of a refactor — they define the transformation's constraints and enable confident validation.

### Current-State to Target-Architecture Framing

Every refactor must articulate:
1. **Current state**: What exists now and why it's problematic
2. **Target architecture**: The desired end state — pattern, structure, naming, organization
3. **Transformation path**: How to get from current to target — incremental stages or atomic landing

### Migration Strategy Dimension

The incremental vs big-bang decision shapes the entire plan:

| Strategy | When to Use | Planning Impact |
|----------|-------------|-----------------|
| **Incremental** | Large scope, dependent consumers, high risk | Multiple prompts with intermediate stable states |
| **Big-bang** | Small scope, isolated module, low risk | Fewer prompts, atomic transformation |
| **Feature-flagged** | Parallel old/new paths needed during transition | Additional prompt for flag setup and cleanup |

### Knowledge Gap Detection

| Signal | Action |
|--------|--------|
| "Clean up the code" (no target) | Probe for specific target architecture |
| "Refactor everything" (no scope) | Demand scope boundaries — which modules/files? |
| "It should just work the same" (vague invariants) | Enumerate specific contracts to preserve |
| No mention of tests | Surface test coverage as explicit invariant |

## Ideation Guidance

Per **Ideation First**, the refactor interview captures scope boundaries and invariants so the planner can create safe transformation hypotheses.

### Probe Guidance

- Probe vague scope boundaries — demand specific modules, files, or patterns
- Enumerate invariants explicitly — don't assume the engineer has considered all contract surfaces

### Output Sections

Spec body sections for refactor domain:
- **Motivation**: Why the current structure is problematic
- **Goals**: Target architecture and preserved invariants
- **Non-Goals**: What's explicitly out of scope (unique to refactor)
- **Technical Considerations**: Migration strategy, constraints, coordination needs
- **Open Questions**: Unknowns the planner should investigate

## Planning Considerations

### Feature Flag Consideration

For staged delivery, planning should evaluate whether feature flags are needed:
- Parallel old/new code paths during transition
- Gradual migration of dependent consumers
- Rollback capability for high-risk transformations

### Dependent Consumer Coordination

When refactoring shared code, planning must account for:
- Which consumers depend on the current interface
- Migration order for dependent consumers
- Whether consumers can be updated atomically or need compatibility shims

### Test Coverage Preservation

Planning should verify and maintain test coverage:
- Existing tests pass against both current and target architectures during transition
- New tests cover the target architecture's specific patterns
- Test migration may require its own prompt for large refactors

### Prompt Output Range

Refactor specs produce 2-7 focused prompts. Incremental refactors with many dependent consumers trend toward the higher end.
