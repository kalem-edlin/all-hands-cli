---
description: Continue implementation of current plan prompts
---

<objective>
Loop through plan prompts, delegate to specialists for implementation, extract documentation, and complete when all prompts done. Handles parallel execution for independent prompts and variants.
</objective>

<context>
Plan status: !`envoy plan check`
</context>

<process>
<step name="get_next_prompts">
Call `envoy plan next [-n <count>]`

Returns next available prompts respecting dependencies:
- If count > 1: returns independent prompts that can run in parallel
- Variants of same prompt MUST all be returned together for parallel execution

Each prompt includes:
- prompt_num, variant (if applicable)
- description
- relevant files
- is_debug flag
</step>

<step name="delegate_implementation">
For each prompt from next:

1. **Determine specialist**:
   - If no suitable specialist found:
     * AskUserQuestion: "No specialist for [domain]. Create one? (/create-specialist)"
     * If user declines: use "worker" agent

2. **Delegate based on type**:
   - If prompt is debug type:
     * "Run `envoy plan protocol debugging` and follow the steps. INPUTS: `{ prompt_num: <N>, variant: <V>, feature_branch: <current_branch> }`"
   - Otherwise:
     * "Run `envoy plan protocol implementation` and follow the steps. INPUTS: `{ prompt_num: <N>, variant: <V>, feature_branch: <current_branch> }`"

3. **Parallel execution**: If multiple prompts/variants returned, delegate all in parallel
</step>

<step name="loop">
Repeat steps 1-2 until:
- No more prompts returned from next
- No prompts in_progress status
</step>

<step name="full_review">
Call `envoy gemini review --full`

Returns: `{ verdict, thoughts?, answered_questions?, suggested_fixes? }`

Full review examines:
- All prompts
- curator.md
- user_input.md
- Feature branch git diff
</step>

<step name="handle_review_failure">
If verdict = "failed" OR suggested_fixes exist:

1. Parse suggested_fixes for affected areas
2. Delegate to relevant specialists:
   * Pass `thoughts` and `answered_questions` as context
   * Use implementation protocol
3. Commit changes
4. Rerun full review (repeat until passes)
</step>

<step name="extract_documentation">
After full review passes, delegate to **documentation-taxonomist** agent with adjust mode:

1. Get prompt walkthroughs for rationale context:
   ```bash
   envoy plan get-all-walkthroughs
   ```

2. Delegate to taxonomist with inputs:
   ```yaml
   mode: "adjust"
   use_diff: true
   feature_branch: "<current_branch>"
   walkthroughs: <output from get-all-walkthroughs>
   ```

3. Taxonomist identifies affected domains, delegates to writers (writers do NOT commit)

4. After ALL writers complete, commit documentation changes:
   ```bash
   git add docs/
   git commit -m "docs: update documentation for feature"
   ```

5. Mark prompts documented:
   ```bash
   envoy plan mark-all-documented
   ```
</step>

<step name="mandatory_doc_audit">
Call `/audit-docs` to validate all documentation symbol references.
* Checks for stale (hash changed) and invalid (symbol deleted) references
* If issues found: fix automatically or present to user
* Returns: `{ success: true }`
</step>

<step name="complete_plan">
Call `envoy plan complete`

This:
- Generates summary.md
- Creates PR
- Marks plan as completed
</step>

<step name="handoff">
Call /whats-next command
</step>
</process>

<success_criteria>
- All prompts implemented via specialist delegation
- Variants executed in parallel
- Documentation updated from all changes (once, after review passes)
- Full review passes
- Documentation audit completed
- Plan marked complete with PR created
- Control passed to /whats-next
</success_criteria>

<constraints>
- MUST respect prompt dependencies (use envoy next)
- MUST run all variants in parallel
- MUST extract documentation once after full review passes
- MUST loop until no prompts remain
- MUST pass full review before completing
- MUST run doc audit before completion
- All delegations MUST follow INPUTS/OUTPUTS format
</constraints>
