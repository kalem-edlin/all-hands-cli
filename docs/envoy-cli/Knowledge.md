---
description: Documentation for the knowledge search system using USearch for semantic search. Covers index configuration, embedding model, search behavior, and incremental reindexing.
---

# Knowledge Search System

## Overview

The knowledge system provides semantic search over documentation using:

- **Embeddings:** `gtr-t5-quant` model via `@visheratin/web-ai-node`
- **Index:** USearch HNSW index with cosine similarity
- **Storage:** `.claude/envoy/.knowledge/` directory

## Index Configuration

Two pre-configured indexes:

### docs Index

Indexes project documentation with front-matter support.

```typescript
{
  name: "docs",
  paths: ["docs/"],
  extensions: [".md"],
  description: "Project documentation for all agents",
  hasFrontmatter: true,
}
```

### curator Index

Indexes `.claude/` configuration files.

```typescript
{
  name: "curator",
  paths: [
    ".claude/agents/",
    ".claude/hooks/",
    ".claude/skills/",
    ".claude/commands/",
    ".claude/output-styles/",
    ".claude/envoy/README.md",
    ".claude/settings.json",
    ".claude/envoy/src/",
    ".claude/envoy/package.json",
  ],
  extensions: [".md", ".yaml", ".yml", ".ts", ".json"],
  description: ".claude/ files for curator agent",
  hasFrontmatter: false,
}
```

## Search Behavior

### Similarity Thresholds

| Variable | Default | Description |
|----------|---------|-------------|
| `SEARCH_SIMILARITY_THRESHOLD` | 0.64 | Minimum similarity for results |
| `SEARCH_FULL_CONTEXT_SIMILARITY_THRESHOLD` | 0.72 | Include full content |
| `SEARCH_CONTEXT_TOKEN_LIMIT` | 5000 | Max tokens in response |

### Distance to Similarity

USearch returns cosine distance (0=identical, 2=opposite). Converted to similarity:

```typescript
similarity = 1 - (distance / 2)
```

### Search Algorithm

1. Generate query embedding
2. Search HNSW index for k nearest neighbors
3. Filter by similarity threshold
4. Accumulate results within token limit
5. Include full content for high-similarity results (unless `--metadata-only`)

## Document Metadata

For front-matter enabled indexes, documents store:

```typescript
interface DocumentMeta {
  description: string;      // From front-matter
  relevant_files: string[]; // From front-matter or auto-extracted
  token_count: number;      // Estimated (chars / 4)
}
```

## File Reference Extraction

The system auto-extracts file references from document content:

```typescript
const FILE_REF_PATTERNS = [
  /`([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)`/g,           // `path/file.ts`
  /\[.*?\]\(([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)\)/g,  // [text](path/file.ts)
  /(?:src|lib|components|utils|hooks|services)\/[a-zA-Z0-9_\-./]+\.[a-zA-Z]+/g,
];
```

During incremental reindex:
1. Extract references from content
2. Validate each reference exists
3. Auto-populate `relevant_files` in front-matter
4. Report missing references

## Commands

### knowledge search

```bash
envoy knowledge search <index_name> <query> [--metadata-only]
```

**Tips:**
- Use descriptive phrases, not keywords
- "how to handle API authentication" vs "auth"
- `--metadata-only` for lightweight discovery

**Response:**
```json
{
  "status": "success",
  "data": {
    "query": "how to validate user input",
    "index": "docs",
    "metadata_only": false,
    "results": [
      {
        "resource_path": "docs/validation/README.md",
        "similarity": 0.82,
        "token_count": 350,
        "description": "Input validation patterns",
        "relevant_files": ["src/validation.ts"],
        "full_resource_context": "# Input Validation\n..."
      }
    ],
    "result_count": 3
  }
}
```

### knowledge reindex-all

Full rebuild of one or all indexes.

```bash
# Reindex all
envoy knowledge reindex-all

# Reindex specific
envoy knowledge reindex-all --index_name docs
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "message": "All indexes reindexed",
    "stats": {
      "docs": { "files_indexed": 42, "total_tokens": 85000 },
      "curator": { "files_indexed": 28, "total_tokens": 45000 }
    }
  }
}
```

### knowledge reindex-from-changes

Incremental update from file changes (designed for git hooks).

```bash
envoy knowledge reindex-from-changes docs --files '[{"path":"docs/new.md","added":true}]'
```

**File change format:**
```typescript
interface FileChange {
  path: string;
  added?: boolean;
  deleted?: boolean;
  modified?: boolean;
}
```

**Response (success):**
```json
{
  "status": "success",
  "data": {
    "message": "Index updated successfully",
    "files": [
      { "path": "docs/new.md", "action": "added" }
    ]
  }
}
```

**Response (missing references):**
```json
{
  "status": "error",
  "error": {
    "type": "missing_references",
    "message": "Documents contain references to missing files"
  },
  "data": {
    "missing_references": [
      { "doc_path": "docs/api.md", "missing_files": ["src/deleted.ts"] }
    ],
    "files": [{ "path": "docs/api.md", "action": "modified" }]
  }
}
```

### knowledge status

Check index health.

```bash
envoy knowledge status
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "valid_indexes": ["docs", "curator"],
    "missing_indexes": [],
    "needs_reindex": false
  }
}
```

## Index Storage

```
.claude/envoy/.knowledge/
├── docs.usearch        # USearch binary index
├── docs.meta.json      # Metadata mapping
├── curator.usearch
└── curator.meta.json
```

### Metadata Structure

```typescript
interface IndexMetadata {
  id_to_path: Record<string, string>;  // ID -> file path
  path_to_id: Record<string, string>;  // File path -> ID
  documents: Record<string, DocumentMeta>;
  next_id: number;
  lastUpdated: string;
}
```

## Embedding Model

The `gtr-t5-quant` model:
- Dimension: 768
- Downloads on first use (~100-400MB)
- Quantized for efficiency
- Good for document retrieval

## Integration with Agents

Agents use knowledge search for documentation-first implementation:

```bash
# Before implementation
envoy knowledge search docs "authentication middleware pattern"

# Check for existing patterns
envoy knowledge search curator "how agents handle errors"
```

## Performance Considerations

1. **First search is slow** - Model downloads and loads
2. **Subsequent searches fast** - Model cached in memory
3. **Reindex is CPU intensive** - Generates embeddings for all files
4. **Token limits prevent context overflow** - Max 5000 tokens returned
