---
name: research-tools
description: Use for research needs. IE "search the web", "research [topic]", "extract URL content", "find sources". Provides Tavily (search/extract), Perplexity (deep research), Grok (X/Twitter).
---

<objective>
External research capability for agents. Web search, deep research with citations, and real-time social signals via envoy commands.
</objective>

<quick_start>
```bash
# Deep research (Perplexity)
envoy perplexity research "query"

# Web search (Tavily)
envoy tavily search "query"

# Extract URL content
envoy tavily extract "url1" "url2"

# Library documentation search (Context7)
envoy context7 search "react"
envoy context7 search "fastify" "middleware patterns"

# Get library docs for known library (Context7)
envoy context7 context "/facebook/react" "hooks usage"
envoy context7 context "/fastify/fastify" "routing" --text
```
</quick_start>

<constraints>
- Only curator/researcher agents may use these tools
- GitHub content: use `gh` CLI instead of extract
- All commands return JSON - parse `data.content` or `data.results`
- Use TODAY's date for time-sensitive queries: `date +%Y-%m-%d`
- Context7 requires search → context flow (search gives libraryId for context)
</constraints>

<workflow>
<step name="scope">
Clarify: What to learn? What for? Depth needed?
</step>

<step name="choose_tool">
| Need | Tool | Cost |
|------|------|------|
| Library docs (known library) | `context7 search` → `context7 context` | Low |
| Broad question, synthesis | `perplexity research` | High |
| Synthesis + real-time validation | `perplexity research --grok-challenge` | Higher |
| X/Twitter community insights | `xai search` | Medium |
| Find sources, discover URLs | `tavily search` | Medium |
| Full content from known URL | `tavily extract` | Low |
</step>

<step name="process_results">
All tools return JSON. Parse `data.content` or `data.results` for findings.
</step>
</workflow>

<examples>
<command_reference>
```bash
# Context7 (library documentation)
envoy context7 search "react"                              # Find react libraries
envoy context7 search "fastify" "middleware handling"      # Search with query context
envoy context7 context "/facebook/react" "hooks"           # Get docs (JSON)
envoy context7 context "/facebook/react" "hooks" --text    # Get docs (plain text)

# Perplexity (deep research)
envoy perplexity research "query"
envoy perplexity research "query" --grok-challenge

# Grok (X/Twitter)
envoy xai search "query"
envoy xai search "query" --results-to-challenge "findings"

# Tavily (web search/extract)
envoy tavily search "query"
envoy tavily search "query" --max-results 10
envoy tavily extract "url1" "url2"

# GitHub (use gh CLI)
gh api repos/{owner}/{repo}/contents/{path}
gh issue view {number} --repo {owner}/{repo}
```
</command_reference>

<decision_tree>
```
Need information?
├─ How does library X work? → context7 search "X" → context7 context "<id>" "question"
├─ Library docs for codebase dependency? → context7 search → context7 context
├─ Know exact URL? → tavily extract
├─ Need to find sources? → tavily search → extract promising URLs
├─ Tech research for planning? → perplexity research --grok-challenge
├─ Implementation patterns/best practices? → perplexity research
└─ Quick answer, no validation? → perplexity research
```
</decision_tree>

<context7_flow>
Context7 is for library/package documentation. Two-step flow:

1. **Search**: Find the library and get its ID
```bash
envoy context7 search "react"
# Returns: { results: [{ id: "/facebook/react", name: "React", ... }] }
```

2. **Context**: Get docs for specific questions using the ID
```bash
envoy context7 context "/facebook/react" "useState and useEffect"
# Returns: { docs: [{ title, content, source }] }
```

**Tips for minimal context usage:**
- Use `--text` for direct LLM consumption (no JSON parsing)
- Be specific in query to get relevant docs only
</context7_flow>

<output_format>
```markdown
## Research: [Topic]

### Key Findings
- Finding with context

### Sources
- [URL] - relevance

### Recommendations
Actions based on findings.
```
</output_format>
</examples>

<anti_patterns>
- Using extract for GitHub content (use `gh` CLI)
- Skipping scope clarification before research
- Not parsing JSON response properly
- Using from non-curator/researcher agents
- Calling context7 context without searching first (need libraryId)
- Using context7 for non-library questions (use perplexity instead)
</anti_patterns>

<success_criteria>
- JSON response: `status: success` with `data` containing findings
- Sources/citations included for synthesis queries
- Content extracted for known URLs
- Context7: Valid libraryId used in context command
</success_criteria>
