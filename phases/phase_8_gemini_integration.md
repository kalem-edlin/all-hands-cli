# Phase 8: Gemini Integration

## Objective
Implement Gemini API integration for plan auditing, code review, and general queries.

## Scope
- `envoy gemini ask`
- `envoy gemini audit`
- `envoy gemini review` (prompt-level and --full)
- Retry behavior with exponential backoff

## Implementation Details

### Configuration
**Model**: Gemini 3 Pro
**API Key**: `process.env.VERTEX_API_KEY`

### Prompt Construction
Each Gemini endpoint constructs a prompt by assembling context sections:

**audit prompt structure:**
```
You are reviewing a development plan for completeness and coherence.

## User Intent
{user_input.md content}

## Plan Overview
{plan.md content}

## Prompts
{all prompt files, numbered}

## Design Assets
{manifest.yaml + screenshot descriptions}

Review for: completeness, dependencies, success criteria clarity, scope creep.
If clarifying questions needed, return them. Otherwise return verdict.
```

**review prompt structure:**
```
You are reviewing implementation against requirements.

## Original Requirements
{prompt description + success_criteria}

## Implementation
{git diff}

## Commit History
{commit messages}

Review for: requirement fulfillment, code quality, missed edge cases.
```

### File Watching (Phase 1)
Uses shared chokidar utility from Phase 1 for blocking on clarifying question files.

### Retry Behavior (all Gemini commands)
* Automatically retry on transient failures (network errors, 5xx, rate limits)
* Max retries: 3
* Backoff: exponential (1s, 2s, 4s)
* Each retry is logged with `level: warn`
* If all retries fail, returns: `{ success: false, error: "gemini_unavailable", retries: 3, fallback_suggestion: "..." }`
* Fallback suggestions by endpoint:
    * `audit`: "Skip audit and proceed with user review only via block-plan-gate"
    * `review`: "Mark prompt as needs_manual_review for user verification"
    * `ask`: "Proceed without Gemini response, use agent judgment"

### Commands

#### ask
* Syntax: `envoy gemini ask <query>`
* Returns: { content: string }

#### audit
* Syntax: `envoy gemini audit`
* **Reads:** `user_input.md` (freetext only), `design/manifest.yaml` (fully YAML), `design/*.png`, `plan.md` (YAML front matter + freetext), `prompts/*.md` (YAML front matter + freetext)
* **May create:** `user_feedback/audit_questions.yaml` (fully YAML)
* **Updates:** `plan.md` (YAML front matter + freetext), `user_input.md` (freetext only)
* Retrieves from plan resources:
    * user_input.md (labeled with original user intent and direction),
    * design/manifest.yaml and all screenshots,
    * plan.md,
    * all prompt files and full context,
* If clarifying questions needed:
    * Creates feedback file with questions
    * Blocks via file watching until `done: true`
    * Appends `thoughts` and Q&A pairs to user_input.md
    * Deletes feedback file
* Write outcome to plan.md file appending to array as a new audit entry
* Returns: { verdict: passed|failed, thoughts?: string, answered_questions?: [{question, answer}], suggested_edits?: [{prompt_id, edit}] }
* Note: Agent should consider `thoughts` (user's additional guidance) when implementing suggested_edits

#### review
* **Reads:** `prompts/*.md` (YAML front matter + freetext), `curator.md` (freetext only), `user_input.md` (freetext only)
* **May create:** `user_feedback/{N}{V}_review_questions.yaml` or `user_feedback/full_review_questions.yaml` (fully YAML)
* **Updates:** `plan.md` or `prompts/{N}.md` (YAML front matter + freetext), `user_input.md` (freetext only)

**Full plan review syntax:** `envoy gemini review --full`
* Takes all prompt file full context, curator.md, user_input.md
* git diff + commit summaries against entire feature branch
* Write outcome to plan.md file appending to array as a new review entry

**Prompt-level review syntax:** `envoy gemini review <prompt_num> [<variant>]`
* Params:
    * `<prompt_num>`: Integer prompt number
    * `<variant>`: Optional variant letter
* Takes current prompt file full context
* git diff + commit summaries against worktree branch
* Write outcome to prompt file appending to array as a new review entry

* If clarifying questions needed:
    * Creates feedback file
    * Blocks via file watching until `done: true`
    * Appends `thoughts` and Q&A pairs to user_input.md
    * Deletes feedback file
* If not --full, sets prompt status = reviewed
* Returns: { verdict: passed|failed, thoughts?: string, answered_questions?: [{question, answer}], suggested_changes?: string }
* Note: Agent should consider `thoughts` (user's additional guidance) when implementing adjustments

---

## Cross-Phase Context

### Blocking Gates (Phase 7)
Gemini audit and review use the same file watching mechanism as Phase 7 gates when they need user answers to clarifying questions.

### Implementation Protocol (Phase 9)
Step 9: Call `envoy gemini review <PROMPT_NUM> [<VARIANT>]`
Step 10: If suggested_changes: implement adjustments and re-record walkthrough

### Planner Workflow (Phase 10)
Step 8: Call `envoy gemini audit`
* If suggested_edits: implement via write-prompt, loop back to step 8
* If verdict = failed: loop back to step 3 to refine prompts

### /continue Command (Phase 11)
Step 6: Call `envoy gemini review --full`
Step 7: If full feature review fails (verdict = failed or suggested_fixes exist), delegate to specialists

### Error Handling (CLAUDE.md Directive)
When any subagent reports an `envoy` command failure:
* IF THE ERROR IS A TIMEOUT, RETURN EXIT WITH TIMEOUT AND WAIT FOR HUMAN INSTRUCTIONS.
* Use AskUserQuestion: "[Tool] failed: [error]. Options: (A) Retry, (B) [use your best inferred alternative], (C) Skip"
* In auto-accept mode: Infer best alternative and proceed

---

## Success Criteria
- [ ] `envoy gemini ask` returns Gemini response
- [ ] `envoy gemini audit` reads all plan context
- [ ] `envoy gemini audit` creates questions file when needed
- [ ] `envoy gemini audit` writes audit entry to plan.md
- [ ] `envoy gemini review` works for single prompt
- [ ] `envoy gemini review --full` works for entire plan
- [ ] `envoy gemini review` writes review entry to appropriate file
- [ ] Retry behavior works with exponential backoff
- [ ] Retries logged at warn level
- [ ] Fallback suggestions returned on complete failure
