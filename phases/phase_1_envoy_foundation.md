# Phase 1: Envoy CLI Foundation

## Objective
Build the core TypeScript CLI infrastructure for envoy, including command routing, observability, and helper functions.

## Scope
- Command parser/router
- Observability system (metrics + logs)
- Helper functions (getBaseBranch, getPlanDir)
- Basic plan directory creation

## Implementation Details

### Required .claude/settings.json ENV Variables
```
BASH_MAX_TIMEOUT_MS = 3600000 // larger timeouts for BLOCK envoy commands
N_PARALLEL_WORKERS = 1 // default for `envoy plan next` command
VOY_SEARCH_SIMILARITY_THRESHOLD
VOY_SEARCH_CONTEXT_TOKEN_LIMIT
VOY_SEARCH_FULL_CONTEXT_SIMILARITY_THRESHOLD
BASE_BRANCH = "main"
```

### Plan Directory Structure
```
.claude/plans/ (everything below this is NOT tracked by git)
	[branch-name]/
		plan.md                    # YAML front matter + freetext
		user_input.md              # freetext only (append-only log)
		curator.md                 # freetext only (append-only notes)
		prompts/
			N.md                   # YAML front matter + freetext
			N{_V}.md               # YAML front matter + freetext (variants)
		findings/
			[specialist].yaml      # fully YAML
		design/
			manifest.yaml          # fully YAML
			[any_unique_name].png
		user_feedback/
			(ephemeral .yaml files - created by block commands, deleted after processing)
		summary.md                 # freetext only
```

### Key Helper Functions

#### getBaseBranch
- Returns BASE_BRANCH environment variable if exists
- Else finds the base branch by sequentially checking all known protected branch names

#### getPlanDir
- Gets the plan directory for the current branch
- Returns path: `.claude/plans/{branch-name}/`

### Observability (dual system)

Envoy uses two complementary observability systems. Both files are gitignored.

#### Metrics File (`.claude/metrics.jsonl`)
High-level data points for analytics. Each line is a JSON object with a consistent schema. Used for aggregation and dashboarding.

**Schema**: `{ type: string, timestamp: ISO8601, plan_name?: string, branch?: string, ...data }`

**Events tracked:**
* `plan_created`: { mode, prompt_count, has_variants }
* `plan_completed`: { duration_ms, prompt_count, total_iterations, gemini_calls }
* `prompt_started`: { prompt_num, variant, specialist, is_debug }
* `prompt_completed`: { prompt_num, variant, duration_ms, iterations, review_passes }
* `gate_completed`: { gate_type, duration_ms, user_refinements_count }
* `gemini_call`: { endpoint (audit|review|ask), duration_ms, success, retries, verdict? }
* `discovery_completed`: { specialist, approach_count, variant_count, question_count }
* `documentation_extracted`: { prompt_num, variant, files_affected }

#### Logs File (`.claude/envoy.log`)
Detailed trail of every envoy operation. Use TypeScript logging library (e.g., pino, winston) with structured JSON output. Every command writes a log entry.

**Log entry schema:**
```json
{
  "timestamp": "ISO8601",
  "level": "info|warn|error",
  "command": "plan.start-prompt",
  "plan_name": "feature-auth",
  "branch": "feat/auth-flow",
  "caller": "frontend",
  "args": { "prompt_num": 1, "variant": null },
  "result": "success|error",
  "duration_ms": 150,
  "context": { /* command-specific details */ }
}
```

**Context examples by command type:**
* `plan.start-prompt`: { specialist, worktree_branch, is_resuming }
* `plan.record-implementation`: { iteration, walkthrough_length, has_refinement_reason }
* `plan.block-*-gate`: { questions_asked, refinements_received, user_wait_ms }
* `gemini.audit`: { verdict, suggested_edit_count, clarifying_questions_asked }
* `gemini.review`: { verdict, is_full, suggested_changes_length }
* `knowledge.search`: { query, result_count, tokens_returned }

**Log levels:**
* `info`: Normal operations (command start/complete)
* `warn`: Retries, fallbacks, near-limit conditions
* `error`: Failures, timeouts, validation errors

---

## Cross-Phase Context

### File Watching Infrastructure
All blocking gates use **chokidar** for file watching. This phase establishes the shared file watcher utility consumed by:
- **Phase 7**: All `block-*` commands (findings gate, plan gate, testing gate, variants gate, logging gate)
- **Phase 8**: Gemini audit/review commands when clarifying questions need human answers

```typescript
// Shared utility for blocking gates
import chokidar from 'chokidar';

async function watchForDone(filePath: string): Promise<object> {
  return new Promise((resolve) => {
    const watcher = chokidar.watch(filePath);
    watcher.on('change', () => {
      const content = parseYaml(readFile(filePath));
      if (content.done === true) {
        watcher.close();
        resolve(content);
      }
    });
  });
}
```

### Command Structure
Commands follow pattern: `envoy <domain> <action> [args]`
- `envoy plan <action>`
- `envoy git <action>`
- `envoy gemini <action>`
- `envoy documentation <action>`
- `envoy protocol <name>`

---

## Success Criteria
- [ ] `envoy --help` shows all command groups
- [ ] `envoy --version` works
- [ ] Logging writes to `.claude/envoy.log` with correct schema
- [ ] Metrics append to `.claude/metrics.jsonl`
- [ ] `getBaseBranch()` correctly identifies base branch
- [ ] `getPlanDir()` returns correct path for current branch
- [ ] Plan directory structure created on demand
