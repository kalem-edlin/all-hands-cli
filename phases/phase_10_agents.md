# Phase 10: Agent Definitions

## Objective
Create agent markdown files that define workflows and capabilities for each agent type.

## Scope
- planner.md (planning-workflow)
- curator.md (curation-workflow, curation-audit-workflow)
- researcher.md
- surveyor.md
- worker.md
- documentor.md (extract-workflow, audit-workflow, coordination-workflow)

## Implementation Details

### Agent File Location
Agent files live in `.claude/agents/<agent_name>.md`

### Agent File Structure
Each agent file should define:
- Agent description and purpose
- Available workflows with INPUTS/OUTPUTS
- Skills the agent has access to (in frontmatter `skills` field)
- Constraints and capabilities

### Agent Workflow Architecture

**Non-Protocol Agents** (workflows ARE primary mode):
- planner, documentor

**Protocol-Compatible Agents**:
- All others (curator, researcher, surveyor, worker, specialists)

**Rules for protocol-compatible agents:**

1. **Core Capabilities** - Document OUTSIDE workflow sections
   - Apply to ALL execution contexts (protocol or internal)

2. **Internal Workflows** - When needed, prefix with:
   > Fallback workflow. Use only when no protocol explicitly requested.
   - REFERENCE capabilities, don't define them
   - Agent auto-selects if no protocol specified

3. **Ad-Hoc Nature** - Fallback workflows are NOT plan-based:
   - Do NOT use envoy plan commands (no write-prompt, get-findings, etc.)
   - Do NOT tie into discovery/implementation protocol system
   - Simply execute direct task → return result to main agent
   - Main agent provides ad-hoc task description, agent returns findings/implementation directly

### Skill Assignments
Skills are declared in agent frontmatter and autoloaded into agent context on spawn:

| Agent | Skills | Purpose |
|-------|--------|---------|
| planner | (none) | Pure planning, no file access needed |
| curator | repomix-extraction, research-tools | Needs codebase access + external research for .claude/ curation |
| researcher | research-tools | External knowledge gathering only |
| surveyor | repomix-extraction | Fallback discovery needs codebase context |
| worker | repomix-extraction | Fallback implementation needs codebase context |
| documentor | repomix-extraction | Documentation extraction needs codebase context |

---

## Agent Definitions

### planner agent
Expert solutions architect responsible for creating and modifying prompts and high-level plan context.

#### Workflow: planning-workflow
**INPUTS** (from main agent delegation):
  * `mode`: "create" | "refine" | "quick"
  * `workflow_type`: "feature" | "debug"
  * `feature_branch`: branch name (for envoy plan commands)
  * `plan_status`: (quick mode only) status from `envoy plan check` - "in_progress" | "completed" | "none"

**OUTPUTS** (to main agent):
  * `{ success: true }` - plan accepted by user gate
  * `{ success: false, reason: string }` - unrecoverable failure

**WORKFLOW STEPS (mode = "quick"):**
  1. If plan_status = "none":
      * Create minimal plan structure via `envoy plan write-plan --title "..." --objective "..." --context "..."`
      * Write single debug prompt via `envoy plan write-prompt 1 --files "..." --debug --criteria "..." --context "..." --requires-testing`
  2. If plan_status = "completed":
      * Retrieve current prompts via `envoy plan get-full-plan`
      * Append debug prompt at end with no dependencies on incomplete tasks
      * Write via `envoy plan write-prompt <next_number> --files "..." --debug --criteria "..." --context "..." --requires-testing`
  3. If plan_status = "in_progress":
      * Retrieve current prompts via `envoy plan get-full-plan`
      * Identify most relevant prompt file based on bug context
      * Append debug prompt that depends only on tasks that are already completed (meaning it will be implemented on NEXT /continue call)
      * Write via `envoy plan write-prompt <next_number> --files "..." --depends-on "<completed_prompts>" --debug --criteria "..." --context "..." --requires-testing`
  4. Call `envoy plan block-plan-gate`
      * Returns: { thoughts, has_refinements, plan_refinements, prompt_refinements }
  5. If has_refinements: apply refinements and loop back to step 4
  6. Return `{ success: true }` to main agent

