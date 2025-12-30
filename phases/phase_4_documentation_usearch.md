# Phase 4: Documentation/USearch System

## Objective
Implement the semantic search indexing system using USearch (HNSW algorithm) for documentation and .claude/ file lookup.

## Scope
- USearch index setup in `.claude/envoy/.knowledge/`
- `envoy knowledge search`
- `envoy knowledge reindex-all`
- `envoy knowledge reindex-from-changes`

---

## Critical Implementation Decisions (Pre-Researched)

### Why USearch over Voy
**IMPORTANT**: After research, USearch is preferred over voy-search for this use case:

| Requirement | Voy (k-d tree) | USearch (HNSW) |
|-------------|----------------|----------------|
| 768-dim vectors | Degrades badly (curse of dimensionality) | Optimized for high-dim |
| Node.js CLI | WASM loading issues, needs fork | Native N-API bindings |
| Similarity scores | Discards them, needs sidecar workaround | Built-in `distances` array |
| Sessionless ops | Works but JSON serialize overhead | Binary save/load + memory-map |

### USearch Does NOT Generate Embeddings
USearch is a pure vector index/search library. It does NOT generate embeddings internally. USearch only:
- Stores pre-computed embedding vectors
- Performs k-nearest-neighbor search using HNSW graph
- Saves/loads binary index files

**External embedding generation required** via `@visheratin/web-ai-node`.

### Similarity Scores - Native Support
Unlike voy, USearch returns distances directly in search results:
```typescript
const { keys, distances } = index.search(queryVector, k);
// keys: BigUint64Array of document IDs
// distances: Float32Array of distance scores
```

No sidecar workaround needed. Cosine distance is computed natively.

### RAG Approach: Document-Level Embeddings
**Decision**: Use document-level embeddings (1 vector per document), NOT chunk-level.

**Rationale**:
- Documents in docs/ and .claude/ are small (500-800 tokens typically)
- Full document embedding preserves semantic context - a "best practice for X" embedded with its document context ensures the domain is captured
- Chunk-level risks returning snippets out of context that look relevant but are contextually wrong
- Phase spec expects document-level results with front matter (description, relevant_files)
- Simpler implementation, easier debugging, less storage

### Vector Dimensions
USearch supports arbitrary dimensions (configurable). We use **768-dimensional vectors** to match the `gtr-t5-quant` embedding model.

### CLI Execution Model (Sessionless)
USearch supports isolated/stateless CLI execution via:
- `index.save(path)` → writes binary index file
- `index.load(path)` → loads index into memory
- `index.view(path)` → memory-mapped read-only access (optional optimization)

Each CLI invocation: load index from file → search/modify → save back to file. No persistent daemon.

---

## Implementation Details

### Dependencies (in package.json)
```json
{
  "@visheratin/web-ai-node": "^1.4.5",  // Node.js embedding generation
  "gray-matter": "^4.0.3",              // Front-matter parsing
  "usearch": "^2.21.4"                  // Vector search (HNSW)
}
```

### Storage Structure
```
.claude/envoy/.knowledge/           # Gitignored
├── docs.usearch                 # Binary USearch index for docs/
├── docs.meta.json               # Metadata: {id_to_path: {...}, path_to_meta: {...}}
├── curator.usearch              # Binary USearch index for .claude/
├── curator.meta.json            # Metadata for .claude/ files
└── model-cache/                 # Cached ONNX model files (auto-managed by web-ai)
```

### ID Mapping
USearch uses `BigInt` keys. We maintain a metadata JSON file alongside each index:
```typescript
interface IndexMetadata {
  id_to_path: Record<string, string>;     // "0" -> "docs/api.md"
  path_to_id: Record<string, string>;     // "docs/api.md" -> "0"
  documents: Record<string, DocumentMeta>; // path -> metadata
  next_id: number;                         // next available ID
  lastUpdated: string;
}

interface DocumentMeta {
  description: string;
  relevant_files: string[];
  token_count: number;
}
```

### Index Configurations
```typescript
const INDEX_CONFIGS = {
  docs: {
    name: 'docs',
    paths: ['docs/'],           // Project root docs/ directory
    extensions: ['.md'],
    description: 'Project documentation for all agents'
  },
  curator: {
    name: 'curator',
    paths: ['.claude/agents/', '.claude/hooks/', '.claude/skills/', '.claude/commands/', '.claude/output-styles/', '.claude/envoy/README.md', '.claude/settings.json', '.claude/envoy/src/', '.claude/envoy/package.json'],
    extensions: ['.md', '.yaml', '.yml', '.ts', '.json'],
    description: '.claude/ files for curator agent'
  }
};
```

