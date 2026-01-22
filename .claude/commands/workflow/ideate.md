---
name: ideate
description: User intent capture and spec creation. Transforms user ideas into structured milestones reflecting their expectations/preferences. Outputs to specs/{domain}/ for architect consumption.
argument-hint: [initial idea or question]
---

<objective>
Capture user intent and expectations into a spec that:
- Reflects user's philosophy, preferences, and pre-approved directions
- Grounds expectations in codebase reality and feasibility
- Provides starting points for architect (NOT prescriptions)

**SPEC is a user intent document, NOT a requirements doc.**
- Architect treats spec as reflection of user expectations
- If architect's research finds better approaches, they present findings to user
- Nothing in spec is "final" - it captures where user's head is at

**Output structure:**
- `specs/{domain}/domain.md` - milestone summaries + dependency graph (ideation agent reference only)
- `specs/{domain}/milestone-N-{name}.spec.md` - individual milestone files
</objective>

<ideation_philosophy>
**Ideation is an INTERVIEW/CONVERSATION about user desires.**

This workflow:
1. ELICITS user goals, motivations, concerns, desires, capabilities, expectations through targeted questions
2. INFERS these dimensions from conversation context when not explicitly stated
3. FILTERS user desires into feasible approaches within codebase + roadmap scope
4. REFINES user expectations through back-and-forth clarification

**Purpose of milestones:**
- Prepare/iterate on planning BEFORE solutions architects take control
- Communicate preferences/expectations so architects are loaded with user intent in consumable, consistent way
- Eliminate tedious back-and-forth with planning agents by doing user clarifications upfront
</ideation_philosophy>

<capabilities>
Agent has these capabilities to use at discretion throughout the conversation:

<capability name="codebase_exploration">
**What:** Semantic codebase exploration using knowledge base + LSP. Understand design decisions, find implementation patterns, gather context.

**CRITICAL: Spec precedence rule**
- Milestone specs describe PLANNED capabilities not yet implemented
- Codebase search for unimplemented features returns stale/wrong answers
- ALWAYS read relevant specs FIRST (see milestone_mode flow)
- Only search codebase for things NOT covered by dependency specs
- Spec information OVERRIDES conflicting codebase information

**When useful:**
- After reading specs, to understand EXISTING patterns
- When assessing feasibility of user ideas against current state
- When user asks about existing behavior (not planned behavior)

**Command:**
```bash
envoy knowledge docs search "<complete sentence describing what you need to understand>"
```

**Query guidance:** Use complete sentences with full context, not minimal keywords. RAG performs better with rich semantic content.

**Using results:**
- Aggregated results include `lsp_entry_points` with `why` field guiding investigation priority
- Direct results include `relevant_files` and inline `[ref:path:symbol:hash]` blocks
- Follow symbol references with LSP (hover, incomingCalls, goToDefinition) before full file reads

**LSP operations:**
| Need | Operation |
|------|-----------|
| Find callers | `incomingCalls` |
| Get signature | `hover` |
| Jump to source | `goToDefinition` |
| Find all uses | `findReferences` |

**Motivation:** Ground user desires in codebase reality—but only for things that exist. Planned capabilities come from specs.
</capability>

<capability name="research">
**What:** External research to make the ideation conversation intelligent and informed.

**When to use freely:**
- Answering user questions or concerns requiring up-to-date info
- User asks about feasibility with specific external technologies
- User explicitly requests research or asks to "look something up"
- Gauging ecosystem opinions, tradeoffs, community sentiment
- Any time research would help the conversation flow naturally

**External docs for feasibility context:**
When user asks "can we do X with Y?" - look up external docs to paint a picture of:
- Limitations and gotchas
- Key considerations
- Whether it's straightforward or complex
- NOT implementation patterns (that's architect's job)