**WORKFLOW STEPS (mode = "create" | "refine"):**
  1. Retrieve context via `envoy plan get-findings --full` (all approaches, notes, variants)
  2. If mode = "refine": retrieve current prompts via `envoy plan get-full-plan`
  3. Group approaches into prompts:
      * Number each prompt sequentially
      * Ensure approaches that are variants are written to separate prompt files with variant letters
      * Ensure each prompt is 2-3 tasks maximum for minimal implementing agent context
      * Any approach pseudocode must include relevant file references
      * Mark debugging prompts with --debug flag
      * Track dependencies between prompts
      * Infer success criteria from approach context
      * Flag prompts requiring manual testing
  4. If workflow_type = "debug":
      * **CRITICAL**: Include in each debug prompt: recommended logging statements, fix hypothesis, instructions to remove debug logs after fix
      * Mark ALL debug prompts with --debug flag and --requires-testing
      * Create final observability prompt (NOT --debug) that depends on all debug fix prompts
  5. Write prompts via `envoy plan write-prompt <number> [<variant>] --files "..." --depends-on "..." [--debug] --criteria "..." --context "..." [--requires-testing]`
      * If mode = "refine": use `envoy plan clear-prompt` first for prompts being replaced
  6. Write plan via `envoy plan write-plan --title "..." --objective "..." --context "..."`
      * If mode = "refine": edit must account for original context
  7. Call `envoy plan validate-dependencies`
      * If stale_prompt_ids found:
          * Review each stale prompt's dependencies to determine if prompt needs adjustment based on recent changes
          * If only dependency list needs updating: use `envoy plan update-prompt-dependencies` (preserves planned_at)
          * If prompt content/approach needs updating: use `envoy plan write-prompt` (updates planned_at)
          * Loop back to step 7 until all dependencies are valid
  8. Call `envoy gemini audit`
      * If suggested_edits: implement via write-prompt, loop back to step 8
      * If verdict = failed: loop back to step 3 to refine prompts
  9. Call `envoy plan block-plan-gate`
      * Returns: { thoughts, has_refinements, plan_refinements, prompt_refinements }
  10. If has_refinements:
      * Apply plan_refinements via `envoy plan write-plan ...`
      * Apply prompt_refinements via `envoy plan write-prompt ...`
      * Loop back to step 7 (re-validate dependencies and re-audit after refinements)
  11. Return `{ success: true }` to main agent

---

### curator agent
Agent for AI orchestration curation - agents, skills, commands, hooks.

#### Workflow: curation-workflow
**INPUTS** (from main agent delegation):
  * `mode`: "create" | "audit"
  * `artifact_type`: "specialist" | "skill"
  * `initial_context`: user requirements summary

**OUTPUTS** (to main agent):
  * `{ success: true, clarifying_questions?: [string] }` - artifact created, optional questions for user
  * `{ success: false, reason: string }` - unrecoverable failure

**WORKFLOW STEPS:**
  1. Use repomix to discover relevant code for the artifact
  2. Use research tools for best practices not in current codebase
  3. If clarifying questions arise: return them immediately for user input, then resume
  4. Implement the artifact (agent file, skill directory, etc.)
  5. Return `{ success: true }` with any clarifying questions

#### Workflow: curation-audit-workflow
**INPUTS** (from main agent delegation):
  * `mode`: "audit"
  * `branch_name`: branch with changes to audit

**OUTPUTS** (to main agent):
  * `{ success: true, amendments_made: boolean }` - audit complete

**WORKFLOW STEPS:**
  1. Read git diff for the branch
  2. Review changes against AI orchestration best practices
  3. Amend any anti-patterns introduced
  4. Return `{ success: true, amendments_made: boolean }`

---

### researcher agent
Agent with research tools skill for external knowledge gathering. Use when external research is needed (web search, documentation lookup, best practices from outside codebase). Can only handle discovery protocols - not implementation.

---

### surveyor
Generic specialist for discovery when no domain-specific specialist exists. Use as fallback when main agent cannot confidently assign a segment to a specialist. Has repomix extraction skill for codebase analysis.

---

### worker
Generic specialist for implementation when no domain-specific specialist exists. Use as fallback when main agent cannot confidently assign a prompt to a specialist.

---

### documentor
Agent for extracting documentation from implementation walkthroughs.

#### Workflow: extract-workflow (per-prompt documentation)
**INPUTS** (from main agent delegation):
  * `mode`: "extract"
  * `prompt_num`: integer prompt number
  * `variant`: optional variant letter
  * `feature_branch`: branch name

**OUTPUTS** (to main agent):
  * `{ success: true }` - documentation extracted and committed

