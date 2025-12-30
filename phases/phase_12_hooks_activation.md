# Phase 12: Hooks & Activation (FINAL)

## Objective
Implement hooks that enforce the orchestration system and enable full workflow automation. This phase "flips the switch" - all prior work runs manually until this completes.

## Scope
- claude-hooks (enforce_planning, startup scans, etc.)
- git-hooks (checkout, commit with reindex)
- CLAUDE.md directives update
- Settings.json env variables

## Implementation Details

### Claude Hooks

#### startup
* scan_agents (validate each agent file for correct front matter and references to existing skills)
* scan_skills (validate skills have required files etc for each directory)
* scan_commands (validate front matter)
* Release all prompt files in_progress status in current directory by using `envoy plan release-all-prompts`
* Run `envoy git cleanup-worktrees` to remove stale worktrees
* Run envoy to setup indexes
* Log active plan status + directory and remind main agent that it is the main agent

---

### Git Hooks

#### On Checkout
* Run `envoy documentation reindex-all` to reindex all indexes
* Delete plan file matter for any now deleted branches
* For a newly checked out branch, skip plan matter creation if branch matches any of:
    * Protected branches: main, master, develop, dev, development, stage, staging, prod, production
    * Prefix patterns: quick/, docs/, curator/
    * **Worktree implementation branches**: */implementation-* (e.g., `feature-auth/implementation-1-A`)
        * These are temporary worktrees that derive their workflow from the parent feature branch's plan directory
        * Any accidentally created plan matter is harmless (deleted with worktree) but skipping avoids unnecessary I/O
* Otherwise, creates the directories and certain files required for the plan matter in the branch if not exists
* Note: "direct mode" replaced with "on protected branch mode" for clarity

#### On Commit
* Call `envoy documentation reindex-from-changes --files <files>` using all changed files from the commit
* The envoy command will intelligently allocate file changes to specific index changes based on declaration of files / directories per managed index

---

### CLAUDE.md Updates

The existing CLAUDE.md already contains base orchestration rules. Phase 12 adds/modifies the following sections:

#### Existing Base (preserve these)
```markdown
## Core Rule
**MANDATORY DELEGATION**: Main agent MUST NEVER READ/FIND/EDIT FILES (or use skills)...
**CURATOR SUB-AGENT SCOPE**: ANY task involving `.claude/`...

## Main Agent: Delegation First
- Main agent should NEVER use skills...
- Exception: protected branches (main, master, develop, dev, staging, stage, prod, production, quick/*, curator/*)

## General Rules
- Never leave comments that mark an update...
- When deleting files/functions, use Grep...

## Human Checkpoints
- Creating/modifying agents, skills, hooks → delegate to curator
- External API calls, architectural decisions

## CLAUDE.md Maintenance
This file MUST only be edited via curator agent.

## Research Policy
- Web search: Only curator/researcher agents
- URL extraction: All agents can use `envoy tavily extract`
- GitHub content: Use `gh` CLI

## Context Budget (50% Rule)
Claude quality degrades at ~50% context usage...

## Project-Specific Instructions
@CLAUDE.project.md
```

#### Additions/Modifications for Orchestration

**Add to Main Agent Rules:**
* Choosing specialists (when conflicting): (1) task relevance to domain, (2) narrowness of scope coverage given relevant files vs specialist's domain_files

**Extend Context Budget section:**
* **Self-estimation required**: Agents estimate context consumption throughout execution
    * Before large reads: estimate tokens (1 token ≈ 4 chars)
    * At ~50% capacity: return early with partial results, request re-delegation
    * Discovery agents: return findings in batches
    * Implementation agents: commit incrementally

**Replace "claude-envoy errors" section with:**
```markdown
## Envoy Error Handling

Envoy commands fail in two ways:
1. **stderr/non-zero exit**: Command crashed
2. **{ success: false, error: "...", ... }**: Command ran but operation failed

On failure, agent should infer recovery based on workflow context:
- **Timeout errors**: Return exit, wait for human instructions
- **Recoverable errors**: Re-delegate, retry with different params, or skip non-critical step
- **Ambiguous situations**: Use AskUserQuestion with options

Agents are smart enough to determine appropriate recovery without prescriptive rules.
```

**Add new section:**
```markdown
## Documentation-First Implementation

Before implementation tasks, call `envoy knowledge search docs "<task focus as descriptive request>"` (semantic search - use full phrases, not keywords) to find existing patterns. Applies even when planning workflow is bypassed.
```

---

### Settings.json ENV Variables

```json
{
  "env": {
    "BASH_MAX_TIMEOUT_MS": "3600000",
    "N_PARALLEL_WORKERS": "1",
    "VOY_SEARCH_SIMILARITY_THRESHOLD": "0.7",
    "VOY_SEARCH_CONTEXT_TOKEN_LIMIT": "50000",
    "VOY_SEARCH_FULL_CONTEXT_SIMILARITY_THRESHOLD": "0.85",
    "BASE_BRANCH": "main"
  }
}
```

---

## Cross-Phase Context

### All Prior Phases
This phase activates and enforces all the work from Phases 1-11:
- Phase 1: Envoy CLI infrastructure
- Phase 2: Plan file I/O
- Phase 3: Git integration
- Phase 4: Documentation/Voy indexing
- Phase 5: Findings & approaches
- Phase 6: Prompt lifecycle
- Phase 7: Blocking gates
- Phase 8: Gemini integration
- Phase 9: Protocols
- Phase 10: Agent definitions
- Phase 11: Slash commands

### Curator Updates Required
Update `.claude/agents/curator.md` with hook enforcement patterns when implementing.

### Key Principle
**Workflows live and die on success_criteria and must be heavily documented for ALL AI Orchestration rule FILES (skills, protocols, commands, agent declarations etc)**

### Capabilities Over Roles
Instead of a long list of named specialists, define capabilities (e.g., frontend_ui, backend_api, data_model, observability, infra) and have the main agent route based on capabilities. You can still keep human-friendly names, but the routing logic uses capabilities.

**Implementation Note**: The implementing agent should determine how to communicate capabilities and domain_files in a format compatible with Claude Code's agent detection system. The key information to convey per specialist:
- **Capabilities**: What the specialist can do (e.g., frontend_ui, react_components, api_design)
- **Domain files**: Which codebase paths this specialist owns (e.g., `src/components/**`, `src/api/**`)

Main agent routing logic:
1. Extract required capabilities from task requirements
2. Score specialists by: (matching_capabilities / total_required) * (1 / domain_file_breadth)
3. Select highest-scoring specialist, or fallback to surveyor/worker if no match

---

## Success Criteria
- [ ] Startup hook validates all .claude/ artifacts
- [ ] Startup hook releases stale in_progress prompts
- [ ] Startup hook cleans up orphaned worktrees
- [ ] Git checkout hook creates plan directories for new branches
- [ ] Git checkout hook skips protected/special branches
- [ ] Git commit hook triggers documentation reindexing
- [ ] CLAUDE.md base rules preserved
- [ ] CLAUDE.md extended with orchestration additions (specialist routing, self-estimation, error handling, docs-first)
- [ ] Settings.json has all required ENV variables
- [ ] Specialist capabilities routing implemented
- [ ] Full orchestration workflow runs end-to-end
