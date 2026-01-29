<goal>
Scope a refactor spec — define scope boundaries and invariants to preserve. Per **Ideation First**, capture what must NOT change alongside what should, so the planner can create safe transformation hypotheses.
</goal>

## Scoping Interview

Ask the engineer via AskUserQuestion (one at a time):

1. **What's the scope?** — Which modules, files, or patterns are being refactored
2. **What invariants must be preserved?** — API contracts, behavior, test coverage, external interfaces
3. **What's the target architecture?** — Desired end state: pattern, structure, naming, organization
4. **Incremental or big-bang?** — Can this be done in stages, or must it land atomically? Feature flag needed?
5. **Any constraints?** — Dependent consumers, deployment windows, parallel work to coordinate with

Per **Frontier Models are Capable**, let the engineer's answers drive depth — probe vague scope boundaries, skip questions they've already answered.

## Spec Creation

- Synthesize answers into spec content:
  - **Motivation**: Why the current structure is problematic
  - **Goals**: Target architecture and preserved invariants
  - **Non-Goals**: What's explicitly out of scope
  - **Technical Considerations**: Migration strategy, constraints, coordination needs
  - **Open Questions**: Unknowns the planner should investigate
- Set `type: refactor` in spec frontmatter
- Follow `.allhands/flows/shared/CREATE_SPEC.md` to write, persist, and optionally enable the spec
