# claude-envoy

CLI for agent-scoped external tool access. Keeps file contents OUT of Claude's context.

## Usage

```bash
.claude/envoy/envoy <group> <command> [args]
.claude/envoy/envoy --help
.claude/envoy/envoy <group> --help
```

## Tools

### Research

| Tool | Use Case |
|------|----------|
| `perplexity research` | Deep research with citations (pre-synthesized) |
| `tavily search` | Web search, returns URLs and snippets |
| `tavily extract` | Extract full content from URLs |
| `xai search` | X/Twitter search for community opinions, alternatives, discussions |

### NIA (External Documentation & Package Search)

| Tool | Use Case |
|------|----------|
| `nia search` | Universal search across indexed repos, docs, packages |
| `nia package` | Search inside package source code (npm, pypi, crates, go) |
| `nia research` | AI-powered deep research (falls back to perplexity) |

*If NIA doesn't have a repo indexed, fall back to `gh api repos/{owner}/{repo}/contents/{path}`*

### Vertex (Gemini)

| Tool | Use Case |
|------|----------|
| `vertex ask` | Raw Gemini inference (thin wrapper, no system prompt) |
| `vertex validate` | Validate plan against user requirements (anti-overengineering) |
| `vertex review` | Review implementation against plan (uses git diff internally) |
| `vertex architect` | Solutions architecture for complex features |

### Plans (Internal)

| Tool | Use Case |
|------|----------|
| `plans status` | Show plan status for current branch |
| `plans capture` | Capture user prompt (called by hook) |
| `plans cleanup` | Remove orphaned plan directories |

## When to Use What

**Research:**
- Pre-synthesized findings → `perplexity research`
- Raw sources for processing → `tavily search` → `tavily extract`
- Community opinions/alternatives → `xai search` (can build on previous findings with `--context`)
- Search inside package source code → `nia package <pkg> <query> --registry npm|pypi|crates|go`
- Search indexed repos/docs → `nia search` (fallback: `gh api` for unindexed repos)
- Implementation patterns research → `nia research` (fallback: perplexity)

**Vertex:**
- Arbitrary Gemini query → `vertex ask`
- Before plan approval → `vertex validate`
- After implementation → `vertex review`
- Big feature scoping → `vertex architect`

## Context Window Benefits

These tools read files directly and pass to external LLMs. Claude only receives structured JSON output, not raw file contents or diffs.

## Environment Variables

| Variable | Required For | Description |
|----------|--------------|-------------|
| `PERPLEXITY_API_KEY` | perplexity | Perplexity API key |
| `TAVILY_API_KEY` | tavily | Tavily API key |
| `VERTEX_API_KEY` | vertex | Google AI API key (Vertex Express) |
| `X_AI_API_KEY` | xai | xAI Grok API key |
| `NIA_API_KEY` | nia | NIA API key (trynia.ai) |
| `ENVOY_TIMEOUT_MS` | optional | Global timeout (default: 120000) |
| `NIA_TIMEOUT_MS` | optional | NIA deep research timeout (default: 300000) |

## Discovery

```bash
# List all commands and API status
.claude/envoy/envoy info

# Get help for any command
.claude/envoy/envoy vertex ask --help
```
