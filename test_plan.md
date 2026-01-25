# All-Hands Harness E2E Test Plan

## Pre-Setup: Manual Directory Creation

Since bash commands aren't working in this session, create the test repo manually:

```bash
# Create test repo outside all-hands
cd /Users/kalemedlin/Developer/Agentic
mkdir ah-harness-test-repo
cd ah-harness-test-repo
git init

# Initialize allhands into the test repo
cd /Users/kalemedlin/Developer/Agentic/all-hands
node bin/sync-cli.js init /Users/kalemedlin/Developer/Agentic/ah-harness-test-repo

# Create GitHub repo (private for PR testing)
cd /Users/kalemedlin/Developer/Agentic/ah-harness-test-repo
gh repo create ah-harness-test-repo --private --source=. --push

# Verify installation
./bin/ah --help
```

---

## Test Project Overview

**Project Name**: TaskFlow - A simple task management system

**Constraints for Agents** (given during ideation):
- Must use Python for backend (exercises Python skill detection)
- Must use TypeScript for frontend (exercises TypeScript skill detection)
- Must have E2E tests (exercises validation tooling flow)

**Why These Constraints**: Forces multi-domain coverage without prescribing HOW to implement. Agents decide architecture, frameworks, structure.

---

## Milestone 1: Core API + Basic Frontend

### Goal
Build the foundational task API and a minimal frontend that displays tasks. This milestone exercises:
- Ideation session flow
- Skill extraction (Python, TypeScript patterns)
- Deep planning with architecture decisions
- Multiple prompts with dependencies
- Validation tooling creation (Playwright MCP)
- Research tools (external tech guidance)
- Codebase search capabilities
- Knowledge indexing

### Spec to Create: `specs/taskflow-mvp.spec.md`

```markdown
---
name: taskflow-mvp
domain_name: api
status: in_progress
dependencies: []
---

# TaskFlow MVP

## Acceptance Criteria
1. Create, read, update, delete tasks via API
2. Task has: title, description, status (todo/in_progress/done)
3. Web UI displays tasks and allows status changes
4. E2E tests validate the full flow

## Constraints
- Backend must be Python
- Frontend must be TypeScript
- Must have automated E2E tests
```

**Note**: Spec only defines WHAT, not HOW. Agents decide frameworks, structure, patterns.

### What to Observe During Ideation

The ideation agent should:
- Identify need for both Python and TypeScript skills
- Break work into logical prompts with dependencies
- Determine architecture (framework choices, project structure)
- Identify validation needs (triggering CREATE_VALIDATION_TOOLING.md)

**Do NOT prescribe prompts** - observe what the agent generates and verify it makes sense.

### What Gets Tested

| Harness Feature | How It's Exercised |
|-----------------|-------------------|
| Ideation Session | Initial brainstorming for MVP approach |
| Skill Extraction | Detects Python + TypeScript patterns |
| Deep Planning | Architecture decisions (FastAPI vs Flask, component structure) |
| Knowledge Search | `ah knowledge search "task api"` |
| Solutions Search | `ah solutions search "fastapi crud"` |
| Validation Tooling | Creates Playwright suite for E2E tests |
| Research Tools | `ah perplexity research "FastAPI best practices 2024"` |
| Prompt Dependencies | Prompt 04 depends on 01, 02, 03 |
| Schema Validation | Validates prompt/spec frontmatter |
| Hook System | Edit-inject, diagnostics, schema hooks fire |
| Trace Store | All events recorded for analysis |

---

## Milestone 2: Knowledge Compounding + Refinement

### Goal
This milestone explicitly tests knowledge compounding by:
1. Building on Milestone 1's documented decisions
2. Accessing solutions created in M1
3. Using memories established in M1
4. Validating spec cleanup and reindexing
5. Creating emergent refinement prompts based on M1 learnings

### Spec to Create: `specs/taskflow-enhanced.spec.md`

```markdown
---
name: taskflow-enhanced
domain_name: api
status: in_progress
dependencies:
  - taskflow-mvp
---

# TaskFlow Enhanced

## Acceptance Criteria
1. Filter tasks by status
2. Task priority field (high/medium/low)
3. Due date with sorting
4. Dashboard shows task counts by status

## Constraints
- Must build on MVP implementation
- Must maintain existing E2E test coverage
```

