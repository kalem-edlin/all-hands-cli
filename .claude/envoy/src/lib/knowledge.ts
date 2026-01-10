/**
 * KnowledgeService - USearch-based semantic search for documentation.
 * Uses @visheratin/web-ai-node for embeddings and usearch for HNSW indexing.
 */

import { createHash } from "crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import matter from "gray-matter";
import { createRequire } from "module";
import { basename, extname, join, relative } from "path";
import { Index, MetricKind, ScalarKind } from "usearch";

// Create require function for ESM compatibility (needed for fetch caching)
const require = createRequire(import.meta.url);

// Types
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

interface SearchResult {
  resource_path: string;
  similarity: number;
  token_count: number;
  description: string;
  relevant_files: string[];
  full_resource_context?: string;
}

interface ReindexResult {
  files_indexed: number;
  total_tokens: number;
}

interface FileChange {
  path: string;
  added?: boolean;
  deleted?: boolean;
  modified?: boolean;
}

interface IndexConfig {
  name: string;
  paths: string[];
  extensions: string[];
  description: string;
  /** Whether this index expects front-matter with description/relevant_files */
  hasFrontmatter: boolean;
}

// Docs index configuration (only supported index)
const DOCS_CONFIG: IndexConfig = {
  name: "docs",
  paths: ["docs/"],
  extensions: [".md"],
  description: "Project documentation",
  hasFrontmatter: true,
};

