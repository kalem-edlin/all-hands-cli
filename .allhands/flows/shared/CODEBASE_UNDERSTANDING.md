<goal>
Enable context-efficient codebase exploration using intentional tooling. Per **Context is Precious**, minimize context window consumption while maximizing understanding.
</goal>

<constraints>
- MUST use `ah knowledge search` FIRST for ANY DISCOVERY TASKS
- MUST use complete sentences for knowledge search queries (RAG performs better with semantic content)
- NEVER read full files unless LSP/search exploration proves insufficient
- TLDR semantic search is your backup weapon
</constraints>

## Search Tool Selection

Choose the right tool for the query type:

| Need | Tool | When |
|------|------|------|
| **Great codebase navigation tool AND documented knowledge!!** | `ah knowledge docs search` | "How does X work?", "Why is Y designed this way?" |
| **Find relevant codebase patterns when knowledge search is not enough** | `tldr semantic search` or grep | Known string, error message, literal pattern |
| **Find symbol definition - usually from symbols given by knowledge search** | LSP | Class, function, type by name |
| **Past solutions** | `ah solutions search` | Similar problem solved before |
| **Grep but better** | `ast-grep` | Known string, error message, literal pattern |

### Search Flow

```
Engineer Task → Knowledge Docs Search → LSP on Referenced Symbols → Grep/ast-grep if needed
```

## Query Formatting

Queries should be **complete sentences** with full context, not minimal keywords:

```bash
# GOOD - complete question with context
ah knowledge docs search "how does the retry mechanism handle rate limits when calling external APIs"

# BAD - keyword soup
ah knowledge docs search "retry rate limit api"
```

## Response Interpretation

Knowledge search returns:
- `insight`: Engineering / Product knowledge with the "why"
- `lsp_entry_points`: Key file references with exploration rationale and LSP symbols
- `design_notes`: Relevant architectural decisions
- `[ref:...]`: Contains file references and LSP symbols. Only returned if the full docs document is returned.

## Decision Tree

```
Need codebase context?
├─ Get relevant codebase direction with knowledge? → ah knowledge docs search
    ├─ Aggregated result? → Follow lsp_entry_points (why field = priority)
    └─ Direct result? → relevant_files + [ref:...] blocks → LSP on symbols
├─ Know exact symbol? → LSP directly
├─ Know semantic idea? → tldr semantic search / grep
├─ Suspect a similar problem faced before? → ah solutions search first
└─ ast-grep if still struggling
```

### Failure Recovery

| Situation | Next Step |
|-----------|-----------|
| Knowledge docs search returns nothing | Try different semantic phrasing |
| grep returns nothing | Try alternative names (error/exception/failure) |
| LSP can't find symbol | Check import statements, search file contents |
| Pattern not found | Widen search directory, check file extensions |
