<goal>
Scope a documentation spec — identify coverage gaps and audience. Per **Knowledge Compounding**, documentation compounds value when it targets the right audience with the right depth.
</goal>

## Scoping Interview

Ask the engineer via AskUserQuestion (one at a time):

1. **What areas need documentation?** — Features, APIs, architecture, onboarding, operations
2. **Who is the audience?** — Developers, end users, ops/SRE, new team members
3. **Any existing docs to extend or replace?** — Current state: outdated, missing, scattered, wrong
4. **What format and location?** — README, dedicated docs site, inline code docs, runbooks

Per **Frontier Models are Capable**, let the engineer's answers drive depth — probe vague coverage requests, skip questions they've already answered.

## Spec Creation

- Synthesize answers into spec content:
  - **Motivation**: Why current documentation is insufficient
  - **Goals**: Coverage targets by audience and area
  - **Technical Considerations**: Existing docs state, format preferences, location
  - **Open Questions**: Unknowns the planner should investigate
- Set `type: documentation` in spec frontmatter
- Follow `.allhands/flows/shared/CREATE_SPEC.md` to write, persist, and optionally enable the spec
