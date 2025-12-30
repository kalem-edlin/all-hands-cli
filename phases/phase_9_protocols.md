# Phase 9: Protocol System

## Objective
Implement the protocol YAML parser with inheritance support and the `envoy protocol` command.

## Scope
- Protocol YAML parser with inheritance (extends, +, dot notation)
- `envoy protocol <name>`
- Protocol files: implementation.yaml, debugging.yaml, discovery.yaml, bug-discovery.yaml

## Implementation Details

### Protocol File Location
Protocol files live in `.claude/protocols/<protocol_name>.yaml`

### Protocol File Schema
```yaml
name: protocol-name
description: Brief description
extends: null  # or base protocol name
inputs:
  - name: param_name
    type: integer | string
    optional: true | false
    description: param description
outputs:
  - value: "{ success: true, ... }"
    description: when this output is returned
steps:
  1: |
    Step content with full context preserved.
    * Sub-bullets supported
    * Commands in backticks
  2+: |  # appends to base step 2
    Additional context appended to base step
  2.1: |  # new step between base 2 and 3
    New step content
```

### Inheritance Rules
Extension protocols can:
- **Replace** a step: declare same step number (e.g., `7:`)
- **Append** to a step: use `+` suffix (e.g., `6+:`)
- **Insert** new steps: use dot notation (e.g., `6.1:`, `6.2:`)

### Command

#### protocol
* Syntax: `envoy protocol <protocol_name>`
* Params:
    * `<protocol_name>`: Name of protocol (implementation, debugging, discovery, bug-discovery)
* Reads the protocol YAML file from `.claude/protocols/<protocol_name>.yaml`
* If protocol has `extends` field, reads and merges with base protocol:
    * Steps with same number **replace** base steps
    * Steps with `+` suffix (e.g., `6+`) **append** to base step
    * Steps with dot notation (e.g., `6.1`, `6.2`) **insert** between base steps
* Outputs sequentially numbered steps to stdout in format:
    ```
    1: <step context>
    2: <step context>
    ...
    ```
* Also outputs inputs/outputs schema for agent reference
* Returns: plain text workflow steps for agent to follow

---

## Protocol Definitions