**Note**: Dependency on `taskflow-mvp` tests spec dependency resolution and knowledge compounding.

### What Gets Tested

| Harness Feature | How It's Exercised |
|-----------------|-------------------|
| Knowledge Compounding | Accesses M1 documentation, solutions, memories |
| Solutions Reuse | `ah solutions search` finds M1 patterns |
| Memory Recall | Checks `.allhands/memories.md` for M1 decisions |
| Spec Dependencies | Enhanced spec depends on MVP spec |
| Emergent Refinement | Agent identifies gaps and creates refinement prompts |
| Prompt Justification | Reviews M1 prompts for learnings |
| Spec Cleanup | Moves completed MVP spec to roadmap |
| Knowledge Reindex | `ah knowledge reindex` after M1 completion |
| PR Review | Creates PR for M2 changes, reviews via judge flow |
| Jury Reviews | Architecture, Best Practices, YAGNI reviews |
| Documentation Flow | Generates/updates documentation |
| Coordination | Multi-agent coordination if needed |

---

## E2E Test Execution Checklist

### Phase 1: Setup & Initialization

- [ ] **1.1** Create test repo directory (empty, just git init)
- [ ] **1.2** Run `sync-cli.js init` to install harness
- [ ] **1.3** Create GitHub private repo
- [ ] **1.4** Verify `./bin/ah --help` works
- [ ] **1.5** Create only the spec file (acceptance criteria)
- [ ] **1.6** Commit initial setup: `git add . && git commit -m "Initial harness setup"`

**Note**: No source files yet - agents create everything during prompt execution.

### Phase 2: Milestone 1 Ideation

- [ ] **2.1** Create spec file `specs/taskflow-mvp.spec.md`
- [ ] **2.2** Start ideation session:
  ```bash
  # In test repo, start Claude Code
  claude
  # Then run ideation for milestone 1
  ```
- [ ] **2.3** Follow IDEATION_SESSION.md flow
- [ ] **2.4** Verify prompts are generated in `.planning/{branch}/prompts/`
- [ ] **2.5** Check trace store: `./bin/ah trace list`

### Phase 3: Prompt Execution

- [ ] **3.1** Execute each prompt in order using executor agent
- [ ] **3.2** Monitor hooks firing via trace: `./bin/ah trace tail`
- [ ] **3.3** Verify validation hooks (schema, diagnostics) run on edits
- [ ] **3.4** Check knowledge gets indexed: `./bin/ah knowledge status`

### Phase 4: Validation Tooling (CREATE_VALIDATION_TOOLING.md)

This phase explicitly exercises `.allhands/flows/shared/CREATE_VALIDATION_TOOLING.md`:

- [ ] **4.1** When executing prompt 05 (E2E tests), agent detects need for validation tooling
- [ ] **4.2** Agent runs `ah validation-tools list` - finds no Playwright suite
- [ ] **4.3** Agent spawns sub-agent with `CREATE_VALIDATION_TOOLING.md` flow
- [ ] **4.4** Sub-agent executes Phase 1 (Discovery): checks existing coverage
- [ ] **4.5** Sub-agent executes Phase 2 (Research):
  - Runs `ah perplexity research "best practices for testing React with Playwright"`
  - Runs `ah tavily search "Playwright testing tools CLI"`
  - Runs `ah tools --list` for MCP gap assessment
  - If Playwright MCP missing, spawns `HARNESS_MCP.md` sub-agent (non-blocking)
- [ ] **4.6** Sub-agent executes Phase 3 (Engineer Interview): presents findings, gets confirmation
- [ ] **4.7** Sub-agent executes Phase 4 (Suite Creation):
  - Runs `ah schema validation-suite` for structure
  - Creates `.allhands/validation/playwright-e2e.md`
- [ ] **4.8** Verify suite passes schema validation hook on save
- [ ] **4.9** Verify suite discoverable via `ah validation-tools list`
- [ ] **4.10** Use Playwright MCP via `ah tools playwright` to run tests
- [ ] **4.11** Record MCP session behavior in trace store

### Phase 5: Milestone 1 Completion

