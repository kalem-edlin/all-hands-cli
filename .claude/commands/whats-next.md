---
description: Suggest next steps after plan completion based on implemented work
---

<objective>
Analyze completed plan and generate contextual next-step suggestions. Uses plan context (user_input.md, summary.md, plan.md) to suggest relevant follow-up work.
</objective>

<context>
Plan status: !`.claude/envoy/envoy plan check`
</context>

<process>
<step name="check_status">
Parse plan check result:

| Status | Action |
|--------|--------|
| in_progress | Tell user: "Plan has incomplete prompts. Run /continue or /plan --refine" and exit |
| completed | Continue to get_context step |
| no_plan | Generate generic suggestions (skip get_context) |
</step>

<step name="get_context">
Call `.claude/envoy/envoy plan get-full-plan`

Parse returned context:
- user_input.md: original requirements, anticipated follow-ups, out-of-scope items
- summary.md: what was implemented, key decisions
- plan.md: prompts that were executed
</step>

<step name="generate_suggestions">
Using the Suggestion Domains below and parsed context, generate **3-5 concrete suggestions**.

**Priority order:**
1. Explicitly mentioned follow-ups from user_input.md
2. Natural extensions of what was built
3. Quality/hardening improvements
4. New capabilities enabled by implementation

**Format each suggestion as actionable:**
- Good: "Add unit tests for the auth service refresh token logic"
- Bad: "Maybe add some tests"
</step>

<step name="present_suggestions">
Output suggestions with routing guidance:

"Based on the completed work, here are suggested next steps:

1. [Suggestion 1]
2. [Suggestion 2]
3. [Suggestion 3]
...

**Ready to continue?**
- `/plan [suggestion]` - Start planning one of these
- `/plan [your own idea]` - Plan something else
- `/plan --refine` - Add to current plan instead of starting fresh
- `/debug [issue]` - If you found a bug to fix first"
</step>
</process>

<knowledge_bank name="suggestion_domains">
**Directly Mentioned:**
- Anything in "Anticipated follow-ups" from user_input.md
- Items explicitly marked "out of scope for this iteration"
- Technical debt the user said was acceptable for now

**Natural Extensions:**
- Additional user flows that build on implemented features
- Edge cases that weren't covered but now matter
- Performance optimizations for implemented features
- Mobile/responsive versions if only desktop was built
- API extensions if backend was built
- Admin/management UI if user-facing was built

**Quality and Hardening:**
- Test coverage for implemented features
- Error handling improvements
- Accessibility enhancements
- Documentation (README, API docs, inline comments)
- Logging/monitoring for new features
- Security hardening (input validation, auth edge cases)

**Developer Experience:**
- Local development improvements
- CI/CD enhancements
- Developer documentation
- Code cleanup/refactoring opportunities identified during implementation

**New Capabilities:**
- Features that are now possible because of what was built
- Integrations with other systems
- Analytics/reporting on new functionality
- User feedback mechanisms

**Observability and Operations:**
- Dashboards for new features
- Alerting for failure modes
- Performance baselines
- Usage tracking
</knowledge_bank>

<success_criteria>
- Plan status correctly determined
- Context parsed from plan files
- 3-5 contextual suggestions generated
- Suggestions prioritized by relevance
- Clear routing guidance provided
</success_criteria>

<constraints>
- MUST check plan status first
- MUST read plan context before generating suggestions
- Suggestions MUST be specific to implemented work (not generic)
- MUST provide routing guidance for each action type
</constraints>
