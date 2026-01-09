---
description: Documentation for external AI API integrations (Gemini, Perplexity, Tavily, xAI Grok). Covers authentication, retry behavior, use cases, and response handling.
---

# External API Integrations

## Overview

Envoy integrates with multiple AI APIs for different purposes:

| API | Use Case | API Key Variable |
|-----|----------|------------------|
| Gemini | Plan validation, auditing, reviews | `VERTEX_API_KEY` |
| Perplexity | Deep research with citations | `PERPLEXITY_API_KEY` |
| Tavily | Web search and content extraction | `TAVILY_API_KEY` |
| xAI Grok | X/Twitter technology sentiment | `X_AI_API_KEY` |

## Retry Behavior

All external API calls use the `withRetry` utility with exponential backoff:

```typescript
const DEFAULT_OPTIONS = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 8000,
  backoffMultiplier: 2,
};
```

Retryable errors include:
- Network errors (ECONNRESET, ETIMEDOUT, ENOTFOUND)
- Rate limits (429)
- Server errors (5xx)

On failure after retries, commands return a `fallback_suggestion` guiding the agent on how to proceed.

---

## Gemini Integration

**Module:** `commands/gemini.ts`

Uses Google's Gemini API via `@google/genai` SDK with Vertex AI integration.

### Models

| Model | Usage |
|-------|-------|
| `gemini-2.0-flash` | Default for most operations |
| `gemini-3-pro-preview` | Complex audit/review operations |

### Commands

#### gemini ask

Raw inference with optional file context.

```bash
envoy gemini ask "Explain this code" --files src/auth.ts --context "Focus on security"
```

**Response:**
```json
{
  "status": "success",
  "data": { "content": "..." },
  "metadata": { "model": "gemini-2.0-flash", "duration_ms": 1234, "retries": 0 }
}
```

#### gemini validate

Validates plan against requirements to prevent over-engineering.

```bash
envoy gemini validate --context "Keep it simple"
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "validation_result": "valid",
    "verdict_context": "Plan is appropriately scoped...",
    "recommended_edits": [],
    "user_questions": []
  }
}
```

#### gemini architect

Solutions architecture for complex features.

```bash
envoy gemini architect "Design a caching layer" --files src/api/*.ts
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "complexity_assessment": "moderate",
    "architectural_decisions": [...],
    "implementation_strategy": {...},
    "risks": [...],
    "questions_for_user": []
  }
}
```

#### gemini audit

Audits plan for completeness, coherence, and dependency ordering.

```bash
envoy gemini audit
```

If clarifying questions exist, blocks for user feedback via `audit_questions.yaml`.

**Response:**
```json
{
  "status": "success",
  "data": {
    "verdict": "passed",
    "thoughts": "Plan covers all requirements...",
    "suggested_edits": []
  }
}
```

#### gemini review

Reviews implementation against requirements.

```bash
# Single prompt review
envoy gemini review 1

# Full plan review
envoy gemini review --full
```

If clarifying questions exist, blocks for user feedback.

**Response:**
```json
{
  "status": "success",
  "data": {
    "verdict": "passed",
    "thoughts": "Implementation meets criteria...",
    "suggested_changes": null
  }
}
```

### Blocking Behavior

Audit and review commands may block for user input when questions arise:

1. Creates feedback YAML (e.g., `audit_questions.yaml`)
2. Blocks via `watchForDone` until user sets `done: true`
3. Appends Q&A to `user_input.md` for audit trail
4. Deletes feedback file

---

## Perplexity Integration

**Module:** `commands/perplexity.ts`

Deep research using `sonar-deep-research` model. Returns comprehensive answers with citations.

### Commands

#### perplexity research

```bash
envoy perplexity research "Best practices for WebSocket authentication" --grok-challenge
```

**Options:**
- `--grok-challenge` - Chain to Grok for validation/challenging

**Timeout:** 300000ms (5 minutes) - deep research is slow

