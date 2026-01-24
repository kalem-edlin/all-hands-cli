/**
 * KnowledgeService - USearch-based semantic search for documentation.
 * Uses @visheratin/web-ai-node for embeddings and usearch for HNSW indexing.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import matter from "gray-matter";
import { basename, extname, join, relative } from "path";
import { Index, MetricKind, ScalarKind } from "usearch";

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
  /** Whether to strip frontmatter from content before embedding */
  stripFrontmatter?: boolean;
}

// Index configurations
const INDEX_CONFIGS: Record<string, IndexConfig> = {
  docs: {
    name: "docs",
    paths: ["docs/", "specs/"],
    extensions: [".md"],
    description: "Project documentation and specifications",
    hasFrontmatter: true,
    stripFrontmatter: true,
  },
  roadmap: {
    name: "roadmap",
    paths: ["specs/roadmap/"],
    extensions: [".md"],
    description: "Roadmap specifications (planned work)",
    hasFrontmatter: true,
    stripFrontmatter: true,
  },
};

export type IndexName = keyof typeof INDEX_CONFIGS;

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
  private readonly quiet: boolean;

  constructor(projectRoot: string, options?: { quiet?: boolean }) {
    this.projectRoot = projectRoot;
    this.quiet = options?.quiet ?? false;
    // Store knowledge index in .allhands/.knowledge
    this.knowledgeDir = join(projectRoot, ".allhands", ".knowledge");
  }

  private log(message: string): void {
    if (!this.quiet) {
      console.error(message);
    }
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
   * Lazy-load embedding model
   * Note: web-ai-node handles its own model caching
   */
  async getModel(): Promise<unknown> {
    if (this.model) return this.model;

    this.ensureDir();
    this.log("[knowledge] Loading embedding model...");
    const startTime = Date.now();

    const { TextModel } = await import("@visheratin/web-ai-node/text");
    const modelResult = await TextModel.create("gtr-t5-quant");
    this.model = modelResult.model;

    this.log(`[knowledge] Model loaded in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
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
   * Get index file paths for a specific index
   */
  private getIndexPaths(indexName: IndexName): { index: string; meta: string } {
    return {
      index: join(this.knowledgeDir, `${indexName}.usearch`),
      meta: join(this.knowledgeDir, `${indexName}.meta.json`),
    };
  }

  /**
   * Get config for a specific index
   */
  private getIndexConfig(indexName: IndexName): IndexConfig {
    const config = INDEX_CONFIGS[indexName];
    if (!config) {
      throw new Error(`Unknown index: ${indexName}. Available: ${Object.keys(INDEX_CONFIGS).join(", ")}`);
    }
    return config;
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
  async loadIndex(indexName: IndexName): Promise<{ index: Index; meta: IndexMetadata }> {
    const paths = this.getIndexPaths(indexName);

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
  async saveIndex(indexName: IndexName, index: Index, meta: IndexMetadata): Promise<void> {
    this.ensureDir();
    const paths = this.getIndexPaths(indexName);

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
        // Skip node_modules and hidden dirs (except .allhands)
        if (entry.name === "node_modules" || (entry.name.startsWith(".") && entry.name !== ".allhands")) {
          continue;
        }
        this.walkDir(fullPath, extensions, files, projectRoot);
      } else if (entry.isFile() && extensions.includes(extname(entry.name))) {
        // Exclude README.md from docs indexing
        if (entry.name === "README.md") continue;
        files.push(relative(projectRoot, fullPath));
      }
    }
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
    // Assign or reuse ID, removing old entry if exists
    let id: bigint;
    if (meta.path_to_id[path]) {
      id = BigInt(meta.path_to_id[path]);
      // Remove old entry before re-adding (usearch doesn't allow duplicate keys)
      index.remove(id);
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
   * Search an index with similarity computation
   * @param indexName - Which index to search (docs, specs)
   * @param query - Search query
   * @param k - Max results to return
   * @param metadataOnly - If true, only return file paths and descriptions (no full_resource_context)
   */
  async search(indexName: IndexName, query: string, k: number = 50, metadataOnly: boolean = false): Promise<SearchResult[]> {
    const { index, meta } = await this.loadIndex(indexName);

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
   * Full reindex of a specific index
   */
  async reindexAll(indexName: IndexName): Promise<ReindexResult> {
    this.ensureDir();
    const config = this.getIndexConfig(indexName);
    const startTime = Date.now();
    this.log(`[knowledge] Reindexing ${indexName}...`);

    // Create fresh index
    const index = this.createIndex();
    const meta = this.createEmptyMetadata();

    // Discover and index files
    const files = this.discoverFiles(config);
    this.log(`[knowledge] Found ${files.length} files`);
    let totalTokens = 0;

    for (let i = 0; i < files.length; i++) {
      const filePath = files[i];
      const fullPath = join(this.projectRoot, filePath);
      const rawContent = readFileSync(fullPath, "utf-8");

      // Parse front-matter
      let frontMatter: Record<string, unknown> = {};
      let contentForEmbedding = rawContent;

      if (filePath.endsWith(".md")) {
        try {
          const parsed = matter(rawContent);
          frontMatter = parsed.data;
          // Strip frontmatter from content for embedding if configured
          if (config.stripFrontmatter) {
            contentForEmbedding = parsed.content;
          }
        } catch {
          // Skip files with invalid front-matter
        }
      }

      this.log(`[knowledge] Embedding ${i + 1}/${files.length}: ${filePath}`);
      await this.indexDocument(index, meta, filePath, contentForEmbedding, frontMatter);
      totalTokens += meta.documents[filePath].token_count;
    }

    // Save
    await this.saveIndex(indexName, index, meta);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    this.log(`[knowledge] Reindex complete: ${files.length} files, ${totalTokens} tokens in ${duration}s`);

    return {
      files_indexed: files.length,
      total_tokens: totalTokens,
    };
  }

  /**
   * Reindex all configured indexes
   */
  async reindexAllIndexes(): Promise<Record<string, ReindexResult>> {
    const results: Record<string, ReindexResult> = {};
    for (const indexName of Object.keys(INDEX_CONFIGS) as IndexName[]) {
      results[indexName] = await this.reindexAll(indexName);
    }
    return results;
  }

  /**
   * Incremental reindex from changed files for a specific index
   */
  async reindexFromChanges(indexName: IndexName, changes: FileChange[]): Promise<{
    success: boolean;
    message: string;
    files: { path: string; action: string }[];
  }> {
    const config = this.getIndexConfig(indexName);
    this.log(`[knowledge] Incremental reindex (${indexName}): ${changes.length} change(s)`);
    const startTime = Date.now();

    const { index, meta } = await this.loadIndex(indexName);
    const processedFiles: { path: string; action: string }[] = [];

    for (const change of changes) {
      const { path, added, deleted, modified } = change;

      // Check if file matches config (excluding README.md)
      const matchesConfig = config.paths.some((p: string) => path.startsWith(p)) &&
        config.extensions.includes(extname(path)) &&
        basename(path) !== "README.md";

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
          this.log(`[knowledge] Deleted: ${path}`);
        }
      } else if (added || modified) {
        const fullPath = join(this.projectRoot, path);
        if (!existsSync(fullPath)) continue;

        const rawContent = readFileSync(fullPath, "utf-8");
        let frontMatter: Record<string, unknown> = {};
        let contentForEmbedding = rawContent;

        // Process front-matter
        if (path.endsWith(".md")) {
          try {
            const parsed = matter(rawContent);
            frontMatter = parsed.data;
            // Strip frontmatter from content for embedding if configured
            if (config.stripFrontmatter) {
              contentForEmbedding = parsed.content;
            }
          } catch {
            // Skip files with invalid front-matter
          }
        }

        // Index document
        const action = added ? "added" : "modified";
        this.log(`[knowledge] Embedding (${action}): ${path}`);
        await this.indexDocument(index, meta, path, contentForEmbedding, frontMatter);
        processedFiles.push({ path, action });
      }
    }

    // Save updated index
    await this.saveIndex(indexName, index, meta);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    this.log(`[knowledge] Incremental reindex complete: ${processedFiles.length} file(s) in ${duration}s`);

    return {
      success: true,
      message: "Index updated successfully",
      files: processedFiles,
    };
  }

  /**
   * Check if a specific index exists
   */
  async checkIndex(indexName: IndexName): Promise<{ exists: boolean }> {
    const paths = this.getIndexPaths(indexName);
    return { exists: existsSync(paths.index) && existsSync(paths.meta) };
  }

  /**
   * Check status of all indexes
   */
  async checkAllIndexes(): Promise<Record<string, { exists: boolean }>> {
    const results: Record<string, { exists: boolean }> = {};
    for (const indexName of Object.keys(INDEX_CONFIGS) as IndexName[]) {
      results[indexName] = await this.checkIndex(indexName);
    }
    return results;
  }

  /**
   * Get available index names
   */
  static getIndexNames(): string[] {
    return Object.keys(INDEX_CONFIGS);
  }
}

export { INDEX_CONFIGS };
export type { DocumentMeta, FileChange, IndexMetadata, ReindexResult, SearchResult };
