# claude-envoy

CLI for agent-scoped external tool access. Keeps file contents OUT of Claude's context.

## Usage

```bash
envoy <group> <command> [args]
envoy --help
envoy <group> --help
```

## Tools

### Research

| Tool | Use Case |
|------|----------|
| `perplexity research` | Deep research with citations (pre-synthesized) |
| `tavily search` | Web search, returns URLs and snippets |
| `tavily extract` | Extract full content from URLs |
| `xai search` | X/Twitter search for community opinions, alternatives, discussions |

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
| `ENVOY_TIMEOUT_MS` | optional | Global timeout (default: 120000) |

## Discovery

```bash
# List all commands and API status
envoy info

# Get help for any command
envoy vertex ask --help
```
