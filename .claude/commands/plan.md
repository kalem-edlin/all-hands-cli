---
description: Begin planning workflow for feature or amendment
argument-hint: [user-prompt] [--quick | --create | --refine]
---

<objective>
Orchestrate the full planning workflow: gather requirements, delegate to specialists for discovery, run research, create implementation plan, and hand off to /continue.

Modes:
- `--quick`: No questions, minimal inference, simple plan
- `--create`: New feature planning (default if no existing plan)
- `--refine`: Amend existing plan with new requirements
</objective>

<context>
Plan status: !`envoy plan check`
</context>

<process>
<step name="parse_mode">
Parse $ARGUMENTS for mode flags and user prompt:
- If `--quick` present: quick_mode = true
- If `--create` present: mode = "create"
- If `--refine` present: mode = "refine"
- Everything else = user_prompt
</step>

<step name="quick_mode" condition="quick_mode = true">
**Quick Mode - No questions, minimal delegation**

1. Call `envoy plan check` to get status
2. **If plan exists (in_progress or completed)**:
   - Append user prompt: `envoy plan append-user-input "<user_prompt>"`
   - Delegate to **planner agent**:
     * "Run `envoy plan protocol implementation` and follow the steps. INPUTS: `{ mode: 'quick', workflow_type: 'feature', feature_branch: <current_branch>, plan_status: <status> }`"
   - AskUserQuestion: "Quick plan created. Ready to implement?"
   - If yes: call /continue command
3. **If no plan exists**:
   - Create branch from user prompt context (infer name)
   - Append user prompt: `envoy plan append-user-input "<user_prompt>"`
   - Delegate to **planner agent**:
     * "Run `envoy plan protocol implementation` and follow the steps. INPUTS: `{ mode: 'quick', workflow_type: 'feature', feature_branch: <current_branch> }`"
   - AskUserQuestion: "Quick plan created. Ready to implement?"
   - If yes: call /continue command
4. **Exit** - quick mode complete
</step>

<step name="check_status" condition="quick_mode = false">
Call `envoy plan check` and determine mode:

| Condition | Action |
|-----------|--------|
| No plan, user_input.md has content | Read user_input.md, continue to input_gate |
| No plan, fresh start | Create branch (infer name from prompt), set mode = "create" |
| Plan exists, prompt unrelated | AskUserQuestion: "Existing plan found. Continue with it or start fresh?" |
| Plan exists, prompt related | Set mode = "refine" |

If user chooses "start fresh": create new branch off base, set mode = "create"
</step>

<step name="input_gate">
**Progressive disclosure approach**

1. **Type question** (if not inferred from prompt):
   AskUserQuestion: "What type of change?"
   Options: ["UI/Frontend", "Backend/API", "Full-stack", "Observability/Monitoring", "Developer Experience", "Infrastructure/DevOps", "Other"]

2. **Constraints** (always ask):
   AskUserQuestion: "Any additional constraints? (skip to infer from context)"

3. **Domain-specific questions** (progressive):
   Build questions from Feature Knowledge Bank below. Ask 3 at a time, offer "continue with current context" option.

4. **Design materials** (if UI involved):
   AskUserQuestion: "Include UI screenshots/design material? If yes, add them to filesystem and describe in manifest."
</step>

<step name="write_user_input">
Append all gathered context to user_input.md:
`envoy plan append-user-input "<all_gathered_context>"`
</step>

<step name="specialist_delegation">
1. Extract atomic requirements from user prompt + answers
2. Cluster requirements by primary domain
3. For each cluster, determine specialist:
   - If confidence lacking: AskUserQuestion: "Should I create a new specialist for [domain]? (/create-specialist)"
   - If no specialist and user declines: use "surveyor" agent
4. Delegate to specialists:
   * "Run `envoy plan protocol discovery` and follow the steps. INPUTS: `{ agent_name: '<specialist_name>[_N]', segment_context: '<requirements_for_segment>' }`"
   * Add `_N` suffix if multiple segments for same specialist
   * OUTPUTS: `{ success: true }`