### KnowledgeService Class (src/lib/knowledge.ts)
```typescript
import usearch from 'usearch';

interface DocumentMeta {
  description: string;
  relevant_files: string[];
  token_count: number;
}

interface IndexMetadata {
  id_to_path: Record<string, string>;
  path_to_id: Record<string, string>;
  documents: Record<string, DocumentMeta>;
  next_id: number;
  lastUpdated: string;
}

class KnowledgeService {
  private model: TextModel | null = null;
  private readonly searchDir: string;

  // Lazy-load embedding model (first use downloads ~100-400MB)
  async getModel(): Promise<TextModel>;

  // Generate embedding for text
  async embed(text: string): Promise<Float32Array>;

  // Convert cosine distance to similarity (0-1 scale)
  distanceToSimilarity(distance: number): number;

  // Load index + metadata from disk
  async loadIndex(indexName: string): Promise<{index: usearch.Index, meta: IndexMetadata}>;

  // Save index + metadata to disk
  async saveIndex(indexName: string, index: usearch.Index, meta: IndexMetadata): Promise<void>;

  // Index a single document (returns assigned ID)
  async indexDocument(index: usearch.Index, meta: IndexMetadata, path: string, content: string, frontMatter: object): Promise<bigint>;

  // Search with similarity computation
  async search(indexName: string, query: string, k: number): Promise<SearchResult[]>;

  // Full reindex for an index
  async reindexAll(indexName?: string): Promise<ReindexResult>;

  // Incremental reindex from changed files
  async reindexFromChanges(indexName: string, changes: FileChange[]): Promise<ReindexResult>;
}
```

### Search Flow
1. Load USearch index from `.knowledge/{indexName}.usearch`
2. Load metadata from `.knowledge/{indexName}.meta.json`
3. Generate query embedding via web-ai model
4. Call `index.search(queryEmbedding, k)` - returns `{keys, distances}`
5. Convert distances to similarities: `similarity = 1 - distance` (for cosine metric)
6. Filter by `SEARCH_SIMILARITY_THRESHOLD`
7. Filter full_context inclusion by `SEARCH_FULL_CONTEXT_SIMILARITY_THRESHOLD`
8. Aggregate token counts, respect `SEARCH_CONTEXT_TOKEN_LIMIT`
9. Return results with similarity scores

### Commands

#### search
* Syntax: `envoy knowledge search <index_name> <query>`
* index_name: the name of the index to search (docs, curator)
* query: **Must be a descriptive phrase, not keywords.** Sentence-transformers require semantic context.
  * ✓ Good: "how to handle API authentication", "react component state management patterns"
  * ✗ Bad: "auth", "components", "testing"
* Process:
  1. Load index + metadata
  2. Embed query using web-ai TextModel
  3. Search USearch for k=50 candidates
  4. Convert distances to similarities
  5. Filter by SEARCH_SIMILARITY_THRESHOLD
  6. Get token count from metadata
  7. Include full_context for results above SEARCH_FULL_CONTEXT_SIMILARITY_THRESHOLD
  8. Respect SEARCH_CONTEXT_TOKEN_LIMIT for total returned context
* Returns: `{ success: true, message: "Search completed", results: [{ resource_path, similarity, token_count, description, relevant_files, full_resource_context? }] }`

#### reindex-all
* Syntax: `envoy knowledge reindex-all [--index_name <name>]`
* Process:
  1. Clear existing index + metadata files (for specified index or all)
  2. Discover all files matching index config (paths, extensions, excludes)
  3. Create new USearch index with config: `{ dimensions: 768, metric: 'cos', connectivity: 16 }`
  4. For each file: parse front-matter, embed full content, add to index + metadata
  5. Save index + metadata to disk
* Returns: `{ success: true, message: "Index reindexed", stats: { files_indexed, total_tokens } }`

#### reindex-from-changes
* Syntax: `envoy knowledge reindex-from-changes <index_name> --files <json_array>`
* files: `[{ path: string, added: boolean, deleted: boolean, modified: boolean }]`
* Process:
  1. Load existing index + metadata
  2. For deleted files: remove from index (by ID lookup) and metadata
  3. For added/modified files:
     - Parse front-matter with gray-matter
     - Scan body for file path references (regex for common patterns)
     - Validate each referenced file exists in codebase
     - If missing: **fail with list of missing files** (commit should abort)
     - If valid: auto-populate `relevant_files` in front-matter, write back
     - Embed content, add/update in index + metadata
  4. Save index + metadata
* Returns: `{ success: boolean, message: string, missing_references?: [{doc_path, missing_files}], files: [...] }`

### ENV Variables (from settings.json)
```
SEARCH_SIMILARITY_THRESHOLD=0.7          # minimum similarity to return (0-1, cosine)
SEARCH_CONTEXT_TOKEN_LIMIT=8000          # max tokens in aggregated results
SEARCH_FULL_CONTEXT_SIMILARITY_THRESHOLD=0.85  # threshold for full file content
```

### Initialization (envoy startup)
On envoy initialization:
1. Ensure `.knowledge/` directory exists
2. Check if indexes exist and are valid
3. If missing or corrupted, run `reindex-all` for affected indexes
4. Block until indexing complete (sync operation)

