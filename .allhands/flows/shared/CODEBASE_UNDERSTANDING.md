<goal>
Enable context-efficient codebase exploration using intentional tooling. Per **Context is Precious**, minimize context window consumption while maximizing understanding.
</goal>

<constraints>
- MUST use `ah knowledge search` before grep for discovery questions
- MUST use complete sentences for knowledge search queries (RAG performs better with semantic content)
- NEVER read full files unless LSP/search exploration proves insufficient
</constraints>

## Search Tool Selection

Choose the right tool for the query type:

| Need | Tool | When |
|------|------|------|
| **Conceptual understanding w/ quick access file references** | `ah knowledge search` | "How does X work?", "Why is Y designed this way?" |
| **Find relevant codebase patterns** | `tldr semantic search` or grep | Known string, error message, literal pattern |
| **Find symbol definition** | LSP | Class, function, type by name |
| **Find file by name** | Glob | Filename pattern known |
| **Past solutions** | `ah solutions search` | Similar problem solved before |

### Search Flow

```
Engineer Task → Knowledge Search → LSP on Referenced Symbols → Full Reads only when Needed
```

## Query Formatting

Queries should be **complete sentences** with full context, not minimal keywords:

```bash
# GOOD - complete question with context
ah knowledge search "how does the retry mechanism handle rate limits when calling external APIs"

# BAD - keyword soup
ah knowledge search "retry rate limit api"
```

## Response Interpretation

Knowledge search returns:
- `insight`: Engineering / Product knowledge with the "why"
- `lsp_entry_points`: Key file references with exploration rationale and LSP symbols
- `design_notes`: Relevant architectural decisions

## Decision Tree

```
Need codebase context?
├─ Know exact file? → Read directly
├─ Know exact symbol? → LSP directly
├─ Know exact string? → tldr semantic search / grep
├─ Similar problem before? → ah solutions search first
└─ Conceptual/discovery question? → ah knowledge search
    ├─ Aggregated result? → Follow lsp_entry_points (why field = priority)
    └─ Direct result? → relevant_files + [ref:...] blocks → LSP on symbols
        └─ Use ah knowledge search for deeper understanding
            └─ ast-grep if still struggling
```

### Failure Recovery

| Situation | Next Step |
|-----------|-----------|
| Knowledge search returns nothing | Try different semantic phrasing |
| grep returns nothing | Try alternative names (error/exception/failure) |
| LSP can't find symbol | Check import statements, search file contents |
| Pattern not found | Widen search directory, check file extensions |

## Full File Reads

Only read full files when:
- LSP exploration reveals complex implementation needs investigation
- Path-only references (no symbol to LSP into)
- Search tooling not effective for current language
