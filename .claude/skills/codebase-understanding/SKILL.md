---
name: codebase-understanding
description: Semantic codebase exploration using knowledge base + LSP. Use for context gathering, understanding design decisions, finding implementation patterns. Combines "why" from docs with "where" from code references.
---

<objective>
Enable context-efficient codebase exploration: knowledge search → LSP symbol navigation → targeted reads. Minimize context window consumption while maximizing understanding.
</objective>

<north_star>
**LSP symbols are the primary navigation mechanism.** Knowledge search surfaces relevant docs with file references → LSP explores those symbols → full reads only when necessary.

Flow: User Task → Knowledge Search → LSP on Referenced Symbols → Full Reads if Needed
</north_star>

<input_guidance>
Queries should be **complete sentences** with full context, not minimal keywords. RAG performs better with rich semantic content.

```bash
# GOOD - complete question with context
envoy knowledge search "how does the retry mechanism handle rate limits when calling external APIs"

# BAD - keyword soup
envoy knowledge search "retry rate limit api"
```

For **non trivial discovery needs**, break into multiple parallel searches:
```bash
# Run these as background tasks, aggregate results
envoy knowledge search "what constraints govern external API error handling" &
envoy knowledge search "how do we implement backoff strategies for retries" &
envoy knowledge search "what patterns exist for rate limit detection" &
```

Simple queries don't need splitting—use judgment on complexity.
</input_guidance>

<result_types>
Knowledge search returns one of two formats based on result token count (~3500 token threshold):

### Aggregated Results (Most Common)

When total tokens exceed threshold, an aggregator synthesizes context:

```json
{
  "aggregated": true,
  "insight": "Codebase-grounded answer: what pattern exists, why chosen, how used. References specific files.",
  "lsp_entry_points": [
    { "file": "src/lib/retry.ts", "symbol": "withRetry", "why": "Core retry implementation with backoff" },
    { "file": "src/lib/errors.ts", "symbol": "isRetryable", "why": "Determines which errors trigger retry" }
  ],
  "design_notes": ["Least-privilege tooling: agents receive only tools for their function"]
}
```

**Using aggregated results:**
1. Read `insight` for semantic understanding (the "why")
2. Use `lsp_entry_points` for navigation—pre-identified targets with rationale in `why`
3. `design_notes` capture architectural decisions from docs
4. Only read full files if LSP exploration reveals need

### Direct Results (Below Token Threshold)

When tokens below threshold, returns raw search results:

```json
{
  "aggregated": false,
  "total_tokens": 1200,
  "results": [
    {
      "resource_path": "docs/patterns/error-handling.md",
      "similarity": 0.85,
      "description": "Error handling patterns for external APIs",
      "relevant_files": ["src/lib/retry.ts"],
      "full_resource_context": "---\ndescription: ...\n---\n\n# Full doc with [ref:path:symbol:hash]..."
    }
  ]
}
```

**Using direct results:**
1. `full_resource_context` included when similarity ≥ 0.82
2. Lower similarity entries have only `description`—read `resource_path` if relevant
3. `relevant_files` from frontmatter provide starting points
4. Extract inline refs: `[ref:path:symbol:hash]` → LSP first; `[ref:path::hash]` → direct read OK
</result_types>

<lsp_operations>
Match LSP operation to your information need:

| Need | Operation | When to Use |
|------|-----------|-------------|
| Find callers | `incomingCalls` | Understanding usage patterns |
| Get signature | `hover` | Quick type/doc check before read |
| Jump to source | `goToDefinition` | Navigate to implementation |
| Find all uses | `findReferences` | Impact analysis (heavier than incomingCalls) |
| File structure | `documentSymbol` | Understand file layout before reading |

**Example from aggregated result:**
```bash
# Result gave lsp_entry_point: { file: "retry.ts", symbol: "withRetry", why: "Core retry implementation" }

LSP hover retry.ts:78 → signature: withRetry<T>(fn: () => Promise<T>, opts?: RetryOptions): Promise<T>
LSP incomingCalls retry.ts:78 → 6 callers in gemini.ts, 2 in anthropic.ts

# Only now, if needed:
Read retry.ts lines 78-120 (just the function, not whole file)
```
</lsp_operations>

<workflow>
### 1. Search Knowledge
```bash
envoy knowledge search "<complete sentence describing what you need to understand>"
```

### 2. Process Results

**If aggregated:** Follow `lsp_entry_points` directly—`why` field guides investigation priority.

**If direct:** Use `relevant_files` from frontmatter + extract `[ref:...]` blocks from `full_resource_context`.

### 3. LSP Before Reads

For any file reference with a symbol:
1. `hover` for quick signature check
2. `incomingCalls` or `findReferences` for usage context
3. Read only the relevant lines, not entire files

### 4. Full Reads (Last Resort)

Only read full files when:
- LSP exploration reveals complex implementation needs investigation
- Path-only references (no symbol to LSP into)
- Aggregated result doesn't include LSP entry points
</workflow>

<decision_tree>
```
Need codebase context?
├─ Know exact file/symbol? → LSP directly, skip knowledge search
└─ Conceptual/discovery question? → envoy knowledge search
    ├─ Aggregated result? → Follow lsp_entry_points (why field = priority)
    └─ Direct result? → relevant_files + [ref:...] blocks → LSP on symbols
        └─ Still need more? → envoy knowledge read <resource_path>
```
</decision_tree>

<anti_patterns>
- Keyword queries instead of complete sentences
- Reading files before LSP exploration of symbols
- Skipping knowledge search for codebase exploration
- Ignoring provided `lsp_entry_points` in aggregated results
- Using `findReferences` when `incomingCalls` suffices
</anti_patterns>

<success_criteria>
- Knowledge search invoked with complete sentence queries
- LSP used on symbol references before file reads
- Aggregated result entry points followed directly
- Context window stays minimal through targeted reads
</success_criteria>
