---
description: Complete reference for all envoy CLI commands organized by group. Each command includes syntax, arguments, options, and example responses.
---

# Command Reference

## docs - Documentation Commands

Commands for symbol reference formatting and documentation validation.

### docs format-reference

Format a symbol reference with git blame hash for traceable documentation.

```bash
envoy docs format-reference <file> <symbol>
```

**Arguments:**
- `file` - Path to source file (absolute or relative to project root)
- `symbol` - Symbol name (function, class, variable, etc.)

**Response:**
```json
{
  "status": "success",
  "data": {
    "reference": "[ref:src/auth.ts:validateToken:abc1234]",
    "file": "src/auth.ts",
    "symbol": "validateToken",
    "hash": "abc1234",
    "line_range": { "start": 10, "end": 25 },
    "symbol_type": "function"
  }
}
```

### docs validate

Validate all symbol references in documentation files.

```bash
envoy docs validate [--path <path>]
```

**Options:**
- `--path` - Docs path to validate (default: `docs/`)

**Response:**
```json
{
  "status": "success",
  "data": {
    "message": "Validated 42 references",
    "total_refs": 42,
    "stale_count": 2,
    "invalid_count": 1,
    "stale": [
      {
        "doc_file": "docs/auth.md",
        "reference": "[ref:src/auth.ts:validate:old123]",
        "stored_hash": "old123",
        "current_hash": "new456"
      }
    ],
    "invalid": [
      {
        "doc_file": "docs/api.md",
        "reference": "[ref:src/deleted.ts:foo:abc]",
        "reason": "File not found"
      }
    ]
  }
}
```

### docs complexity

Get complexity metrics for a file or directory.

```bash
envoy docs complexity <path>
```

**Response (file):**
```json
{
  "status": "success",
  "data": {
    "path": "src/auth.ts",
    "type": "file",
    "metrics": {
      "lines": 150,
      "imports": 8,
      "exports": 5,
      "functions": 12,
      "classes": 2
    },
    "estimated_tokens": 1500
  }
}
```

### docs tree

Get tree structure with documentation coverage indicators.

```bash
envoy docs tree <path> [--depth <n>]
```

**Options:**
- `--depth` - Max depth to traverse (default: 3)

---

## git - Git/GitHub Commands

Commands for git operations and GitHub integration.

### git get-base-branch

Returns the base branch name (main/master/develop).

```bash
envoy git get-base-branch
```

### git is-base-branch

Check if currently on the base branch.

```bash
envoy git is-base-branch
```

### git checkout-base

Checkout the base branch.

```bash
envoy git checkout-base
```

### git diff-base

Get git diff against base branch.

```bash
envoy git diff-base [--path <path>] [--summary]
```

**Options:**
- `--path` - Scope diff to specific path
- `--summary` - Return stat summary instead of full diff

### git create-pr

Create a pull request via GitHub CLI.

```bash
envoy git create-pr --title <title> --body <body> [--draft]
```

**Options:**
- `--title` - PR title (required)
- `--body` - PR description (required)
- `--draft` - Create as draft PR

### git cleanup-worktrees

Clean merged/orphaned worktrees.

```bash
envoy git cleanup-worktrees [--dry-run] [--force-orphans]
```

### git merge-worktree

Merge worktree branch into feature branch and record commit hash.

```bash
envoy git merge-worktree <prompt_num> [variant]
```

---

## knowledge - Semantic Search Commands

Commands for semantic search against indexed documentation.

### knowledge search

Search indexed documents using semantic similarity.

```bash
envoy knowledge search <index_name> <query> [--metadata-only]
```

**Arguments:**
- `index_name` - Index to search (`docs` or `curator`)
- `query` - Descriptive phrase (not keywords)

**Options:**
- `--metadata-only` - Return only paths and descriptions (no full content)

**Response:**
```json
{
  "status": "success",
  "data": {
    "query": "how to handle API authentication",
    "index": "docs",
    "results": [
      {
        "resource_path": "docs/auth/README.md",
        "similarity": 0.85,
        "token_count": 450,
        "description": "Authentication system overview",
        "relevant_files": ["src/auth.ts"],
        "full_resource_context": "..."
      }
    ],
    "result_count": 3
  }
}
```

