<goal>
Capture engineer intent into a spec that grounds expectations in codebase reality. Per **Ideation First**, the spec is an intent document, not a requirements doc - it consolidates expectations, desires, and concerns upfront.
</goal>

<constraints>
- MUST ask one question at a time during interview
- MUST ground ideation in codebase reality via parallel exploration tasks
- MUST ask engineer if they want to enable the milestone after spec writing
- NEVER use literal placeholder text in commands
</constraints>

## Initiation

- Run `ah specs list --domains-only` to list all domains for roadmap visibility (may return empty)
- If specific milestone name not provided:
  - List available domains to the engineer
  - Ask which initiative domain this milestone belongs to (can be new)
  - Infer milestone spec name from the engineer's initial ideation prompt
- Ask the engineer for their initial ideation prompt

## Grounding

After initial ideation prompt, prepare for interview:
- Run `ah specs list --roadmap --domain <domain_name>` for domain milestone visibility
- Read dependent milestone specs

Spawn parallel exploration subtasks:
- 1-3 Tasks: Read `.allhands/flows/shared/IDEATION_CODEBASE_GROUNDING.md` with verbose search goals for codebase reality (yields hard dependencies)
- 1-2 Tasks: Read `.allhands/flows/shared/RESEARCH_GUIDANCE.md` with search goals for high-level solution approaches

## Surveying

Interview to elicit: goals, motivations, concerns, desires, capabilities, expectations

| Dimension | Elicit via | Infer from |
|-----------|------------|------------|
| Goals | "What are you trying to accomplish?" | Problem description |
| Motivations | "Why does this matter?" | Frustrations expressed |
| Concerns | "What worries you about this?" | Caveats/hedging |
| Desires | "What would ideal look like?" | Enthusiasm |
| Capabilities | "What can you handle vs need automated?" | Technical language |
| Expectations | "What would success look like?" | Examples given |

Per **Ideation First**:
- One question at a time - reflect back understanding, probe vague answers
- If engineer wants to go deep on solutions, read `.allhands/flows/shared/RESEARCH_GUIDANCE.md` and entertain their research needs
- Present feasibility feedback grounded in exploration results
- Synthesize guiding principles from engineer's philosophy - validate with them
- Continue until engineer signals to move to spec writing

## Spec Output

- Run `ah schema spec` for spec format
- Write `specs/roadmap/{MILESTONE_NAME}.spec.md` capturing:
  - Engineer desires and expectations (what, why, success criteria)
  - Assumptions about other milestones (use "Assuming X exists...", not cross-references)
  - Open questions for architect to research/decide
  - Technical considerations grounded in codebase reality
  - Milestone dependencies

### Preference Language

| Engineer input | Write as |
|----------------|----------|
| Strong preference | "Engineer desires X" / "Engineer expects X" |
| Likes but flexible | "Engineer likes X but open to alternatives" |
| Just an idea | "Engineer proposes X, open-ended for architect" |
| No opinion | Leave in Open Questions |

### Open Questions Guidance

- **Close yourself**: Obvious feasibility questions, things answerable from gathered context
- **Leave open**: Technology selection needing deep research, tradeoffs needing architect expertise, anything engineer explicitly delegated

### Building on Unimplemented Milestones

Use "Assuming X exists..." or "Assuming any of X, Y, Z exist..." to express dependencies on milestones that will be implemented by the time this one is.

After writing the spec:
- Run `ah knowledge roadmap reindex` to update the roadmap knowledge index

## Closing

After writing the spec, ask the engineer:

> **"Would you like to enable this milestone now?"**
>
> This will:
> 1. Create a new branch for this milestone
> 2. Initialize the `.planning/{branch}/` directory with status tracking
> 3. Allow you to proceed to planning and execution
>
> If no, the spec remains in `specs/roadmap/` for later activation via TUI.

If yes:
- Run `ah oracle suggest-branch` with spec content for branch name
- Run `git checkout -b <suggested-branch-name>`
- Run `ah planning init` to initialize planning directory
- Notify engineer the milestone is active

The TUI hub monitors branch changes and will detect the new milestone branch.