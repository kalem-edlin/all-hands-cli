---
name: documentation-taxonomy
description: Reference documentation for the taxonomy-based documentation system. Covers envoy docs commands, segmentation strategies, complexity metrics, and symbol reference format.
---

<objective>
Provide reference documentation for the taxonomy-based documentation system. Used by documentation-taxonomist and documentation-writer agents.
</objective>

<quick_start>
```bash
# Get documentation tree with coverage
envoy docs tree src/ --depth 3

# Get complexity metrics
envoy docs complexity src/lib/

# Format a symbol reference
envoy docs format-reference src/auth.ts validateToken

# Validate all documentation references
envoy docs validate
```
</quick_start>

<command_reference>
## envoy docs tree

Get directory tree with documentation coverage indicators.

```bash
envoy docs tree <path> [--depth <n>]
```

**Arguments:**
- `path`: Directory to analyze
- `--depth`: Max depth to traverse (default: 3)

**Output:**
```json
{
  "path": "src/",
  "tree": [
    {
      "name": "auth",
      "type": "directory",
      "has_docs": true,
      "doc_path": "docs/auth/README.md",
      "children": [...]
    }
  ],
  "coverage": {
    "total": 42,
    "covered": 15,
    "percentage": 36
  }
}
```

## envoy docs complexity

Get complexity metrics for file or directory.

```bash
envoy docs complexity <path>
```

**Output (file):**
```json
{
  "path": "src/auth.ts",
  "type": "file",
  "metrics": {
    "lines": 250,
    "imports": 8,
    "exports": 5,
    "functions": 12,
    "classes": 2
  },
  "estimated_tokens": 2500
}
```

**Output (directory):**
```json
{
  "path": "src/lib/",
  "type": "directory",
  "file_count": 15,
  "metrics": {
    "lines": 3200,
    "imports": 45,
    "exports": 32,
    "functions": 78,
    "classes": 12
  },
  "estimated_tokens": 32000
}
```

## envoy docs format-reference

Format a symbol reference with git blame hash.

```bash
envoy docs format-reference <file> <symbol>
```

**Arguments:**
- `file`: Path to source file
- `symbol`: Symbol name (function, class, variable, type, interface)

**Output:**
```json
{
  "reference": "[ref:src/auth.ts:validateToken:abc1234]",
  "file": "src/auth.ts",
  "symbol": "validateToken",
  "hash": "abc1234",
  "line_range": { "start": 42, "end": 67 },
  "symbol_type": "function"
}
```

**Supported symbol types by language:**
| Language | Symbols |
|----------|---------|
| TypeScript/JavaScript | function, class, variable, type, interface, method, arrowFunction |
| Python | function, class, variable, method |
| Go | function, type, method, variable, const |
| Rust | function, struct, enum, impl, trait, const |
| Java | class, interface, method, field, enum |
| Ruby | function, class, module |
| Swift | function, class, struct, enum, protocol |

## envoy docs validate

Validate all documentation references for staleness/validity.

```bash
envoy docs validate [--path <docs_path>]
```

**Output:**
```json
{
  "message": "Validated 42 references",
  "total_refs": 42,
  "stale_count": 3,
  "invalid_count": 1,
  "stale": [
    {
      "doc_file": "docs/auth/README.md",
      "reference": "[ref:src/auth.ts:validateToken:abc1234]",
      "stored_hash": "abc1234",
      "current_hash": "def5678"
    }
  ],
  "invalid": [
    {
      "doc_file": "docs/api/routes.md",
      "reference": "[ref:src/routes.ts:deletedFunction:xyz789]",
      "reason": "Symbol not found"
    }
  ]
}
```
</command_reference>

<reference_format>
## Symbol Reference Format

References use the format: `[ref:file:symbol:hash]`

**Components:**
- `file`: Relative path from project root
- `symbol`: Symbol name (exact match required)
- `hash`: Short git commit hash (7 chars) from blame

**Regex pattern:** `/\[ref:([^:]+):([^:]+):([a-f0-9]+)\]/g`

**Examples:**
```markdown
The authentication flow starts with [ref:src/auth.ts:validateToken:abc1234].

Configuration is handled by [ref:src/config/index.ts:loadConfig:def5678].
```

**Why this format:**
- Symbol-based: survives line number changes within file
- Hash-tracked: enables staleness detection
- Human-readable: visible in docs, clickable in IDEs
- Parseable: regex-extractable for validation
</reference_format>

<segmentation_strategies>
## Segmentation Principles

**Size targets:**
- 1000-3000 tokens per segment (source code)
- Single segment documentable in one agent pass
- Balance between parallelism and overhead

**Domain grouping:**
```
authentication/     → single segment
api/
  routes/          → segment if > 2000 tokens
  middleware/      → segment if > 2000 tokens
  handlers/        → may need sub-segments
lib/
  utils/           → often single segment
  core/            → often needs splitting
```

**Complexity thresholds:**
| Complexity | Action |
|------------|--------|
| < 500 tokens | Combine with adjacent |
| 500-3000 tokens | Single segment |
| > 3000 tokens | Split by subdirectory |
| > 50 functions | Split by functionality |

**Depth guidance:**
| Depth | When to use |
|-------|-------------|
| overview | Simple utilities, config, low complexity |
| detailed | Core business logic, complex flows |
| comprehensive | Public APIs, libraries, critical paths |
</segmentation_strategies>

<complexity_interpretation>
## Interpreting Complexity Metrics

**Lines of code:**
- < 100: Simple module
- 100-500: Standard module
- 500-1000: Complex module
- > 1000: Consider splitting

**Functions/classes ratio:**
- High functions, few classes: Utility module
- Few functions, many classes: OOP-heavy module
- Balanced: Standard module

**Imports:**
- < 5: Self-contained
- 5-15: Normal coupling
- > 15: Highly coupled, document dependencies

**Exports:**
- 1-5: Focused API surface
- 5-15: Medium API
- > 15: Large API, needs comprehensive docs

**Estimated tokens:**
- Rough guide: lines × 10
- Used for segment sizing
- Not exact, account for variance
</complexity_interpretation>

<parallel_writers>
## Parallel Writer Pattern

Writers work directly on the branch without worktrees. The taxonomist ensures non-overlapping output directories, preventing conflicts.

**Segmentation rule:** Each segment gets a unique `output_path` (e.g., `docs/auth/`, `docs/api/`). Writers only modify files within their assigned output directory.

**Why no worktrees:** Since each writer owns a distinct directory, there are no file conflicts. This simplifies the workflow and avoids worktree management overhead.
</parallel_writers>

<anti_patterns>
- Creating docs without symbol references (no traceability)
- Overlapping segments (causes merge conflicts)
- Segments too large (> 5000 tokens, agent struggles)
- Segments too small (< 500 tokens, overhead)
- Skipping complexity analysis (poor segmentation)
- Not searching existing docs (duplication)
- Ignoring depth guidance (inconsistent detail)
</anti_patterns>

<success_criteria>
- All code snippets have `[ref:...]` format
- Segments are non-overlapping (enables parallel writers without conflicts)
- Complexity informs depth decisions
- Validation passes after commits
</success_criteria>