</step>

<step name="get_findings">
Call `envoy plan get-findings` to get list of approaches
</step>

<step name="research_delegation">
For each distinct research objective identified from approaches:
* Delegate to **researcher agent**:
  * "Run `envoy plan protocol discovery` and follow the steps. INPUTS: `{ agent_name: 'researcher[_N]', segment_context: '<research_objectives_with_approach_references>' }`"
  * OUTPUTS: `{ success: true }`
</step>

<step name="findings_gate">
1. Present all clarifying questions from approach documents to user
2. AskUserQuestion: "Want to redirect specialists with specific requirements? (clears all findings)"
   - If yes: clear findings, return to specialist_delegation step
3. Call `envoy plan block-findings-gate`
   - Returns: `{ thoughts, affected_approaches: [{ specialist_name, approach_number }] }`
4. If affected_approaches exist:
   - Re-delegate to affected specialists with thoughts context
   - Rerun findings gate
</step>

<step name="planner_delegation">
Delegate to **planner agent**:
* "Run the planning-workflow. INPUTS: `{ mode: '<create|refine>', workflow_type: 'feature', feature_branch: '<current_branch>' }`"
* OUTPUTS: `{ success: true }`
</step>

<step name="handoff">
Call /continue command
</step>
</process>

<knowledge_bank name="feature_input_gate">
**Generic (all types):**
- Core mission/objective in one sentence
- Success criteria (how do we know it's done?)
- Explicit out-of-scope items
- Acceptable level of jank/tech debt
- Hard constraints (stack, APIs, security, existing patterns)
- Primary users or systems affected
- Key scenarios/user flows (1-3)
- Happy path for each scenario
- Must-do behaviors per scenario
- Forbidden behaviors/invariants
- Key edge cases
- Anticipated follow-up work
- Manual testing approach

**UI/Frontend specific:**
- UX quality bar (scrappy prototype | functional MVP | polished release)
- Target devices/viewports
- Accessibility requirements
- Design references or screenshots available?
- State management approach
- Error/loading state handling

**Backend/API specific:**
- Input/output schemas (examples)
- Performance targets (latency, throughput)
- Data models/entities affected
- Database migrations needed?
- Authentication/authorization requirements
- Rate limiting/quota considerations

**Full-stack specific:**
- All of the above
- API contract between frontend and backend
- Deployment coordination needs

**Observability/Monitoring specific:**
- What signals indicate success/failure?
- Log levels and what to capture
- Metrics to track
- Alerting thresholds
- Dashboard requirements

**DX specific:**
- Who is the developer audience?
- Documentation requirements
- Error message clarity
- Local development impact
- CI/CD pipeline changes

**Infrastructure/DevOps specific:**
- Environments affected (dev, staging, prod)
- Rollback strategy
- Security/compliance requirements
- Scaling considerations
- Cost implications

**Informational context for LLM:**
- Goal is confident delegation to specialists, not exhaustive documentation
- Prioritize questions that would change architectural approach
- Edge case questions can wait until findings gate
- If user's description is detailed, fewer questions needed
- Combine related bullets into single questions
- Skip questions where answer is obvious from codebase
- For --refine mode, only ask about NEW aspects
</knowledge_bank>

<success_criteria>
- Mode correctly determined from arguments and context
- User input gathered via progressive disclosure
- Specialists delegated with focused requirements
- Findings gate reviewed with user
- Plan created via planner delegation
- Control passed to /continue
</success_criteria>

<constraints>
- MUST use AskUserQuestion for all user interactions
- MUST NOT proceed without user confirmation at gates
- MUST append all user context to user_input.md via envoy
- Quick mode MUST skip all questions
- Specialist delegation MUST use discovery protocol
- All delegations MUST follow INPUTS/OUTPUTS format
</constraints>
