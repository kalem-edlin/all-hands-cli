<goal>
Exploratory co-creation that surfaces the problem and solution space. Per **Ideation First**, the engineer controls depth and direction. Per **Frontier Models are Capable**, the agent brings its own research, proposals, and critical analysis — not just question-asking. The domain config provides domain-specific substance; this flow provides the generative conversation structure.
</goal>

<constraints>
- MUST read the workflow domain config at `WORKFLOW_DOMAIN_PATH` before any interview
- MUST ask all questions listed in the domain config's `required_ideation_questions`
- MUST ask ONE question at a time
- NEVER batch all questions together
- MUST ground in codebase reality before asking the engineer codebase-answerable questions
- MUST bring its own proposals and alternatives — never be a passive interviewer
- NEVER ask questions answerable from codebase exploration
</constraints>

## Initiation

- Run `ah specs list --domains-only` for roadmap visibility (may return empty)
- If specific spec name not provided:
  - List available domains to the engineer
  - Ask which initiative domain this spec belongs to (can be new)
  - Infer spec name from the engineer's initial ideation prompt
- Ask the engineer for their initial ideation prompt

## Context Gathering

- Read the workflow domain config file at `WORKFLOW_DOMAIN_PATH`
- Ground using `ah knowledge docs search` across ROADMAP then DOCS indexes (in that order)
- Run `ah specs list --roadmap --domain <domain_name>` for domain milestone visibility
- Read dependent milestone specs
- Spawn 1-3 subtasks: tell them to read `.allhands/flows/shared/CODEBASE_UNDERSTANDING.md` to deeply understand codebase reality
- Spawn 0-2 research subtasks: tell them to read `.allhands/flows/shared/RESEARCH_GUIDANCE.md` for high-level tech solution approaches
- Spawn additional research subtasks as new concepts emerge during interview

## Exploratory Interview

The interview has two phases. The boundary between them is organic — divergence naturally gives way to convergence as the solution space clarifies.

### Divergent Phase: Expanding the Solution Space

Open the space. The goal is to understand the problem deeply and surface every viable direction before narrowing.

- Ask all `required_ideation_questions` from the domain config frontmatter, one at a time
- Per **Ideation First**, reflect back understanding before moving on — probe vague responses, skip questions already answered
- Apply the domain config's Domain Knowledge sections as they become relevant:
  - If category deep dives are defined: work through relevant categories based on scope
  - Follow probe guidance for depth calibration
- Spawn research subtasks as new concepts emerge
- **Propose alternative approaches** grounded in codebase understanding and research results — present options the engineer hasn't considered
- **Surface non-obvious considerations** — tradeoffs, limitations, second-order effects, assumptions that might not hold under pressure
- **Challenge assumptions** where codebase evidence or research contradicts them — respectfully, with evidence

### Convergent Phase: Narrowing Toward Intent

Collapse the space. The goal is to synthesize explored directions into a coherent solution intent.

- Synthesize the explored solution space into candidate directions
- Present feasibility feedback grounded in exploration results
- If the domain config includes guiding principles synthesis guidance: synthesize and validate with engineer
- Respect output section structure from the domain config for content synthesis
- Converge on the direction the engineer wants to pursue

## Core Ideation Behaviors

These behaviors apply throughout the entire interview, regardless of domain. Domain configs may layer domain-specific signals on top.

### Knowledge Gap Detection

Watch for these universal signals requiring deeper probing:

| Signal | Action |
|--------|--------|
| Hedging language ("I think...", "Maybe...") | Probe deeper — offer to research |
| Passive agreement ("That sounds good") | Verify they understand implications, not just deferring |
| Oversimplification ("Just simple/basic X") | Challenge — define what simple means concretely |
| Buzzwords without context | Ask what they think it does and why it fits |
| Conflicting requirements | Surface the conflict explicitly — ask which takes priority |

If the domain config defines additional gap detection signals, apply those too.

### Conviction Spectrum

Capture how strongly the engineer feels about each direction. This preserves intent fidelity through downstream flows:

| Engineer Input | Spec Language | Downstream Effect |
|----------------|---------------|-------------------|
| Strong preference | "Engineer desires X" / "Engineer expects X" | Planning respects as constraint |
| Flexible | "Engineer likes X but open to alternatives" | Planning can propose alternatives |
| Just an idea | "Engineer proposes X, open-ended for architect" | Planning researches freely |
| No opinion | Captured in Open Questions | Planning decides |

### Open Questions

Not everything resolves during ideation. Open questions are a first-class output, not a failure of the interview.

- **Close yourself**: Answerable from codebase exploration or gathered context — don't burden the engineer
- **Resolve together**: Tradeoffs where engineer input genuinely matters — present options with evidence
- **Leave open for planning**: Needs deep research, architect expertise, or engineer explicitly delegates
- **Actively offer the choice**: "Do you want to decide this now, or leave it for planning?"

### Roadmap-Aware Assumptions

When the spec depends on functionality from unimplemented roadmap items, use "Assuming X exists..." or "Assuming any of X, Y, Z exist..." to express the dependency. Never cross-reference unimplemented milestone specs directly.

## Transition to Spec Creation

- Propose transitioning when the conversation reaches natural saturation — when new questions yield diminishing insight
- Frame it as a summary: "Here's what's well-understood, here's what's still open — want to explore further or leave the open items for planning?"
- If the domain config defines completeness criteria, use them as internal guidance for what "well-understood" means — but don't present them as a gate
- The engineer decides when to move on

## Spec Creation

- Synthesize answers into spec content using the domain config's output section structure
- Write `initial_workflow_domain: <domain_name>` to spec frontmatter (from the config's `name` field)
- Set `type: <domain_type>` in spec frontmatter (from the config's `type` field)
- Apply "Assuming X exists..." pattern for dependencies on unimplemented roadmap specs
- Follow `.allhands/flows/shared/CREATE_SPEC.md` to write, persist, and optionally enable the spec

### Optional: Spec Flow Analysis

- If the domain config's Ideation Guidance mentions spec flow analysis: offer it for complex features
  - Ask: "Would you like me to analyze this spec for user flow coverage and gaps?"
  - If yes: read `.allhands/flows/shared/SPEC_FLOW_ANALYSIS.md` and follow instructions