### implementation.yaml (base)
```yaml
name: implementation
description: Implementation workflow for feature prompts
extends: null
inputs:
  - name: prompt_num
    type: integer
    optional: false
    description: prompt number
  - name: variant
    type: string
    optional: true
    description: variant letter
  - name: feature_branch
    type: string
    optional: false
    description: parent feature branch name
outputs:
  - value: "{ success: true, merged: true }"
    description: implementation merged to feature branch
  - value: "{ success: true, merged: false, reason: \"rejected\" }"
    description: variant was rejected by user
steps:
  1: |
    Call `envoy plan read-prompt <prompt_num> [<variant>]` to get full prompt context
  2: |
    Derive WORKTREE_BRANCH: `<FEATURE_BRANCH>/implementation-<PROMPT_NUM>[-<VARIANT>]`
    * This naming convention signals to git checkout hook to skip plan matter creation
    * All envoy plan commands read from FEATURE_BRANCH's plan directory, not the worktree
  3: |
    Call `envoy plan start-prompt <PROMPT_NUM> [<VARIANT>] --specialist "<AGENT_NAME>" --worktree "<WORKTREE_BRANCH>"`
  4: |
    Check if worktree branch <WORKTREE_BRANCH> (following `*/implementation-*` naming pattern from step 2) already exists
    * If branch does NOT exist: Create worktree with branch: <WORKTREE_BRANCH>
    * If branch EXISTS:
      * Checkout the existing worktree branch
      * Call `envoy git diff-base` to read the git diff of this branch against the base branch (main/master)
      * Review the current implementation shown in the diff to understand what has already been done
      * Continue implementation ONLY if needed (if work is incomplete or needs refinement)
      * Resume workflow from the appropriate step based on current state (e.g., if implementation is complete, proceed to review step)
  5: |
    **Initialize ITERATION = 1, REFINEMENT_REASON = ""**
    * If resuming from existing branch: adjust ITERATION and REFINEMENT_REASON based on current state
  6: |
    Create todo list with TodoWrite for prompt implementation
  7: |
    Implement todo list
  8: |
    **Call `envoy plan record-implementation <PROMPT_NUM> [<VARIANT>] --walkthrough "<STRUCTURED_WALKTHROUGH>" --iteration <ITERATION> [--refinement-reason "<REFINEMENT_REASON>"]`**
    * Generate walkthrough with type = "initial" for ITERATION 1, appropriate refinement type for ITERATION > 1
  9: |
    Call `envoy gemini review <PROMPT_NUM> [<VARIANT>]`
    * Returns: { verdict, thoughts?, answered_questions?, suggested_changes? }
  10: |
    If suggested_changes:
    * **Increment ITERATION, set REFINEMENT_REASON = "Review feedback: {summary of changes}"**
    * Implement adjustments considering `thoughts`, answered_questions, and suggested_changes
    * **Call `envoy plan record-implementation <PROMPT_NUM> [<VARIANT>] --walkthrough "<STRUCTURED_WALKTHROUGH>" --iteration <ITERATION> --refinement-reason "<REFINEMENT_REASON>"`**
    * Generate walkthrough with type = "review-refinement"
  11: |
    Commit (repeat review until verdict = passed)
  12: |
    If requires_manual_testing, call `envoy plan block-prompt-testing-gate <PROMPT_NUM> [<VARIANT>]`
    * Returns: { thoughts, passed, refinements?, logs? }
    * If passed = false:
      * **Increment ITERATION, set REFINEMENT_REASON = "Testing feedback: {summary of refinements}"**
      * **Go to step 7** (re-implement from todo list, generate walkthrough with type = "testing-refinement")
  13: |
    Call `envoy plan block-prompt-variants-gate <PROMPT_NUM> <VARIANT>`
    * Returns immediately if not a variant prompt
    * Returns: { thoughts, variant_solution, reason, unmerged_alternatives?: [branch_names] }
    * **Multi-variant acceptance model:**
      * `main`: This variant is merged to feature branch (exactly ONE per prompt number)
      * `alternative`: Worktree preserved, prompt shows variant_solution="alternative", NOT merged
        * User can manually cherry-pick/feature-flag later
      * `discard`: Archive branch (`git branch -m <b> archive/<b>`), remove worktree
    * If variant_solution = "discard": archive branch, remove worktree, return { merged: false }
    * If variant_solution = "alternative": preserve worktree, update prompt, return { merged: false }
    * If variant_solution = "main": continue to merge
  14: |
    Commit remaining changes, merge worktree to feature branch (MAIN variant only)
    * Resolve conflicts based on commit messages
  15: |
    Call `envoy plan complete-prompt <PROMPT_NUM> [<VARIANT>]`
    * Reports unmerged alternative worktrees in response for user awareness
```

### debugging.yaml (extends implementation)
```yaml
name: debugging
description: Debugging workflow for debug prompts
extends: implementation
inputs: null  # inherits from base
outputs:
  - value: "{ success: true, merged: true }"
    description: fix merged to feature branch
  - value: "{ success: true, merged: false, reason: \"rejected\" }"
    description: variant was rejected by user
steps:
  6+: |
    * Prioritize logging tasks first
  6.1: |
    Implement logging tasks from todo list using **[DEBUG-TEMP] markers**:
    ```
    // [DEBUG-TEMP]
    console.log("debug output");
    console.log("more debug");

    // real code here (blank line above preserves this)
    ```
    * Marker format: `// [DEBUG-TEMP]` (JS/TS) or `# [DEBUG-TEMP]` (Python)
    * All log statements MUST be consecutive lines below marker
    * MUST have blank line before resuming real code
  6.2: |
    Call `envoy plan block-debugging-logging-gate <PROMPT_NUM> [<VARIANT>]`
    * Returns: { thoughts, logs }
  7: |
    Implement fix based on prompt hypothesis, user `thoughts`, and returned logs
  8: |
    **Call `envoy plan record-implementation <PROMPT_NUM> [<VARIANT>] --walkthrough "<STRUCTURED_WALKTHROUGH>" --iteration <ITERATION> [--refinement-reason "<REFINEMENT_REASON>"]`**
    * Generate walkthrough with type = "initial" for ITERATION 1, "testing-refinement" for ITERATION > 1
  12: |
    Call `envoy plan block-prompt-testing-gate <PROMPT_NUM> [<VARIANT>]`
    * Returns: { thoughts, passed, user_required_changes?, logs? }
    * If passed = false:
      * **Increment ITERATION, set REFINEMENT_REASON = "Testing feedback: {summary of user_required_changes}"**
      * **Go to step 10** (re-implement fix with refinement context, generate walkthrough with type = "testing-refinement")
  13: |
    Call `envoy plan block-prompt-variants-gate <PROMPT_NUM> <VARIANT>`
    * Returns immediately if not a variant prompt
    * Returns: { thoughts, variant_solution, reason }
    * **For debug prompts:** `alternative` (non-main) treated as `discard` - only one fix can be main
    * If discard: archive branch, remove worktree
    * If main: continue
  13.1: |
    Call `envoy plan cleanup-debug-logs` to remove all [DEBUG-TEMP] markers
    * Algorithm: find marker → delete marker line → delete all consecutive non-blank lines below → stop at first blank line
    * Deterministic removal, no AI judgment required
  14: |
    Commit remaining changes, merge worktree to feature branch
