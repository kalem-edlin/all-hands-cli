---
name: knowledge-discovery
description: Semantic codebase exploration using knowledge base + LSP. Use for context gathering, understanding design decisions, finding implementation patterns. Combines "why" from docs with "where" from code references.
---

<objective>
Enable context-efficient codebase exploration by leveraging semantic knowledge search before raw file reads. Knowledge docs capture motivations and design decisions that grep/glob cannot surface. File references in results guide targeted code exploration via LSP or direct reads.
</objective>

<motivation>
Traditional search (grep, glob) finds **what** exists but not **why**. Knowledge base docs encode:
- Design motivations and tradeoffs
- Pattern explanations with rationale
- Cross-cutting concerns that span multiple files
- "How we do X" institutional knowledge

Searching knowledge first provides semantic context that informs subsequent code exploration. File references embedded in knowledge docs point to implementations, enabling LSP-guided exploration that minimizes context consumption.
</motivation>

<quick_start>
```bash
# Semantic search - use full descriptive phrases, not keywords
envoy knowledge search "how does retry logic handle rate limits in external API calls"

# NOT: envoy knowledge search "retry rate limit"
```

Result interpretation:
- **High similarity (>0.8)**: Full `full_resource_context` included - read directly
- **Lower similarity**: Only `description` provided - may need `envoy knowledge read <path>` for full content
</quick_start>

<constraints>
- Use full phrases for semantic search, not keywords
- Always check file references in results before doing raw codebase searches
- LSP required when symbol references present (context-light first)
- Estimate context cost before large file reads
</constraints>

<workflow>
### 1. Semantic Search First
```bash
envoy knowledge search "<descriptive question about the requirement or concept>"
```

### 2. Interpret Results

**High-confidence matches** return full content:
```json
{
  "similarity": 0.85,
  "full_resource_context": "---\ndescription: ...\n---\n\n# Full doc content..."
}
```

**Lower-confidence matches** return descriptions only:
```json
{
  "similarity": 0.72,
  "description": "Brief description of what the doc covers"
}
```

If description seems relevant, fetch full content:
```bash
envoy knowledge read "docs/path/to/file.md"
```

### 3. Follow File References

Knowledge docs embed file references in two forms:

**Path + Symbol** (LSP required):
```
[ref:.claude/envoy/src/lib/retry.ts:withRetry:fc672da]
```
→ Use LSP to explore symbol before reading file

**Path Only** (direct read permitted):
```
[ref:.claude/envoy/src/commands/gemini.ts::fc672da]
```
→ Full file read acceptable

### 4. LSP Exploration (when symbol present)

Match LSP operation to information need:

| Need | LSP Operation |
|------|---------------|
| Find callers/usage | `incomingCalls` |
| Find dependants | `findReferences` |
| Get signature/types | `hover` |
| Jump to definition | `goToDefinition` |
| All symbols in file | `documentSymbol` |

**Example flow**:
```bash
# 1. Find symbol location
LSP goToDefinition → retry.ts:78

# 2. Understand usage patterns
LSP incomingCalls → 6 callers in gemini.ts

# 3. Only then read relevant implementation
Read retry.ts (lines 78-120)
```

### 5. Context-Aware Reading

After LSP exploration, read only what's needed:
- Specific function/class implementations
- Caller contexts that inform usage patterns
- Avoid reading entire files when LSP provides structure
</workflow>

<examples>
<example name="Investigating retry patterns">
```bash
# 1. Semantic search
envoy knowledge search "how do we handle retries for external API calls in envoy"

# Result includes ref: .claude/envoy/src/lib/retry.ts:withRetry:fc672da

# 2. LSP exploration
LSP documentSymbol retry.ts → find withRetry at line 78
LSP incomingCalls line 78 → 6 callers in gemini.ts

# 3. Targeted read
Read retry.ts lines 36-125 (isRetryableError + withRetry only)
```
</example>

<example name="Understanding protocol extension">
```bash
# 1. Semantic search
envoy knowledge search "how are protocols maintained for reusability and extension"

# Result includes full context explaining:
# - extends keyword for inheritance
# - Step numbering (6.1, 6.2 for insertions, 6+ for augments)
# - File refs to protocols/debugging.yaml, protocols/implementation.yaml

# 2. Path-only reference → direct read
Read .claude/protocols/debugging.yaml (extends field visible)
```
</example>

<decision_tree>
```
Need codebase context?
├─ Know specific file/symbol? → Read/LSP directly
├─ Conceptual question? → envoy knowledge search
│   ├─ High similarity result? → Use full_resource_context
│   └─ Lower similarity? → envoy knowledge read if relevant
│       └─ File references in result?
│           ├─ Has symbol (path:symbol:hash)? → LSP first
│           └─ Path only (path::hash)? → Direct read OK
└─ No knowledge matches? → Fallback to grep/glob
```
</decision_tree>
</examples>

<anti_patterns>
- Using keywords instead of descriptive phrases in knowledge search
- Reading entire files when LSP can provide structure first
- Skipping knowledge search and going straight to grep
- Ignoring file references and re-searching codebase
- Using findReferences when incomingCalls would suffice (findReferences includes definition)
</anti_patterns>

<success_criteria>
- Knowledge search invoked before raw codebase exploration
- File references from knowledge docs used to guide code exploration
- LSP used for symbol references before large file reads
- Context budget preserved through targeted reads
- Design motivations ("why") understood alongside implementation ("what")
</success_criteria>