**WORKFLOW STEPS:**
  1. Retrieve prompt walkthrough via `envoy plan get-prompt-walkthrough <prompt_num> [<variant>]`
      * Returns: description, success_criteria, full walkthrough history, git diff summary
  2. Search existing docs: `envoy knowledge search docs "<prompt topic as descriptive request>"` (semantic search - full phrases, not keywords)
  3. Determine: update existing doc vs create new vs no doc needed
  4. If documentation needed:
      * Write document with inline file path references
      * Include `resource_description` in front-matter
      * Do NOT write `relevant_files` (auto-populated by commit hook)
  5. Commit changes to feature branch
      * Commit hook validates file references and auto-populates `relevant_files`
      * If validation fails (missing file references): investigate and retry
      * If commit conflicts: pull, resolve, retry
  6. Call `envoy plan mark-prompt-extracted <prompt_num> [<variant>]`
  7. Return `{ success: true }`

#### Workflow: audit-workflow (end-of-plan documentation consolidation)
**INPUTS** (from main agent delegation):
  * `mode`: "audit"
  * `feature_branch`: branch name
  * `scope_paths`: optional paths to scope audit (for /audit-docs)
  * `concerns`: optional user concerns to address
  * `user_decisions`: optional decisions from previous findings review

**OUTPUTS** (to main agent):
  * `{ success: true }` - audit complete, changes committed
  * `{ success: true, findings: [...] }` - when findings need user review (for /audit-docs)

**WORKFLOW STEPS:**
  1. Retrieve docs changes via `envoy git diff-base --path docs/` (or scoped paths)
  2. Review all documentation changes for:
      * Redundancies across documents (consolidate where needed)
      * Structural reorganization opportunities
      * Consistency in style and practices
      * Cross-prompt patterns that individual documentors may have missed
      * Human readability and clarity
  3. If findings need user review: return `{ success: true, findings: [...] }`
  4. Make consolidation/reorganization edits as needed (including user_decisions if provided)
  5. Commit changes (commit hook handles validation and reindexing)
      * If validation fails: investigate missing file references and retry
  6. Return `{ success: true }`

#### Workflow: coordination-workflow (for /create-docs planning)
**INPUTS** (from main agent delegation):
  * `mode`: "coordinate"
  * `scope_paths`: paths to document (or empty for whole codebase)

**OUTPUTS** (to main agent):
  * `{ success: true, chunks: [{ paths: [...], scope_description: string }] }`

**WORKFLOW STEPS:**
  1. Analyze codebase structure for documentation needs
  2. Divide into non-overlapping chunks that can be documented in parallel
  3. Ensure no directory writing conflicts between chunks
  4. Return chunk definitions for parallel agent delegation

**SHARED PRACTICES:**
  * **Search-existing-first**: ALWAYS query existing docs before writing
  * **Documentation file structure**:
      * Front-matter: `resource_description` (required - summarizes key decisions, patterns, focus areas)
      * Front-matter: `relevant_files` (auto-populated by commit hook, NOT written by documentor)
      * Body: Full document content with inline file path references to codebase
  * Uses repomix extraction skill to read relevant codebase files
  * Infers documentation structure based on codebase organization (no prescribed layout)

---

### [...custom specialists]
Domain-specific specialists created via `/create-specialist` command. Each specialist has a defined area of expertise (codebase files/areas), specific skills, and domain knowledge. Main agent selects specialist based on task relevance to domain and narrowness of scope coverage.

---

## Cross-Phase Context

### Protocols (Phase 9)
Agents are instructed to "Run `envoy protocol <name>` and follow the steps" with specific INPUTS.

### Slash Commands (Phase 11)
Slash commands delegate to agents with specific workflow and inputs:
* /plan delegates to planner with planning-workflow
* /continue delegates to specialists with implementation/debugging protocols
* /create-specialist and /create-skill delegate to curator

### CLAUDE.md Directives (Phase 12)
* Main agent MUST NOT EDIT files - delegation required
* Main agent should NEVER use skills - skills are for subagents only
* Curator subagent is the ONLY agent that can read and edit .claude files
* Only curator and research agents can do "web search" tool use

---

## Success Criteria
- [ ] planner.md defines planning-workflow with all steps
- [ ] curator.md defines curation-workflow and curation-audit-workflow
- [ ] researcher.md defines research capabilities
- [ ] surveyor.md defines fallback discovery role
- [ ] worker.md defines fallback implementation role
- [ ] documentor.md defines all three workflows
- [ ] All agents have proper INPUTS/OUTPUTS documented
- [ ] Agent files reference correct envoy commands