```

### discovery.yaml (base)
```yaml
name: discovery
description: Discovery workflow for feature requirements
extends: null
inputs:
  - name: agent_name
    type: string
    optional: false
    description: assigned specialist name (e.g., "frontend", "backend_1")
  - name: segment_context
    type: string
    optional: false
    description: segmented requirements from main agent
  - name: approach_references
    type: array
    optional: true
    description: "[{ specialist_name, approach_num }] for re-delegation"
outputs:
  - value: "{ success: true }"
    description: findings written to file via envoy commands
steps:
  1: |
    **Query documentation first**: Call `envoy knowledge search docs "<focused requirement area as descriptive request>"` (semantic search - full phrases, not keywords)
    * May run multiple searches if requirements span distinct focus areas
    * Use returned docs as context for approach building - reference existing patterns rather than reinventing
    * Note any constraints or anti-patterns documented for this area
  2: |
    Read the design manifest for a specific screenshot if needed
  3: |
    If re-delegated with approach references:
    * Call `envoy plan get-finding-approach <specialist_name> <approach_num>` for each
    * Returns approach with `pending_refinement` if user requested changes
    * Address the pending_refinement in updated approach
  4: |
    If available (not research agent) use repomix extraction skill to gather context relevant codebase files over areas of focus to generate approaches
  5: |
    Report key notes for all approaches to be aware of (relevant key technologies, stack, patterns, dependencies, known constraints / caveats, existing APIs etc) in notes
    * Include references to relevant documentation found in step 1
  6: |
    Call `envoy plan write-approach <AGENT_NAME> <approach_num> --description "<desc>" [--variant <LETTER>] --context "<full_context>" --files "<file1>,<file2>" [--questions "<q1>|<q2>"]` for each approach

    **CRITICAL - Approach Variant Rules:**
    * An approach number is EITHER standalone (no variant) OR has variants (A, B, etc) - NEVER both
    * If proposing alternatives for the same approach number, ALL must have variant letters (e.g., 1_A, 1_B)
    * If only one approach for a number, do NOT use --variant flag
    * INVALID: approach 1 + approach 1_A + approach 1_B (mixing standalone with variants)
    * VALID: approach 1 (standalone) or approach 1_A + 1_B (variants only)

    Additional guidelines:
    1. Allowed to propose multiple variants of an approach where necessary / beneficial to user discretion and coverage
    2. When using variants, start with A and increment (A, B, C...)
    3. Include relevant file directories for given approaches (project relative for worktree compatibility)
    4. Include comments highlighting best practices in pseudocode (reference docs if applicable)
    5. Include any clarifying questions per approach
```

### bug-discovery.yaml (extends discovery)
```yaml
name: bug-discovery
description: Discovery workflow for bug investigation
extends: discovery
inputs:
  - name: agent_name
    type: string
    optional: false
    description: assigned specialist name (e.g., "frontend", "backend_1")
  - name: segment_context
    type: string
    optional: false
    description: bug context from main agent (symptoms, reproduction steps, suspected areas)
  - name: approach_references
    type: array
    optional: true
    description: "[{ specialist_name, approach_num }] for re-delegation"
outputs:
  - value: "{ success: true }"
    description: bug hypotheses written to file via envoy commands
