# Phase 5: Findings & Approaches

## Objective
Implement commands for managing discovery output - findings files and approaches from specialists.

## Scope
- `envoy plan write-finding`
- `envoy plan write-approach`
- `envoy plan clear-approach`
- `envoy plan get-finding-approach`
- `envoy plan get-findings`
- `envoy plan read-design-manifest`

## Implementation Details

### Findings File Schema

#### findings/{specialist}.yaml (fully YAML)
Specialist discovery notes with structured approaches.
```yaml
# Which specialist created these findings
specialist_name: frontend  # frontend | backend | fullstack

# General notes on key practices, stack, technologies, APIs, dependencies
notes: |
  Free text notes on codebase patterns, conventions, and important context.
  Include stack details, API patterns, security considerations, etc.

# Discovered implementation approaches
approaches:
  - number: 1
    # Brief label of what this approach solves (3 sentences)
    description: ""
    # Is this a variant of another approach?
    is_variant: false
    # Files relevant to this approach
    relevant_files:
      - "src/lib/auth.ts"
    # Questions needing user clarification before proceeding
    required_clarifying_questions:
      - question: ""
    # Pending refinement text (updated via user feedback)
    pending_refinement: ""
    # Detailed approach with pseudo-code and key findings
    # Include file names, embed best practices as comments
    approach_detail: |
      Detailed implementation approach with pseudo-code.

      ```typescript
      // src/lib/auth.ts
      // Best practice: Always validate tokens before processing
      function validateAuth() {
        // implementation details...
      }
      ```
```

### Design Manifest Schema

#### design/manifest.yaml (fully YAML)
Registry of design files and their descriptions.
```yaml
designs:
  - screenshot_file_name: "login-flow-step1.png"
    description: "Initial login screen with email input and SSO options"
  - screenshot_file_name: "login-flow-step2.png"
    description: "Password entry screen after email validation"
  - screenshot_file_name: "dashboard-main.png"
    description: "Main dashboard layout showing user widgets"
```

### Commands

#### write-finding
* Syntax: `envoy plan write-finding <specialist_name> --notes "<notes_context>" --approaches '<JSON_ARRAY>'`
* **Writes:** `findings/{specialist_name}.yaml` (fully YAML)
* Params:
    * `<specialist_name>`: Name of specialist, optionally with suffix (e.g., `frontend`, `backend_1`)
    * `--notes "<notes_context>"`: Key practices, stack, technologies, APIs, dependencies to be aware of
    * `--approaches '<JSON_ARRAY>'`: JSON array format: `[{"number": 1, "description": "...", "is_variant": false, "context": "...", "relevant_files": ["file1.ts"], "questions": ["q1?"]}]`
* Alternative: use `write-approach` separately for each approach if JSON array is unwieldy

#### write-approach
* Syntax: `envoy plan write-approach <specialist_name> <approach_num> --description "<desc>" [--variant] --context "<full_context>" --files "<file1>,<file2>" [--questions "<q1>|<q2>"]`
* **Updates:** `findings/{specialist_name}.yaml` (fully YAML)
* Params:
    * `<specialist_name>`: Name of specialist (e.g., `frontend`, `backend_1`)
    * `<approach_num>`: Integer approach number
    * `--description "<desc>"`: 3 sentence description of what approach solves
    * `--variant`: Flag indicating this is a variant approach (optional)
    * `--context "<full_context>"`: Full approach context with pseudocode and findings
    * `--files "<file1>,<file2>"`: Comma-separated list of relevant file paths (project relative)
    * `--questions "<q1>|<q2>"`: Pipe-separated clarifying questions (optional)
* Overwrites the approach in the findings file
* Clears any `pending_refinement` on that approach (specialist has addressed feedback)
* **Validates exclusivity:** Returns error if standalone/variant conflict detected
  * Adding variant when standalone exists → error (use `clear-approach` first)
  * Adding standalone when variants exist → error (use `clear-approach` first)

#### clear-approach
* Syntax: `envoy plan clear-approach <specialist_name> <approach_num> [<variant>]`
* **Updates:** `findings/{specialist_name}.yaml` (fully YAML)
* Params:
    * `<specialist_name>`: Name of specialist
    * `<approach_num>`: Integer approach number
    * `<variant>`: Optional variant letter (A, B, etc.) - if omitted, clears standalone approach
* Removes the specified approach from the findings file
* Returns: { specialist, cleared, remaining_count }

#### get-finding-approach
* Syntax: `envoy plan get-finding-approach <specialist_name> <approach_num>`
* **Reads:** `findings/{specialist_name}.yaml` (fully YAML)
* Params:
    * `<specialist_name>`: Name of specialist
    * `<approach_num>`: Integer approach number
* Returns: finding approach in full context (includes all variants for that number)
* Includes `pending_refinement` if set by `envoy plan block-findings-gate` (specialist should address this and overwrite approach)

#### get-findings
* Syntax: `envoy plan get-findings [--full]`
* **Reads:** `findings/*.yaml` (fully YAML)
* Params:
    * `--full`: Include full context and notes per specialist (optional)
* Returns all approaches across all specialists [ { approach specialist name, approach number, is_variant, approach description, approach relevant files, full context if --full } ]
* Returns notes for each specialist if --full
* If --full, highlight in context variant approaches if exists

#### read-design-manifest
* Syntax: `envoy plan read-design-manifest`
* **Reads:** `design/manifest.yaml` (fully YAML)
* Returns the design paths w/ descriptions so that the main agent can pass it to specific delegated discovery agents

---

## Cross-Phase Context

### Discovery Protocol (Phase 9)
The discovery protocol uses these commands to write findings:

Step 3: If re-delegated with approach references:
* Call `envoy plan get-finding-approach <specialist_name> <approach_num>` for each
* Returns approach with `pending_refinement` if user requested changes
* Address the pending_refinement in updated approach

Step 5: Report key notes for all approaches to be aware of (relevant key technologies, stack, patterns, dependencies, known constraints / caveats, existing APIs etc) in notes

Step 6: Call `envoy plan write-approach <AGENT_NAME> <approach_num> --description "<desc>" [--variant] --context "<full_context>" --files "<file1>,<file2>" [--questions "<q1>|<q2>"]` for each approach

### Findings Gate (Phase 7)
`envoy plan block-findings-gate` will:
* Read all findings files to build the feedback template
* Write `pending_refinement` to approaches based on user feedback
* Move findings to `findings/_archive/` after plan gate

### Planner Workflow (Phase 10)
Step 1: Retrieve context via `envoy plan get-findings --full` (all approaches, notes, variants)

The planner groups approaches into prompts based on findings content.

### /plan Command (Phase 11)
Step 7: Call `envoy plan get-findings` to get a list of all approaches (to determine research delegation needs)

---

## Success Criteria
- [ ] `envoy plan write-finding` creates valid findings YAML
- [ ] `envoy plan write-approach` updates findings file with new approach
- [ ] `envoy plan write-approach` clears pending_refinement when overwriting
- [ ] `envoy plan get-finding-approach` returns full approach context
- [ ] `envoy plan get-finding-approach` includes pending_refinement if set
- [ ] `envoy plan get-findings` returns all approaches across specialists
- [ ] `envoy plan get-findings --full` includes notes and full context
- [ ] `envoy plan read-design-manifest` returns design file list
- [ ] Variant approaches correctly marked with is_variant flag
