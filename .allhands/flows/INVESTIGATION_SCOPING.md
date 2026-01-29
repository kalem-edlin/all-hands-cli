<goal>
Scope an investigation spec — capture the problem, evidence, and success criteria for hypothesis-driven diagnosis. Per **Ideation First**, consolidate the problem space upfront so the planner can ground hypotheses in reality.
</goal>

## Scoping Interview

Ask the engineer via AskUserQuestion (one at a time):

1. **What's broken / what's the issue?** — Describe the symptom, not the suspected cause
2. **What evidence do you have?** — Error logs, reproduction steps, affected users, frequency
3. **What does "fixed" look like?** — Success criteria: error gone, metric restored, behavior corrected
4. **Any constraints?** — Can't touch X, must preserve Y, time-sensitive?
5. **Any suspected root causes?** — Optional: engineer hypotheses to seed investigation

Per **Frontier Models are Capable**, let the engineer's answers drive depth — probe vague responses, skip questions they've already answered.

## Spec Creation

- Synthesize answers into spec content:
  - **Motivation**: The problem and its impact
  - **Goals**: Success criteria from "what does fixed look like"
  - **Technical Considerations**: Evidence, constraints, suspected causes
  - **Open Questions**: Unknowns the planner should investigate
- Set `type: investigation` in spec frontmatter
- Follow `.allhands/flows/shared/CREATE_SPEC.md` to write, persist, and optionally enable the spec