steps:
  1: |
    **Query documentation first**: Call `envoy knowledge search docs "<suspected area + symptoms as descriptive phrase>"` (semantic search - full phrases, not keywords)
    * Check for documented anti-patterns that might explain the bug
    * Note any constraints that must be preserved in the fix
  2: |
    Run compiler/linter commands in domain area to identify compilation errors
    * Capture any error output as additional context for approach building
  4+: |
    over suspected bug areas in codebase relevant files
  5: |
    Report key notes for all approaches to be aware of:
    * Best practices to follow for the bug fix (reference docs if applicable)
    * Found constraints and limitations
    * Relevant error messages, stack traces, or symptoms discovered
    * Related dependencies and APIs
  6: |
    Call `envoy plan write-approach <AGENT_NAME> <approach_num> --description "<hypothesis>" [--variant <LETTER>] --context "<full_context>" --files "<file1>,<file2>" [--questions "<q1>|<q2>"]` for each approach

    **CRITICAL - Approach Variant Rules:**
    * An approach number is EITHER standalone (no variant) OR has variants (A, B, etc) - NEVER both
    * If proposing alternative hypotheses for the same approach number, ALL must have variant letters (e.g., 1_A, 1_B)
    * If only one hypothesis for a number, do NOT use --variant flag
    * INVALID: approach 1 + approach 1_A + approach 1_B (mixing standalone with variants)
    * VALID: approach 1 (standalone) or approach 1_A + 1_B (variants only)

    Additional guidelines:
    1. Approach description is a **hypothesis** for a specific fix (can have variants for different fix strategies)
    2. When using variants, start with A and increment (A, B, C...)
    3. Include relevant file directories for given approaches (project relative for worktree compatibility)
    4. FREE TEXT context must include:
        * Problem area analysis
        * Recommended logging statements to add (to capture debug output)
        * Potential fixes to investigate based on hypothesis
    5. Include comments highlighting best practices that should be retained in any fix
    6. Include any clarifying questions after diving into code
```

---

## Additional Commands (Debugging Support)

### cleanup-debug-logs
* Syntax: `envoy plan cleanup-debug-logs`
* **Modifies:** Files in current worktree containing `[DEBUG-TEMP]` markers
* Scans worktree for `[DEBUG-TEMP]` markers and removes them deterministically
* **Algorithm:**
    1. Find marker line: `// [DEBUG-TEMP]` (JS/TS) or `# [DEBUG-TEMP]` (Python/Shell)
    2. Delete marker line
    3. Delete ALL consecutive non-whitespace lines below
    4. Stop at first blank/whitespace-only line
    5. Repeat for all markers in file
* Returns: { success: boolean, files_modified: [paths], markers_removed: number }
* Note: Called in debugging protocol step 13.1 before merge
* Note: Deterministic removal - no AI judgment, just regex + line iteration

---

## Cross-Phase Context

### All Prior Phases
Protocols reference commands from Phases 2-8:
- Phase 2: read-prompt, record-implementation, complete-prompt
- Phase 3: diff-base
- Phase 4: knowledge search
- Phase 5: get-finding-approach, write-approach
- Phase 6: start-prompt, record-implementation, complete-prompt
- Phase 7: block-prompt-testing-gate, block-prompt-variants-gate, block-debugging-logging-gate
- Phase 8: gemini review
- Phase 9: cleanup-debug-logs (new)

### Agent Definitions (Phase 10)
Agents will be instructed to "Run `envoy protocol <name>` and follow the steps" with specific INPUTS.

### /continue Command (Phase 11)
Step 3: Delegate to specialist with protocol:
* If prompt is debug: "Run `envoy protocol debugging` and follow the steps. INPUTS: `{ prompt_num: <N>, variant: <V>, feature_branch: <current_branch> }`"
* Otherwise: "Run `envoy protocol implementation` and follow the steps. INPUTS: `{ prompt_num: <N>, variant: <V>, feature_branch: <current_branch> }`"

### /plan Command (Phase 11)
Step 6.4: For each segment, delegate to appropriate specialist:
* "Run `envoy protocol discovery` and follow the steps. INPUTS: `{ agent_name: <specialist_name>[_N], segment_context: <requirements_for_segment> }`"

---

## Success Criteria
- [ ] `envoy protocol implementation` outputs all steps sequentially
- [ ] `envoy protocol debugging` correctly inherits from implementation
- [ ] Step replacement works (same step number replaces)
- [ ] Step append works (`+` suffix appends to step)
- [ ] Step insertion works (dot notation inserts between steps)
- [ ] Inputs/outputs schema included in output
- [ ] `envoy protocol discovery` works for discovery workflow
- [ ] `envoy protocol bug-discovery` extends discovery correctly
- [ ] `envoy plan cleanup-debug-logs` removes [DEBUG-TEMP] markers correctly
- [ ] Multi-variant acceptance model (main/accepted/rejected) works in variants gate
