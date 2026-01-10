---
description: Debug workflow for bug investigation and fix
argument-hint: [bug-description] [--quick | --create | --refine]
---

<objective>
Orchestrate the debugging workflow: gather bug context, delegate to specialists for investigation, create fix plan with observability, and hand off to /continue.

Modes:
- `--quick`: No questions, no observability prompt, direct to planner
- `--create`: New debugging session (default if no existing plan)
- `--refine`: Add bug fix to existing plan
</objective>

<context>
Plan status: !`envoy plan check`
</context>

<process>
<step name="parse_mode">
Parse $ARGUMENTS for mode flags and bug description:
- If `--quick` present: quick_mode = true
- If `--create` present: mode = "create"
- If `--refine` present: mode = "refine"
- Everything else = bug_description
</step>

<step name="quick_mode" condition="quick_mode = true">
**Quick Mode - No questions, no observability**

1. Call `envoy plan check` to get status
2. If no plan: Create branch from bug description (infer name)
3. Append bug description: `envoy plan append-user-input "<bug_description>"`
4. Delegate to **planner agent**:
   * "Run the planning-workflow. INPUTS: `{ mode: 'quick', workflow_type: 'debug', feature_branch: <current_branch>, plan_status: <status> }`"
   * OUTPUTS: `{ success: true }`
5. Call /continue command
6. **Exit** - quick mode complete
</step>

<step name="check_status" condition="quick_mode = false">
Call `envoy plan check` and determine mode:

| Condition | Action |
|-----------|--------|
| No plan, user_input.md has content | Read user_input.md, continue to input_gate |
| No plan, fresh start | Create branch (infer name from bug), set mode = "create" |
| Plan exists, bug unrelated | AskUserQuestion: "Existing plan found. Continue with it or start fresh?" |
| Plan exists, bug likely from current work | Set mode = "refine" |

If user chooses "start fresh": create new branch off base, set mode = "create"
</step>

<step name="input_gate">
**Progressive disclosure for debugging**

1. **Observability** (always ask - critical for debug):
   AskUserQuestion: "How should we monitor for this bug recurring once fixed?"
   Options: ["Add logging", "Add metrics/alerts", "Add test coverage only", "Skip observability"]

2. **Error details** (if not in description):
   AskUserQuestion: "Can you share the exact error message and steps to reproduce?"

3. **Timeline** (if not clear):
   AskUserQuestion: "When did this start? (recent deploy, always, after specific change)"

4. **Suspected area** (if not inferred):
   AskUserQuestion: "Any suspected code area or recent changes?"

5. **Severity**:
   AskUserQuestion: "What's the severity?"
   Options: ["Blocks release", "Can workaround", "Nice to fix"]

6. **Domain-specific questions** (progressive):
   Build questions from Debugging Knowledge Bank below. Ask 3 at a time, offer "continue with current context" option.
</step>

<step name="write_user_input">
Append all gathered context to user_input.md:
`envoy plan append-user-input "<all_gathered_context>"`
</step>

<step name="specialist_delegation">
1. Extract bug symptoms, suspected areas, reproduction context
2. Cluster by primary domain
3. For each cluster, determine specialist:
   - If confidence lacking: AskUserQuestion: "Should I create a new specialist for [domain]? (/create-specialist)"
   - If no specialist and user declines: use "surveyor" agent
4. Delegate to specialists:
   * "Run `envoy plan protocol bug-discovery` and follow the steps. INPUTS: `{ agent_name: '<specialist_name>[_N]', segment_context: '<bug_context_for_segment>' }`"
   * Add `_N` suffix if multiple segments for same specialist
   * OUTPUTS: `{ success: true }`
</step>

<step name="get_findings">
Call `envoy plan get-findings` to get bug hypotheses/approaches
</step>

<step name="research_delegation">
For each research objective (known library issues, similar errors, anti-patterns):
* Delegate to **researcher agent**:
  * "Run `envoy plan protocol bug-discovery` and follow the steps. INPUTS: `{ agent_name: 'researcher[_N]', segment_context: '<research_objectives_with_approach_references>' }`"
  * OUTPUTS: `{ success: true }`
</step>

<step name="findings_gate">
1. Present all clarifying questions from approach documents (bug hypotheses) to user
2. AskUserQuestion: "Want to redirect investigation with specific requirements? (clears all findings)"
   - If yes: clear findings, return to specialist_delegation step
3. Call `envoy plan block-findings-gate`
   - Returns: `{ thoughts, affected_approaches: [{ specialist_name, approach_number }] }`
4. If affected_approaches exist:
   - Re-delegate to affected specialists with thoughts context
   - Rerun findings gate
</step>

<step name="planner_delegation">
Delegate to **planner agent**:
* "Run the planning-workflow. INPUTS: `{ mode: '<create|refine>', workflow_type: 'debug', feature_branch: '<current_branch>' }`"
* OUTPUTS: `{ success: true }`

Note: Planner creates debug prompts (use debugging protocol) and observability prompt (use implementation protocol) based on input_gate answers.
</step>

<step name="handoff">
Call /continue command
</step>
</process>

<knowledge_bank name="debugging_input_gate">
**Bug characterization:**
- Exact observed behavior (error messages, incorrect output, crash)
- Expected behavior
- Reproduction steps (numbered)
- Frequency (always, sometimes, specific conditions)
- When it started (recent deploy, always, after specific change)
- Environment details (device, browser, OS, app version, user type)

**Investigation context:**
- Any logs, errors, or stack traces already captured
- Suspected area of code (if any)
- Recent changes to related areas
- Related features that DO work correctly
- Data conditions that trigger it (specific user, specific input)

**Constraints:**
- Severity/urgency (blocks release, can workaround, nice to fix)
- Areas of code that CANNOT be changed
- Deadline pressure (quick patch vs proper fix)

**Observability planning:**
- How should we monitor for this bug recurring?
- What signals would indicate the fix worked?
- Any existing monitoring that should have caught this?

**Informational context for LLM:**
- Reproduction steps are critical - push for specifics
- "When did it start" often reveals the cause
- Stack traces/error messages are gold - ask if user has them
- Frequency hints at race conditions vs logic errors
- If user has a hypothesis, capture it even if uncertain
- For --refine, only ask about NEW information
- Combine related bullets into single questions
</knowledge_bank>

<success_criteria>
- Mode correctly determined from arguments and context
- Bug context gathered via progressive disclosure
- Observability approach determined (except in quick mode)
- Specialists delegated with bug-discovery protocol
- Findings gate reviewed with user
- Debug plan created with fix + observability prompts
- Control passed to /continue
</success_criteria>

<constraints>
- MUST ask observability question (except quick mode)
- MUST use bug-discovery protocol for specialists
- MUST NOT proceed without user confirmation at gates
- MUST append all user context to user_input.md via envoy
- Quick mode MUST skip all questions and observability
- All delegations MUST follow INPUTS/OUTPUTS format
</constraints>