### knowledge reindex-all

Rebuild search index from all documents.

```bash
envoy knowledge reindex-all [--index_name <name>]
```

### knowledge reindex-from-changes

Update index from changed files (for git hooks).

```bash
envoy knowledge reindex-from-changes <index_name> --files <json>
```

**Arguments:**
- `index_name` - Index to update
- `--files` - JSON array of file changes

### knowledge status

Check index status and health.

```bash
envoy knowledge status
```

---

## gemini - Gemini AI Commands

Commands for Gemini AI integration with automatic retry.

### gemini ask

Raw Gemini inference with optional file context.

```bash
envoy gemini ask <query> [--files <files...>] [--context <context>] [--model <model>]
```

### gemini validate

Validate plan against requirements (anti-overengineering).

```bash
envoy gemini validate [--queries <path>] [--context <context>]
```

### gemini architect

Solutions architecture for complex features.

```bash
envoy gemini architect <query> [--files <files...>] [--context <context>]
```

### gemini audit

Audit plan for completeness and coherence.

```bash
envoy gemini audit
```

### gemini review

Review implementation against requirements.

```bash
envoy gemini review [prompt_num] [variant] [--full]
```

---

## plan - Plan Lifecycle Commands

Commands for plan orchestration. See [Plan Lifecycle](./Plan.md) for details.

### Core Commands

| Command | Description |
|---------|-------------|
| `plan init` | Initialize plan directory |
| `plan status` | Get plan status |
| `plan check` | Get status with context |

### Plan File Commands

| Command | Description |
|---------|-------------|
| `plan write-plan` | Create/update plan.md |
| `plan get-full-plan` | Aggregate all plan files |
| `plan append-user-input` | Append to user_input.md |

### Prompt Commands

| Command | Description |
|---------|-------------|
| `plan write-prompt` | Create prompt file |
| `plan read-prompt` | Read prompt file |
| `plan clear-prompt` | Delete prompt file |
| `plan validate-dependencies` | Check dependency staleness |
| `plan update-prompt-dependencies` | Update dependencies |

### Findings Commands

| Command | Description |
|---------|-------------|
| `plan write-finding` | Create findings YAML |
| `plan write-approach` | Add/update approach |
| `plan get-finding-approach` | Get specific approach |
| `plan clear-approach` | Remove approach |
| `plan get-findings` | Get all approaches |
| `plan read-design-manifest` | Read design manifest |

### Lifecycle Commands

| Command | Description |
|---------|-------------|
| `plan next` | Get next available prompts |
| `plan start-prompt` | Start working on prompt |
| `plan record-implementation` | Record walkthrough |
| `plan complete-prompt` | Mark prompt merged |
| `plan get-prompt-walkthrough` | Get walkthrough for docs |
| `plan mark-prompt-extracted` | Mark docs extracted |
| `plan release-all-prompts` | Release all in_progress |
| `plan complete` | Complete plan, create PR |

### Gate Commands

| Command | Description |
|---------|-------------|
| `plan block-findings-gate` | Block for findings review |
| `plan block-plan-gate` | Block for plan review |
| `plan block-prompt-testing-gate` | Block for testing |
| `plan block-prompt-variants-gate` | Block for variant selection |
| `plan block-debugging-logging-gate` | Block for debug logs |

### Protocol Commands

| Command | Description |
|---------|-------------|
| `plan protocol` | Output protocol steps |
| `plan cleanup-debug-logs` | Remove DEBUG-TEMP markers |

---

## External API Commands

### perplexity research

Deep research with citations.

```bash
envoy perplexity research <query> [--grok-challenge]
```

### tavily search

Web search with LLM answer.

```bash
envoy tavily search <query> [--max-results <n>]
```

### tavily extract

Extract full content from URLs.

```bash
envoy tavily extract <urls...>
```

### xai search

Search X for technology opinions.

```bash
envoy xai search <query> [--context <context>] [--results-to-challenge <results>]
```

### repomix estimate

Get token count for paths (budget planning).

```bash
envoy repomix estimate <paths...>
```

### repomix extract

Get combined code content for paths.

```bash
envoy repomix extract <paths...>
```