- [ ] **5.1** Complete all prompts
- [ ] **5.2** Run compounding flow: `ah docs` for documentation
- [ ] **5.3** Verify solutions are indexed: `ah solutions list`
- [ ] **5.4** Mark spec complete: `ah specs complete taskflow-mvp`
- [ ] **5.5** Commit M1: `git add . && git commit -m "Complete Milestone 1: MVP"`

### Phase 6: Milestone 2 - Compounding Test

- [ ] **6.1** Create enhanced spec `specs/taskflow-enhanced.spec.md`
- [ ] **6.2** Start ideation session for M2
- [ ] **6.3** **KEY TEST**: Verify ideation accesses M1 knowledge:
  - Solutions from M1 should appear in suggestions
  - Memories from M1 should influence decisions
  - M1 documentation should be referenced
- [ ] **6.4** Generate M2 prompts
- [ ] **6.5** Execute prompts, watching for compounding behavior

### Phase 7: PR Review Flow

- [ ] **7.1** Create feature branch: `git checkout -b feature/m2-enhancements`
- [ ] **7.2** Complete M2 prompts
- [ ] **7.3** Push and create PR: `gh pr create`
- [ ] **7.4** Run PR review flow via `pr-reviewer` agent
- [ ] **7.5** Verify jury reviews execute (architecture, best practices, YAGNI)
- [ ] **7.6** Check review output in trace store

### Phase 8: Observability Validation

- [ ] **8.1** Query trace store: `./bin/ah trace list --agent-type executor`
- [ ] **8.2** Check error events: `./bin/ah trace errors`
- [ ] **8.3** View stats: `./bin/ah trace stats`
- [ ] **8.4** Verify JSONL backup exists in `.allhands/harness/.cache/trace/`
- [ ] **8.5** Query specific events by type, time range

---

## Observability Queries to Run

After running the test, use these queries to validate tracing:

```bash
# List all events
./bin/ah trace list

# Filter by agent type
./bin/ah trace list --agent-type executor

# Show only errors
./bin/ah trace errors

# Stats summary
./bin/ah trace stats

# Tail live events
./bin/ah trace tail

# Filter by event type
./bin/ah trace list --event-type tool.post

# Time range query (last hour)
./bin/ah trace list --since "1 hour ago"
```

---

## What to Report Back

After running through the milestones, provide:

1. **Trace Store Contents**
   - Output of `./bin/ah trace stats`
   - Any errors from `./bin/ah trace errors`
   - Count of events by type

2. **Hook Behavior**
   - Which hooks fired during execution
   - Any hook errors or unexpected behavior
   - Context injection observations

3. **Knowledge System**
   - Output of `./bin/ah knowledge status`
   - Results of `./bin/ah solutions list`
   - Any indexing issues

4. **MCP Sessions**
   - Output of `./bin/ah tools sessions`
   - Playwright MCP behavior
   - Any MCP errors

5. **Prompt/Spec Validation**
   - Any schema validation errors
   - Frontmatter parsing issues
   - Dependency resolution behavior

6. **Compounding Observations** (Milestone 2)
   - Did M1 solutions appear in M2 ideation?
   - Were memories accessible?
   - Did spec dependencies work correctly?

---

## Debugging Workflow

If issues occur:

1. **Check trace store first**: `./bin/ah trace errors`
2. **Inspect specific event**: `./bin/ah trace list --event-type <type>`
3. **Verify file validation**: `./bin/ah validate <file>`
4. **Check knowledge index**: `./bin/ah knowledge status`
5. **Restart MCP sessions**: `./bin/ah tools restart`

Report findings with:
- Event IDs from trace store
- File paths and line numbers
- Command output
- Expected vs actual behavior

---

## Success Criteria

The harness E2E test is successful when:

- [ ] All prompts in both milestones complete without error
- [ ] Trace store captures all agent events
- [ ] Hooks fire appropriately on tool use
- [ ] Schema validation catches malformed files
- [ ] Knowledge compounds from M1 to M2
- [ ] PR review flow executes correctly
- [ ] Validation tooling (Playwright MCP) works
- [ ] No orphaned MCP sessions
- [ ] All jury reviews produce meaningful output
- [ ] Documentation is generated for completed specs