// File reference patterns for auto-populating relevant_files
const FILE_REF_PATTERNS = [
  /`([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)`/g,
  /\[.*?\]\(([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)\)/g,
  /(?:src|lib|components|utils|hooks|services)\/[a-zA-Z0-9_\-./]+\.[a-zA-Z]+/g,
];

// Environment config with defaults
const SEARCH_SIMILARITY_THRESHOLD = parseFloat(
  process.env.SEARCH_SIMILARITY_THRESHOLD ?? "0.65"
);
const SEARCH_CONTEXT_TOKEN_LIMIT = parseInt(
  process.env.SEARCH_CONTEXT_TOKEN_LIMIT ?? "5000",
  10
);
const SEARCH_FULL_CONTEXT_SIMILARITY_THRESHOLD = parseFloat(
  process.env.SEARCH_FULL_CONTEXT_SIMILARITY_THRESHOLD ?? "0.82"
);

export class KnowledgeService {
  private model: unknown = null;
  private readonly knowledgeDir: string;
  private readonly projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.knowledgeDir = join(projectRoot, ".claude", "envoy", ".knowledge");
  }

  /**
   * Ensure .knowledge/ directory exists
   */
  ensureDir(): void {
    if (!existsSync(this.knowledgeDir)) {
      mkdirSync(this.knowledgeDir, { recursive: true });
    }
  }

  /**
   * Get model cache directory
   */
  private getModelCacheDir(): string {
    return join(this.knowledgeDir, "models");
  }

  /**
   * Install caching wrapper for node-fetch (must call before importing web-ai-node)
   */
  private installFetchCache(): void {
    const cacheDir = this.getModelCacheDir();
    if (!existsSync(cacheDir)) {
      mkdirSync(cacheDir, { recursive: true });
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeFetchModule = require("node-fetch");
    const originalFetch = nodeFetchModule.default || nodeFetchModule;

    // Skip if already patched
    if ((originalFetch as { __cached?: boolean }).__cached) return;

    const self = this;
    const cachedFetch = async function (url: string, init?: RequestInit) {
      // Only cache model files
      if (!url.includes("web-ai-models.org") && !url.includes(".onnx")) {
        return originalFetch(url, init);
      }

      const urlHash = createHash("md5").update(url).digest("hex").slice(0, 8);
      const fileName = `${urlHash}-${basename(url)}`;
      const cachePath = join(self.getModelCacheDir(), fileName);

      if (existsSync(cachePath)) {
        console.error(`[knowledge] Using cached model: ${fileName}`);
        const data = readFileSync(cachePath);
        // Return a mock response with arrayBuffer method
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
        };
      }

      console.error(`[knowledge] Downloading model: ${basename(url)}`);
      const response = await originalFetch(url, init);
      if (!response.ok) {
        return response;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      writeFileSync(cachePath, buffer);
      console.error(`[knowledge] Cached model: ${fileName} (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`);

      // Return a mock response since we consumed the original
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => arrayBuffer,
      };
    };

    (cachedFetch as { __cached?: boolean }).__cached = true;

    // Patch the module's default export
    if (nodeFetchModule.default) {
      nodeFetchModule.default = cachedFetch;
    }
    // Also patch require.cache
    const cacheKey = require.resolve("node-fetch");
    if (require.cache[cacheKey]) {
      require.cache[cacheKey]!.exports = cachedFetch;
      require.cache[cacheKey]!.exports.default = cachedFetch;
    }
  }

  /**
   * Lazy-load embedding model with local caching
   */
  async getModel(): Promise<unknown> {
    if (this.model) return this.model;

    this.ensureDir();
    console.error("[knowledge] Loading embedding model...");
    const startTime = Date.now();

    // Install caching before importing the library
    this.installFetchCache();

    const { TextModel } = await import("@visheratin/web-ai-node/text");
    const modelResult = await TextModel.create("gtr-t5-quant");
    this.model = modelResult.model;

    console.error(`[knowledge] Model loaded in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    return this.model;
  }

  /**
   * Generate embedding for text
   */
  async embed(text: string): Promise<Float32Array> {
    const model = await this.getModel();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (model as any).process(text);
    return new Float32Array(result.result);
  }


  /**
   * Convert cosine distance to similarity (0-1 scale)
   * Cosine distance: 0 = identical, 1 = orthogonal, 2 = opposite
   */
  distanceToSimilarity(distance: number): number {
    return 1 - distance / 2;
  }

  /**
   * Get index file paths
   */
  private getIndexPaths(): { index: string; meta: string } {
    return {
      index: join(this.knowledgeDir, "docs.usearch"),
      meta: join(this.knowledgeDir, "docs.meta.json"),
    };
  }

  /**
   * Create empty index metadata
   */
  private createEmptyMetadata(): IndexMetadata {
    return {
      id_to_path: {},
      path_to_id: {},
      documents: {},
      next_id: 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Create a new USearch index
   */
  private createIndex(): Index {
    return new Index(
      768,                // dimensions
      MetricKind.Cos,     // metric
      ScalarKind.F32,     // quantization
      16                  // connectivity
    );
  }

  /**
   * Load index + metadata from disk
   */
  async loadIndex(): Promise<{ index: Index; meta: IndexMetadata }> {
    const paths = this.getIndexPaths();

    if (!existsSync(paths.index) || !existsSync(paths.meta)) {
      return {
        index: this.createIndex(),
        meta: this.createEmptyMetadata(),
      };
    }

    const index = this.createIndex();
    index.load(paths.index);

    const meta: IndexMetadata = JSON.parse(readFileSync(paths.meta, "utf-8"));
    return { index, meta };
  }

  /**
   * Save index + metadata to disk
   */
  async saveIndex(index: Index, meta: IndexMetadata): Promise<void> {
    this.ensureDir();
    const paths = this.getIndexPaths();

    meta.lastUpdated = new Date().toISOString();
    index.save(paths.index);
    writeFileSync(paths.meta, JSON.stringify(meta, null, 2));
  }

  /**
   * Estimate token count (rough approximation: 1 token ≈ 4 chars)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Discover files for an index based on config
   */
  private discoverFiles(config: IndexConfig): string[] {
    const files: string[] = [];

    for (const configPath of config.paths) {
      const fullPath = join(this.projectRoot, configPath);

      if (!existsSync(fullPath)) continue;

      const stat = statSync(fullPath);
      if (stat.isFile()) {
        if (config.extensions.includes(extname(fullPath))) {
          files.push(configPath);
        }
      } else if (stat.isDirectory()) {
        this.walkDir(fullPath, config.extensions, files, this.projectRoot);
      }
    }

    return files;
  }

  /**
   * Recursively walk directory and collect files
   */
  private walkDir(
    dir: string,
    extensions: string[],
    files: string[],
    projectRoot: string
  ): void {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules and hidden dirs (except .claude)
        if (entry.name === "node_modules" || (entry.name.startsWith(".") && entry.name !== ".claude")) {
          continue;
        }
        this.walkDir(fullPath, extensions, files, projectRoot);
      } else if (entry.isFile() && extensions.includes(extname(entry.name))) {
        files.push(relative(projectRoot, fullPath));
      }
    }
  }

  /**
   * Extract file references from document content
   */
  private extractFileReferences(content: string): string[] {
    const refs = new Set<string>();

    for (const pattern of FILE_REF_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(content)) !== null) {
        const ref = match[1] || match[0];
        if (ref && !ref.startsWith("http") && !ref.startsWith("#")) {
          refs.add(ref);
        }
      }
    }

    return Array.from(refs);
  }

  /**
   * Validate file references exist
   */
  private validateFileReferences(refs: string[]): { valid: string[]; missing: string[] } {
    const valid: string[] = [];
    const missing: string[] = [];

    for (const ref of refs) {
      const fullPath = join(this.projectRoot, ref);
      if (existsSync(fullPath)) {
        valid.push(ref);
      } else {
        missing.push(ref);
      }
    }

    return { valid, missing };
  }

  /**
   * Index a single document
   */
  async indexDocument(
    index: Index,
    meta: IndexMetadata,
    path: string,
    content: string,
    frontMatterData: Record<string, unknown>
  ): Promise<bigint> {
    // Assign or reuse ID
    let id: bigint;
    if (meta.path_to_id[path]) {
      id = BigInt(meta.path_to_id[path]);
    } else {
      id = BigInt(meta.next_id++);
      meta.id_to_path[id.toString()] = path;
      meta.path_to_id[path] = id.toString();
    }

    // Generate embedding
    const embedding = await this.embed(content);

    // Add to index
    index.add(id, embedding);

    // Store metadata
    meta.documents[path] = {
      description: (frontMatterData.description as string) || "",
      relevant_files: (frontMatterData.relevant_files as string[]) || [],
      token_count: this.estimateTokens(content),
    };

    return id;
  }

  /**
   * Search docs index with similarity computation
   * @param metadataOnly - If true, only return file paths and descriptions (no full_resource_context)
   */
  async search(query: string, k: number = 50, metadataOnly: boolean = false): Promise<SearchResult[]> {
    const { index, meta } = await this.loadIndex();

    if (Object.keys(meta.documents).length === 0) {
      return [];
    }

    // Generate query embedding
    const queryEmbedding = await this.embed(query);

    // Search (1 thread for CLI usage)
    const searchResult = index.search(queryEmbedding, k, 1);
    const keys = searchResult.keys;
    const distances = searchResult.distances;

    // Convert to results
    const results: SearchResult[] = [];
    let totalTokens = 0;

    for (let i = 0; i < keys.length; i++) {
      const id = keys[i].toString();
      const distance = distances[i];
      const similarity = this.distanceToSimilarity(distance);

      // Filter by threshold
      if (similarity < SEARCH_SIMILARITY_THRESHOLD) continue;

      const path = meta.id_to_path[id];
      if (!path) continue;

      const docMeta = meta.documents[path];
      if (!docMeta) continue;

      // Check token limit
      if (totalTokens + docMeta.token_count > SEARCH_CONTEXT_TOKEN_LIMIT) continue;
      totalTokens += docMeta.token_count;

      const result: SearchResult = {
        resource_path: path,
        similarity,
        token_count: docMeta.token_count,
        description: docMeta.description,
        relevant_files: docMeta.relevant_files,
      };

      // Include full context for high-similarity results (unless metadata-only mode)
      if (!metadataOnly && similarity >= SEARCH_FULL_CONTEXT_SIMILARITY_THRESHOLD) {
        const fullPath = join(this.projectRoot, path);
        if (existsSync(fullPath)) {
          result.full_resource_context = readFileSync(fullPath, "utf-8");
        }
      }

      results.push(result);
    }

    return results;
  }

  /**
   * Full reindex of docs
   */
  async reindexAll(): Promise<ReindexResult> {
    this.ensureDir();
    const startTime = Date.now();
    console.error("[knowledge] Reindexing docs...");

    // Create fresh index
    const index = this.createIndex();
    const meta = this.createEmptyMetadata();

    // Discover and index files
    const files = this.discoverFiles(DOCS_CONFIG);
    console.error(`[knowledge] Found ${files.length} files`);
    let totalTokens = 0;

    for (let i = 0; i < files.length; i++) {
      const filePath = files[i];
      const fullPath = join(this.projectRoot, filePath);
      const content = readFileSync(fullPath, "utf-8");

      // Parse front-matter
      let frontMatter: Record<string, unknown> = {};
      if (filePath.endsWith(".md")) {
        try {
          const parsed = matter(content);
          frontMatter = parsed.data;
        } catch {
          // Skip files with invalid front-matter
        }
      }

      console.error(`[knowledge] Embedding ${i + 1}/${files.length}: ${filePath}`);
      await this.indexDocument(index, meta, filePath, content, frontMatter);
      totalTokens += meta.documents[filePath].token_count;
    }

    // Save
    await this.saveIndex(index, meta);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[knowledge] Reindex complete: ${files.length} files, ${totalTokens} tokens in ${duration}s`);

    return {
      files_indexed: files.length,
      total_tokens: totalTokens,
    };
  }

  /**
   * Incremental reindex from changed files
   */
  async reindexFromChanges(changes: FileChange[]): Promise<{
    success: boolean;
    message: string;
    missing_references?: { doc_path: string; missing_files: string[] }[];
    files: { path: string; action: string }[];
  }> {
    console.error(`[knowledge] Incremental reindex: ${changes.length} change(s)`);
    const startTime = Date.now();

    const { index, meta } = await this.loadIndex();
    const processedFiles: { path: string; action: string }[] = [];
    const missingReferences: { doc_path: string; missing_files: string[] }[] = [];

    for (const change of changes) {
      const { path, added, deleted, modified } = change;

      // Check if file matches docs config
      const matchesConfig = DOCS_CONFIG.paths.some((p: string) => path.startsWith(p)) &&
        DOCS_CONFIG.extensions.includes(extname(path));

      if (!matchesConfig) continue;

      if (deleted) {
        // Remove from index
        const id = meta.path_to_id[path];
        if (id) {
          // Note: USearch doesn't have a remove method in basic API
          // We mark as deleted in metadata
          delete meta.id_to_path[id];
          delete meta.path_to_id[path];
          delete meta.documents[path];
          processedFiles.push({ path, action: "deleted" });
          console.error(`[knowledge] Deleted: ${path}`);
        }
      } else if (added || modified) {
        const fullPath = join(this.projectRoot, path);
        if (!existsSync(fullPath)) continue;

        const content = readFileSync(fullPath, "utf-8");
        let frontMatter: Record<string, unknown> = {};

        // Process front-matter and file references
        if (path.endsWith(".md")) {
          try {
            const parsed = matter(content);
            frontMatter = parsed.data;

            // Extract and validate file references
            const refs = this.extractFileReferences(parsed.content);
            const { valid, missing } = this.validateFileReferences(refs);

            if (missing.length > 0) {
              missingReferences.push({ doc_path: path, missing_files: missing });
            }

            // Auto-populate relevant_files
            if (valid.length > 0) {
              frontMatter.relevant_files = valid;
              // Write back with updated front-matter
              const newContent = matter.stringify(parsed.content, frontMatter);
              writeFileSync(fullPath, newContent);
            }
          } catch {
            // Skip files with invalid front-matter
          }
        }

        // Index document
        const action = added ? "added" : "modified";
        console.error(`[knowledge] Embedding (${action}): ${path}`);
        await this.indexDocument(index, meta, path, content, frontMatter);
        processedFiles.push({ path, action });
      }
    }

    // Save updated index
    await this.saveIndex(index, meta);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[knowledge] Incremental reindex complete: ${processedFiles.length} file(s) in ${duration}s`);

    if (missingReferences.length > 0) {
      return {
        success: false,
        message: "Documents contain references to missing files",
        missing_references: missingReferences,
        files: processedFiles,
      };
    }

    return {
      success: true,
      message: "Index updated successfully",
      files: processedFiles,
    };
  }

  /**
   * Check if docs index exists
   */
  async checkIndex(): Promise<{ exists: boolean }> {
    const paths = this.getIndexPaths();
    return { exists: existsSync(paths.index) && existsSync(paths.meta) };
  }
}

export type { DocumentMeta, FileChange, IndexMetadata, ReindexResult, SearchResult };