**Response:**
```json
{
  "status": "success",
  "data": {
    "content": "WebSocket authentication best practices...",
    "citations": [
      "https://example.com/websocket-security",
      "https://rfc-editor.org/..."
    ]
  },
  "metadata": {
    "model": "sonar-deep-research",
    "duration_ms": 45000
  }
}
```

With `--grok-challenge`:
```json
{
  "status": "success",
  "data": {
    "research": { "content": "...", "citations": [...] },
    "challenge": { "content": "...", "citations": [...] }
  }
}
```

---

## Tavily Integration

**Module:** `commands/tavily.ts`

Web search and content extraction optimized for agentic workflows.

### Commands

#### tavily search

Web search with optional LLM-generated answer.

```bash
envoy tavily search "React 18 concurrent features" --max-results 10
```

**Options:**
- `--max-results` - Max results (default: 5, max: 20)

**Response:**
```json
{
  "status": "success",
  "data": {
    "query": "React 18 concurrent features",
    "answer": "React 18 introduces...",
    "results": [
      {
        "title": "React 18 Release Notes",
        "url": "https://react.dev/...",
        "content": "Summary...",
        "score": 0.95,
        "raw_content": "Full page content..."
      }
    ]
  },
  "metadata": { "result_count": 5, "response_time": 1.2 }
}
```

#### tavily extract

Extract full content from URLs (up to 20).

```bash
envoy tavily extract https://docs.example.com/api https://docs.example.com/guide
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "results": [
      {
        "url": "https://docs.example.com/api",
        "raw_content": "# API Documentation\n..."
      }
    ],
    "failed_results": []
  },
  "metadata": { "success_count": 2, "failed_count": 0 }
}
```

---

## xAI Grok Integration

**Module:** `commands/xai.ts`

Search X (Twitter) for technology research and community sentiment.

### Commands

#### xai search

```bash
# Basic search
envoy xai search "Next.js App Router"

# With previous context
envoy xai search "Next.js App Router" --context "Previous research found..."

# Challenge mode
envoy xai search "Next.js App Router" --results-to-challenge "Claims to investigate..."
```

**Options:**
- `--context` - Previous research to build upon
- `--results-to-challenge` - Enable challenger mode to find contradictions

**Modes:**

| Mode | Description |
|------|-------------|
| Basic | Find developer opinions, alternatives, sentiment |
| Context | Build on existing research |
| Challenger | Find contradictions, newer tools, real sentiment |

**Response:**
```json
{
  "status": "success",
  "data": {
    "content": "Based on X posts...",
    "citations": ["https://x.com/..."]
  },
  "metadata": {
    "model": "grok-4-1-fast",
    "x_search_calls": 3,
    "input_tokens": 150,
    "output_tokens": 500
  }
}
```

---

## Repomix Integration

**Module:** `commands/repomix.ts`

Budget-aware code extraction using repomix CLI.

### Commands

#### repomix estimate

Get token count without extracting code (for budget planning).

```bash
envoy repomix estimate src/auth/ src/middleware/
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "paths": ["src/auth/", "src/middleware/"],
    "token_count": 15000,
    "tree": "src/auth/\n  index.ts (200)\n  ...",
    "message": "Estimated 15000 tokens for 2 path(s)"
  }
}
```

#### repomix extract

Get combined code content.

```bash
envoy repomix extract src/auth/
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "paths": ["src/auth/"],
    "token_count": 8000,
    "content": "// src/auth/index.ts\n..."
  }
}
```

---

## Error Handling

All API commands return consistent error responses:

```json
{
  "status": "error",
  "error": {
    "type": "api_error",
    "message": "HTTP 429: Rate limit exceeded",
    "command": "perplexity.research",
    "suggestion": "Wait before retrying"
  },
  "metadata": { "retries": 3, "duration_ms": 12000 }
}
```

Common error types:
- `auth_error` - Missing or invalid API key
- `timeout` - Request timed out after max retries
- `api_error` - API returned error response
- `validation_error` - Invalid arguments