---

## Cross-Phase Context

### Documentation-First Implementation (CLAUDE.md Directive)
Before any implementation task (feature, fix, refactor), agents MUST call `envoy knowledge search docs "<task summary>"` to discover:
* Existing patterns/practices for similar functionality
* Related implementations already in codebase
* Most relevant files to read for context pre-implementation

This applies even when planning workflow is bypassed - ensures agents leverage indexed knowledge rather than guessing or re-discovering patterns.

**Query format**: Use descriptive phrases, not keywords. The sentence-transformer model requires semantic context.
Query should capture: task type, affected domain, key requirements (e.g., "auth middleware validation", "API error handling pattern", "React form state management")

### Discovery Protocol (Phase 9)
Step 1 of discovery protocol: **Query documentation first**: Call `envoy knowledge search docs "<requirements summary>"` to find existing patterns, decisions, and practices relevant to this task.

### Documentor Agent Workflows (Phase 10)
* **extract-workflow** step 2: Search existing docs: `envoy knowledge search docs "<prompt description>"`
* **SHARED PRACTICES**: Search-existing-first: ALWAYS query existing docs before writing

### Git Hooks (Phase 12)
* **On checkout**: run `envoy knowledge reindex-all` to reindex all indexes
* **On commit**: Call `envoy knowledge reindex-from-changes --files <files>` using all changed files

### Documentation File Structure
Documents in docs/ should have:
* Front-matter: `description` (required - summarizes key decisions, patterns, focus areas)
* Front-matter: `relevant_files` (auto-populated by commit hook via reindex-from-changes, NOT written by documentor)
* Body: Full document content with inline file path references to codebase

---

## File Reference Detection (for reindex-from-changes)

Regex patterns to detect file references in document body:
```typescript
const FILE_REF_PATTERNS = [
  /`([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)`/g,           // `path/to/file.ext`
  /\[.*?\]\(([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)\)/g,  // [text](path/to/file.ext)
  /(?:src|lib|components|utils|hooks|services)\/[a-zA-Z0-9_\-./]+\.[a-zA-Z]+/g  // common path patterns
];
```

Validation: For each detected path, check `fs.existsSync(projectRoot + '/' + path)`.

---

## Success Criteria
- [ ] `.claude/envoy/.knowledge/` directory created and gitignored
- [ ] Index files created for `docs` and `curator` indexes (`.usearch` binary + `.meta.json`)
- [ ] `envoy knowledge search docs "<query>"` returns relevant results with similarity scores
- [ ] `envoy knowledge search curator "<query>"` returns .claude/ file results
- [ ] Results respect similarity thresholds from ENV
- [ ] Results respect token limits from ENV
- [ ] `envoy knowledge reindex-all` rebuilds indexes
- [ ] `envoy knowledge reindex-from-changes` updates indexes incrementally
- [ ] File reference validation catches missing files in docs
- [ ] `relevant_files` auto-populated on valid docs
- [ ] First model load caches ONNX files for subsequent runs

---

## Implementation Notes

### web-ai Model Loading
First invocation downloads the model (~100-400MB depending on model). Model files are cached by web-ai in its default cache location or can be configured. Subsequent runs load from cache.

```typescript
import { TextModel } from '@visheratin/web-ai-node/text';

// This downloads on first run, caches for future
const model = await (await TextModel.create('gtr-t5-quant')).model;
const embedding = await model.process(text);
// embedding.result is number[] of dimension 768
```

### USearch Index Creation
```typescript
import usearch from 'usearch';

const index = new usearch.Index({
  dimensions: 768,
  metric: 'cos',        // Cosine similarity
  connectivity: 16,     // HNSW graph connectivity
  quantization: 'f32',  // Float32 precision
});

// Add vector (BigInt key required)
index.add(0n, new Float32Array(embedding));

// Search
const { keys, distances } = index.search(new Float32Array(queryEmbedding), 10);
// keys: BigUint64Array [0n, 5n, 12n, ...]
// distances: Float32Array [0.15, 0.28, 0.41, ...] (cosine distances)

// Persist
index.save('.knowledge/docs.usearch');

// Load (sessionless - each CLI call loads fresh)
const loadedIndex = new usearch.Index({
  dimensions: 768,
  metric: 'cos',
  connectivity: 16,
  quantization: 'f32',
});
loadedIndex.load('.knowledge/docs.usearch');
```

### Distance to Similarity Conversion
USearch with `metric: 'cos'` returns cosine distance (0 = identical, 2 = opposite).
Convert to similarity (0-1 scale):
```typescript
function distanceToSimilarity(distance: number): number {
  // Cosine distance: 0 = identical, 1 = orthogonal, 2 = opposite
  // Convert to similarity: 1 = identical, 0 = orthogonal, -1 = opposite
  return 1 - distance;
}
```

### Token Counting via Repomix
```bash
npx repomix --include "path/to/file.md" --no-output
# Parse stdout for token count
```
