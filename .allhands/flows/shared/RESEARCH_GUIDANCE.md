<goal>
Pick the right research tool and depth for the need. Per **Context is Precious**, use targeted tools to gather external knowledge efficiently.
</goal>

<constraints>
- MUST determine discovery level before researching
- MUST use `gh` CLI for GitHub content, not research tools
- NEVER use WebSearch or WebFetch tools since the tooling here is much better
- If any tool fails, you MUST try another tool from the decision tree.
</constraints>

## Decision Tree

```
├─ Broad synthesis, deep research with citations? → `ah perplexity research "<query>"`
├─ Same + X/Twitter community insights? → `ah perplexity research "<query>" --grok-challenge`
├─ Find sources, discover URLs? → `ah tavily search "<query>"`
├─ Full content from known URL? → `ah tavily extract "<url1>" "<url2>"`
├─ Challenge findings with social signals? → `ah perplexity research "<query>" --challenge`
└─ GitHub content? → Use `gh` CLI directly
```

## When to Use What

| Need | Tool | Why |
|------|------|-----|
| "Best ways to solve X?" | perplexity | Synthesizes multiple sources |
| "Best ways to solve X for agentic developers?" | perplexity --grok-challenge | Synthesis + X/Twitter community challenge |
| "Find articles about X" | tavily search | Returns URLs to explore |
| "Get content from this doc" | tavily extract | Full page content |
| "Challenge research with developer sentiment" | perplexity --challenge | Validates findings via X/Twitter |

## Combination Strategy

When unsure which tool is best:
- Use multiple tools in parallel
- Compare result quality for your use case
- Remember which gives best results for similar future queries
