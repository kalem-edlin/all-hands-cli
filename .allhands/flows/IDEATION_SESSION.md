<goal>
Capture engineer intent into a **milestone spec** that grounds expectations in codebase reality. Per **Ideation First**, the spec is an intent document, not a requirements doc - it consolidates expectations, desires, and concerns upfront.

Milestone specs are one type of spec in the workflow system - they represent planned features that may build on other milestones. Other spec types (investigation, debug) will use different flows.
</goal>

<constraints>
- MUST ask one question at a time during interview
- MUST ground ideation in codebase reality via parallel exploration tasks
- MUST ask engineer if they want to enable the spec after writing
- NEVER use literal placeholder text in commands
</constraints>

## Pre-flight

Check current git branch. If not on `$BASE_BRANCH`:
- Inform engineer: "You're on branch `{current_branch}`. Roadmap specs should be created on `$BASE_BRANCH` so they're visible to all feature branches."
- Ask: "Switch to `$BASE_BRANCH` before continuing?"
- If yes, run `git checkout $BASE_BRANCH`
- If no, continue but note the spec will only exist on this branch

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

### Core Dimensions

| Dimension | Elicit via | Infer from |
|-----------|------------|------------|
| Goals | "What are you trying to accomplish?" | Problem description |
| Motivations | "Why does this matter?" | Frustrations expressed |
| Concerns | "What worries you about this?" | Caveats/hedging |
| Desires | "What would ideal look like?" | Enthusiasm |
| Capabilities | "What can you handle vs need automated?" | Technical language |
| Expectations | "What would success look like?" | Examples given |

### Category Deep Dives

Work through relevant categories based on milestone scope:

| Category | Key Questions | Knowledge Gap Signals |
|----------|---------------|----------------------|
| **User Experience** | "Walk through: user opens this first time - what happens?" | Describes features instead of journeys |
| **Data & State** | "What needs to be stored? Where does data come from/go?" | Says "just a database" without schema thinking |
| **Technical** | "What systems must this work with? Constraints?" | Picks tech without understanding tradeoffs |
| **Scale** | "How many users/requests? Now vs future?" | Says "millions" without infrastructure thinking |
| **Integrations** | "External services? APIs consumed/created?" | Assumes integrations are simple |
| **Security** | "Who should do what? Sensitive data?" | Says "just basic login" |

### Knowledge Gap Detection

Watch for these signals requiring deeper probing:

| Signal | Action |
|--------|--------|
| "I think..." or "Maybe..." | Probe deeper, offer research |
| "That sounds good" (to your suggestion) | Verify they understand implications |
| "Just simple/basic X" | Challenge - define what simple means |
| Technology buzzwords without context | Ask what they think it does |
| Conflicting requirements | Surface the conflict explicitly and ask for Disposable Variants Approach |


Per **Ideation First**:
- One question at a time - reflect back understanding, probe vague answers
- As often as necessary to keep ideas fresh and potential solutions well grounded in reality, spawn subtask to read `.allhands/flows/shared/RESEARCH_GUIDANCE.md` with specific research goals as new concepts are discussed / uncovered.

- Present feasibility feedback grounded in exploration results
- Synthesize guiding principles from engineer's philosophy - validate with them
- Continue until engineer signals to move to spec writing

## Completeness Check

Before writing spec, verify coverage:

| Area | Verified |
|------|----------|
| Problem statement clear | [ ] |
| Technical constraints understood | [ ] |
| User Expectations deeply understood | [ ] |
| All discernable milestone elements either have a user expectation, or an open question for downstream agents | [ ] |
| No "To Be Discussed" items remaining | [ ] |

If gaps exist, return to Surveying for specific categories.

## Spec Output

- Run `ah schema spec` for spec format
- Write `specs/roadmap/{SPEC_NAME}.spec.md` capturing:
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

## Spec Flow Analysis (Optional if you feel there are still ambiguities in the complexity of this milestone)

After writing the spec, offer flow analysis:

Ask engineer: "Would you like me to analyze this spec for user flow coverage and gaps?"

If yes:
- Read `.allhands/flows/shared/SPEC_FLOW_ANALYSIS.md` and follow instructions
- Returns: identified flows, gaps, clarifying questions
- Engineer chooses which gaps to address before enabling milestone

This is recommended for:
- User-facing features with multiple paths
- Complex integrations with external systems
- Features with unclear scope boundaries

## Closing

After writing the spec:
- Run `ah knowledge roadmap reindex` to update the roadmap knowledge index

Ask the engineer:

> **"Would you like to enable this spec now?"**
>
> This will:
> 1. Initialize `.planning/{spec}/` for work tracking
> 2. Set this spec as active
> 3. Set up a working branch (new or continue existing)
> 4. Allow you to proceed to planning and execution
>
> If no, the spec remains in `specs/roadmap/` for later activation via TUI.

If yes:
- Follow `.allhands/flows/shared/ENABLE_SPEC.md` with `spec_path` set to the newly created spec