**What research should NOT do:**
- Select implementation solutions (architect's job)
- Produce deep implementation guides
- Make technology decisions that belong in Open Questions

**Source preferences (not hard rules):**
- Aggregative sources (comparisons, Reddit, Twitter, HN) are great for gauging sentiment
- Official docs are fine for feasibility/limitation context
- Avoid tutorial-style implementation guides

**User override:** If user explicitly requests research or asks to circumvent these guidelines, comply fully.

**Commands:**
```bash
envoy perplexity research "<query>"
envoy xai search "<query>"
envoy tavily extract "<doc-url>"  # for known doc URLs
```
</capability>

<capability name="interview">
**What:** Elicit and infer user intent dimensions through conversation.

**Dimensions to capture:**
| Dimension | Elicit via | Infer from |
|-----------|------------|------------|
| Goals | "What are you trying to accomplish?" | Problem description |
| Motivations | "Why does this matter?" | Frustrations expressed |
| Concerns | "What worries you about this?" | Caveats/hedging |
| Desires | "What would ideal look like?" | Enthusiasm |
| Capabilities | "What can you handle vs need automated?" | Technical language |
| Expectations | "What would success look like?" | Examples given |

**Techniques:**
- Ask ONE clarifying question at a time
- Reflect back: "So you want X because Y, worried about Z?"
- Probe vague answers: "What do you mean by 'flexible'?"
- Surface constraints: "What would make this NOT work?"

**Motivation:** Agent CANNOT write user preferences without this. The spec captures user intent—must understand it first.
</capability>

<capability name="feasibility_feedback">
**What:** Present user with feedback on their ideas before drafting spec.

**Include:**
- What's easy/hard/impossible given codebase
- High-level approach options (not solutions)
- Where expectations may conflict with reality
- Questions to reveal user preferences

**Example:** "Your idea to do X is feasible but would require Y. Two approaches: A (faster but limited) or B (flexible but complex). Preference, or leave open for architect?"

**Motivation:** User clarifications drive spec content. Feedback loop extracts preferences.
</capability>

<capability name="principle_synthesis">
**What:** Extract guiding principles from user's ideas.

**How:**
- Give each principle a clear name
- Capture the *why* and mental model
- Define decision boundaries (what would VIOLATE this)
- Present to user for validation

**Motivation:** Principles are the HEART of the spec. They guide architect's choices—requirements serve principles, not reverse.
</capability>

<capability name="domain_context">
**What:** Read existing specs to understand cross-milestone context.

**Files:**
- `specs/{domain}/domain.md` - milestone summaries, dependency graph (ideation agents only, architects never see this)
- `specs/{domain}/milestone-N-{name}.spec.md` - specific milestone specs if editing or understanding impacts

**Discovery command:**
```bash
envoy knowledge specs search "<query about dependencies/related capabilities>"
```
Use up to 2 queries to discover specs with overlapping concerns not explicitly referenced. Skip for clearly isolated topics.

**Motivation:** domain.md is the ONLY place cross-milestone relationships live. Understanding existing capabilities helps frame new milestones.
</capability>

<capability name="spec_writing">
**What:** Write milestone spec and update domain.md.

**When ready:**
- User intent is understood
- Feasibility has been discussed
- User has validated key preferences
- Open questions have been identified

**Outputs:** See spec templates below.
</capability>
</capabilities>

<decision_guidance>
**Use discretion. No rigid ordering required.**

<flow name="question_mode">
User asks about codebase without change desire:
1. Explore codebase to answer
2. Provide recommendations grounded in patterns
3. Optionally suggest milestone creation
4. END
</flow>

<flow name="milestone_mode">
User has ideas for codebase changes:

```
START
  │
  ├─ REQUIRED: Read Explicitly Referenced Specs (run FIRST)
  │     ├─ Case A (existing domain): Read domain.md, then read relevant milestone specs
  │     │   to understand what capabilities are PLANNED but not yet implemented
  │     ├─ Case B (new domain): Read any explicitly REFERENCED domain.md files
  │     │   from user's query to understand related planned work
  │     └─ Now you know: what WILL exist (from specs) vs what to SEARCH FOR (in codebase)
  │
  ├─ THEN: Discover Related Specs (up to 2 queries based on complexity)
  │     ├─ Run: envoy knowledge specs search "<query about dependencies/related capabilities>"
  │     ├─ Purpose: Find specs with overlapping concerns not explicitly referenced
  │     ├─ Read discovered specs that seem relevant to current milestone
  │     └─ Skip if topic is clearly isolated with no cross-domain dependencies
  │
  ├─ THEN: Codebase Exploration (informed by spec context)
  │     ├─ envoy knowledge docs search for patterns/state, LSP to investigate returned symbols
  │     └─ Questions scoped to what ACTUALLY exists—specs already cover planned capabilities
  │
  ├─ Clarify: New milestone or editing existing?
  │     ├─ Existing → Also read that specific spec
  │     └─ New → Continue with gathered context
  │
  ├─ Loop: Interview ↔ Feasibility ↔ Research (as conversation requires)
  │     • Gather user preferences
  │     • Present options, capture reactions
  │     • Synthesize principles
  │     • Calibrate expectations
  │
  ├─ When ready: Present spec draft to user
  │     • Iterate until user satisfied
  │
  └─ Write spec files
```

**Why specs before codebase search:**
- Specs describe planned capabilities that may not exist in codebase yet
- Codebase search for unimplemented features returns stale/wrong answers
- Reading specs FIRST lets you distinguish "search for this" vs "assume this from spec"
- Prevents false negatives (feature planned but not implemented) and false positives (old implementation being replaced)

**Key judgment calls:**
- When to research: When user needs options to form preferences
- When to present feasibility: After enough context to give meaningful feedback
- When spec is "ready": User has validated intent, principles clear, open questions identified
</flow>

<anti_patterns>
- Drafting spec without understanding user intent
- Presenting feasibility without codebase grounding
- Running codebase understanding before reading relevant specs (leads to searching for planned capabilities that don't exist yet)
- Skipping spec discovery for complex topics with cross-domain dependencies
- Starting interview without first reading specs + running codebase exploration
- Asking multiple clarifying questions at once
- Writing preferences user hasn't validated
</anti_patterns>
</decision_guidance>

<milestone_rules>
**These rules are firm. Apply regardless of conversation flow.**

<rule name="assumptions_not_references">
Specs reference capabilities with ASSUMPTION language, not cross-milestone references.

**DO:**
- "Assuming scene detection exists (scenes with timestamps available)"
- "If centered caption enforcement exists, use center positioning"

**Assumptions can be:**
- Specific user requirements from previous milestones
- Open-ended user-approved approaches from previous milestones
- Capabilities in current codebase

**DON'T:**
- "As described in Milestone 2..."
- "See milestone-3-scene-detection.spec.md for..."
- "Following the pattern from Phase 1..."

**Why:** Each spec is processed in ISOLATION by architect against ACTUAL CODEBASE. domain.md is ONLY place cross-milestone relationships documented.
</rule>

<rule name="milestones_contain_both">
Milestones contain BOTH capability expectations AND implementation approaches.

**CAPABILITIES (non-implementation):**
- "System must detect scene boundaries with configurable sensitivity"

**APPROACHES (implementation-oriented, user-approved):**
- "User prefers FFmpeg for scene detection but open to alternatives"

**Language guidance:**
| User input | Write as |
|------------|----------|
| Strong preference | "User desires X" / "User expects X" |
| Likes but flexible | "User likes X but open to alternatives" |
| Just an idea | "User proposes X, open-ended for architect" |
| No opinion | Leave in Open Questions section |
</rule>

<rule name="open_questions_are_tasking">
**Open Questions = Open Tasking = Things user wants Architect to decide**

Close yourself:
- Obvious codebase feasibility questions
- Questions answerable from gathered context

Leave open:
- Technology selection requiring deep research
- Tradeoffs needing architect expertise
- Anything user explicitly delegated to architect
</rule>
</milestone_rules>

<domain_md_guidance>
**domain.md is for ideation agents ONLY.**

**Audience:** Ideation agents read domain.md to understand what capabilities exist without reading all milestone specs. Architects NEVER see domain.md—they receive individual milestone specs in isolation.

**Motivations:**
1. Prevent reading every milestone spec to understand what capabilities exist
2. Show dependency graph so new milestones can be positioned correctly

**What to include:**
- Per-milestone summary: Changes/Provides/Requires
- Dependency graph between milestones

**What NOT to include:**
- Shared principles (redundant—principles belong in milestone specs themselves)
- Implementation details

**domain.md is ONLY file that can reference other milestones.**
Milestone specs MUST NOT reference each other—only use assumption language.

**Example structure:**
```markdown
# {Domain Name} - Milestone Graph

> Ideation agent reference. Architects never see this file.

## Milestones
### milestone-1-{name}
**Changes:** [what it modifies]
**Provides:** [capabilities created]
**Requires:** [capabilities assumed]

## Dependency Graph
milestone-1 → milestone-3
milestone-2 → milestone-3
```
</domain_md_guidance>

<milestone_spec_template>
```markdown
# Milestone N: {Name}

## Goal
[1-2 sentences: problem solved, why it matters]

## Assumptions
[Capabilities assumed—NOT references to other specs]
- Assuming [capability] exists ([what's available])
- If [optional capability] exists, [how used]

## What to ELIMINATE
[Only if removing existing functionality]
### [Feature Name]
**Current state:** [what exists]
**Why remove:** [cost/value rationale]
**Files to delete:** [paths]
**DB changes:** [if applicable]

## What to ADD/MODIFY
### [Feature Name]
**Inputs:** [what goes in]
**NOT passed:** [excluded with rationale]
**Outputs:**
| Field | Description |
|-------|-------------|
| `field` | What it represents |
**Post-processing:** [derived operations]

## What to KEEP (unchanged)
| Component | Reason |
|-----------|--------|
| [Name] | [Why unchanged] |

## Guiding Principles
> Milestone-specific principles. Domain-wide in domain.md.
### [Principle Name]
**Philosophy:** [mental model]
**What it means:** [concrete explanation]
**Decision boundary:** [what violates]
**Example:**
- Input: "[example]"
- VIOLATES: `["bad approach"]`
- HONORS: `["good approach"]`

## User Desires and Expectations
**Goals:** [what user wants]
**Concerns:** [what worries them]
**Capabilities:** [what they can/can't do]
**Expectations:** [success criteria]

## User-Approved Approaches (Non-Binding)
| Approach | Preference Level | Context | Open to |
|----------|-----------------|---------|---------|
| [approach] | [Strong/Likes/Curious] | [why liked] | [alternatives] |

## Open Questions / Open Tasking
> Things user wants Architect to decide.
### [Question]
**Option A:** [description]
**Option B:** [description]
**Tradeoffs:**
| Aspect | A | B |
|--------|---|---|
| [criterion] | [value] | [value] |
**User leaning:** [if any]
**For architect:** [what research needed]

## Implementation Constraints
| Constraint | Rationale |
|------------|-----------|
| [constraint] | [why] |

## Summary
| Requirement | Rationale |
|-------------|-----------|
| [what] | [why] |
```
</milestone_spec_template>

<spec_nature>
**SPEC IS:**
- User intent and expectations captured
- User's philosophy and preferences documented
- Codebase-grounded constraints
- Starting points for architect (NOT prescriptions)
- BOTH capabilities AND approaches (if user-approved)

**SPEC IS NOT:**
- Hard requirements
- Technology selections
- Solution prescriptions
- Final word on approach

**Architect relationship:**
- Treats spec as user expectations, not mandates
- Does deeper research, compares alternatives
- Challenges/affirms with evidence
- Presents findings if research contradicts spec
</spec_nature>

<confidence_principles>
Agent provides confident guidance:
- Show thinking, then ask (not just question lists)
- Close obvious questions yourself
- State closed requirements as requirements
- Only leave genuinely complex decisions for architect

Balance: Confident recommendations + acknowledgment of what's genuinely open.
</confidence_principles>

<success_criteria>
- User intent understood (goals, motivations, concerns, desires, capabilities, expectations)
- Related specs discovered (envoy knowledge specs search for cross-domain dependencies)
- Codebase context gathered (knowledge search + LSP, after reading specs)
- Mode detected (question vs milestone; new vs edit)
- Question mode: answered and ended
- Milestone mode: spec written with:
  - Assumptions using assumption language (NOT cross-references)
  - Guiding Principles with decision boundaries
  - User Desires and Expectations populated
  - User-Approved Approaches marked with preference level
  - Open Questions = things user delegated to architect
  - NO schema field names/types (architect derives)
  - Self-contained (no cross-spec references)
- domain.md created/updated with milestone entry
- User validated preferences before spec written
- Spec framed as user intent document
</success_criteria>
