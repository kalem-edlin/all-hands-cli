/**
 * Documentation validation utilities.
 *
 * Validates references in documentation files against the actual codebase
 * using git blob hashes for staleness detection.
 *
 * Reference formats:
 *   [ref:file:symbol:hash] - Symbol reference (symbol is an author-provided label)
 *   [ref:file::hash]       - File-only reference
 *
 * Where hash = git blob hash (content-addressable, stable across merges/rebases)
 */

import { spawnSync } from "child_process";
import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { join, relative } from "path";
import matter from "gray-matter";

/**
 * Validation cache for faster repeated validation runs.
 */
interface ValidationCache {
  lastRun: string;
  /** Map of doc path -> content hash */
  docChecksums: Record<string, string>;
  /** Map of doc path -> last validation issues (empty if clean) */
  docIssues: Record<string, DocFileIssues>;
  /** Map of referenced file path -> last known hash */
  refFileHashes: Record<string, string>;
}

const CACHE_DIR = ".allhands/harness/.cache";
const CACHE_FILE = "docs-validation.json";

/**
 * Get content hash for a file.
 */
function getContentHash(content: string): string {
  return createHash("md5").update(content).digest("hex").substring(0, 12);
}

/**
 * Load validation cache from disk.
 */
function loadValidationCache(projectRoot: string): ValidationCache | null {
  const cachePath = join(projectRoot, CACHE_DIR, CACHE_FILE);
  if (!existsSync(cachePath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(cachePath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Save validation cache to disk.
 */
function saveValidationCache(projectRoot: string, cache: ValidationCache): void {
  const cacheDir = join(projectRoot, CACHE_DIR);
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }
  const cachePath = join(cacheDir, CACHE_FILE);
  writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}

/**
 * Reference pattern matching both symbol and file-only refs.
 * Captures: [1]=file, [2]=symbol (empty for file-only), [3]=hash (min 7 chars)
 */
export const REF_PATTERN = /\[ref:([^:\]]+):([^:\]]*):([a-f0-9]{7,})\]/g;

/**
 * Placeholder hash patterns (fake/test hashes that should be replaced).
 */
export const PLACEHOLDER_PATTERN =
  /\[ref:[^\]]+:(abc123[0-9]?|123456[0-9]?|000000[0-9]?|hash[a-f0-9]{0,4}|test[a-f0-9]{0,4})\]/gi;

/**
 * Unfinalized ref pattern - refs without hashes that need to be finalized.
 * Matches [ref:file:symbol] or [ref:file] (no hash component).
 */
export const UNFINALIZED_REF_PATTERN = /\[ref:([^:\]]+)(?::([^\]]*))?\](?!:)/g;

/**
 * Parsed reference from documentation.
 */
export interface ParsedRef {
  /** Full match string [ref:...] */
  reference: string;
  /** Source file path (relative) */
  file: string;
  /** Symbol name (null for file-only refs) */
  symbol: string | null;
  /** Stored hash in the reference */
  hash: string;
  /** Whether this is a file-only ref */
  isFileOnly: boolean;
  /** Doc file containing this reference */
  docFile: string;
}

/**
 * Validation state for a reference.
 */
export type RefState = "valid" | "stale" | "invalid";

/**
 * Validated reference with state and details.
 */
export interface ValidatedRef extends ParsedRef {
  state: RefState;
  /** Reason for invalid/stale state */
  reason?: string;
  /** Current hash (for stale refs) */
  currentHash?: string;
}

/**
 * Issues found in a documentation file.
 */
export interface DocFileIssues {
  stale: Array<{
    reference: string;
    file_path: string;
    symbol_name: string | null;
    stored_hash: string;
    current_hash: string;
    ref_type: "symbol" | "file-only";
  }>;
  invalid: Array<{
    reference: string;
    reason: string;
  }>;
  frontmatter_error: string | null;
  placeholder_errors: string[];
  unfinalized_refs: string[];
  inline_code_block_count: number;
  has_capability_list_warning: boolean;
}

/**
 * Full validation result.
 */
export interface ValidationResult {
  message: string;
  total_files: number;
  total_refs: number;
  symbol_refs: number;
  file_only_refs: number;
  valid_count: number;
  frontmatter_error_count: number;
  stale_count: number;
  invalid_count: number;
  placeholder_error_count: number;
  unfinalized_ref_count: number;
  inline_code_error_count: number;
  capability_list_warning_count: number;
  by_doc_file: Record<string, DocFileIssues>;
  frontmatter_errors: Array<{ doc_file: string; reason: string }>;
  stale: Array<{
    doc_file: string;
    reference: string;
    stored_hash: string;
    current_hash: string;
    ref_type: "symbol" | "file-only";
  }>;
  invalid: Array<{ doc_file: string; reference: string; reason: string }>;
  placeholder_errors: Array<{
    doc_file: string;
    count: number;
    examples: string[];
    reason: string;
  }>;
  unfinalized_refs: Array<{
    doc_file: string;
    count: number;
    examples: string[];
    reason: string;
  }>;
  inline_code_errors: Array<{
    doc_file: string;
    block_count: number;
    reason: string;
  }>;
  capability_list_warnings: Array<{ doc_file: string; reason: string }>;
}

/**
 * Get the git blob hash for a file (content-addressable, stable across merges/rebases).
 * Uses `git rev-parse HEAD:<relative-path>` which returns the blob SHA for the file's content.
 */
export function getBlobHashForFile(
  filePath: string,
  cwd: string
): { hash: string; success: boolean } {
  // Normalize to repo-relative path
  const relPath = filePath.startsWith(cwd)
    ? relative(cwd, filePath)
    : filePath;

  const result = spawnSync("git", ["rev-parse", `HEAD:${relPath}`], {
    encoding: "utf-8",
    cwd,
  });

  if (result.status !== 0 || !result.stdout.trim()) {
    return { hash: "0000000", success: false };
  }

  return { hash: result.stdout.trim().substring(0, 7), success: true };
}

/**
 * Batch get git blob hashes for multiple files using a single `git ls-tree -r HEAD` call.
 * Much faster than calling getBlobHashForFile N times, and produces content-addressable
 * hashes that are stable across merges, rebases, and squash merges.
 */
export function batchGetBlobHashes(
  files: string[],
  cwd: string
): Map<string, { hash: string; success: boolean }> {
  const results = new Map<string, { hash: string; success: boolean }>();

  if (files.length === 0) {
    return results;
  }

  // Resolve git repo root (ls-tree paths are always repo-root-relative)
  const repoRootResult = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf-8",
    cwd,
  });
  const repoRoot = repoRootResult.status === 0
    ? repoRootResult.stdout.trim()
    : cwd;

  // Single git ls-tree call to get all blob hashes
  const lsResult = spawnSync(
    "git",
    ["ls-tree", "-r", "HEAD"],
    { encoding: "utf-8", cwd, maxBuffer: 10 * 1024 * 1024 }
  );

  // Build a map of repo-root-relative path -> 7-char blob hash
  const blobMap = new Map<string, string>();
  if (lsResult.status === 0 && lsResult.stdout) {
    for (const line of lsResult.stdout.trim().split("\n")) {
      if (!line) continue;
      // Format: <mode> <type> <sha>\t<path>
      const tabIdx = line.indexOf("\t");
      if (tabIdx === -1) continue;
      const path = line.substring(tabIdx + 1);
      const parts = line.substring(0, tabIdx).split(" ");
      if (parts.length >= 3 && parts[1] === "blob") {
        blobMap.set(path, parts[2].substring(0, 7));
      }
    }
  }

  // Compute prefix to convert cwd-relative paths to repo-root-relative paths
  const cwdPrefix = cwd !== repoRoot ? relative(repoRoot, cwd) : "";

  // Look up each requested file in the blob map
  for (const file of files) {
    // Normalize file path to repo-root-relative
    let repoRelPath: string;
    if (file.startsWith("/")) {
      repoRelPath = relative(repoRoot, file);
    } else if (cwdPrefix) {
      repoRelPath = join(cwdPrefix, file);
    } else {
      repoRelPath = file;
    }

    const hash = blobMap.get(repoRelPath);
    if (hash) {
      results.set(file, { hash, success: true });
    } else {
      // Fall back to individual lookup for misses (e.g., submodules, unusual paths)
      results.set(file, getBlobHashForFile(file, cwd));
    }
  }

  return results;
}

/**
 * Extract all references from markdown content.
 */
export function extractRefs(content: string, docFile: string): ParsedRef[] {
  const refs: ParsedRef[] = [];

  // Reset regex state
  REF_PATTERN.lastIndex = 0;

  let match;
  while ((match = REF_PATTERN.exec(content)) !== null) {
    const isFileOnly = match[2] === "";
    refs.push({
      reference: match[0],
      file: match[1],
      symbol: isFileOnly ? null : match[2],
      hash: match[3],
      isFileOnly,
      docFile,
    });
  }

  return refs;
}

/**
 * Validate front matter in a markdown file.
 */
export function validateFrontMatter(
  content: string
): { valid: boolean; error?: string } {
  // Must start with ---
  if (!content.startsWith("---")) {
    return { valid: false, error: "Missing front matter (file must start with ---)" };
  }

  try {
    const parsed = matter(content);

    // Check for required description field
    if (parsed.data.description === undefined || parsed.data.description === null) {
      return {
        valid: false,
        error: "Missing 'description' field in front matter",
      };
    }

    if (typeof parsed.data.description !== "string") {
      return {
        valid: false,
        error: "Invalid 'description' field in front matter (must be a string)",
      };
    }

    if (parsed.data.description.trim() === "") {
      return { valid: false, error: "Empty 'description' field in front matter" };
    }

    // Validate relevant_files if present
    if (
      parsed.data.relevant_files !== undefined &&
      !Array.isArray(parsed.data.relevant_files)
    ) {
      return { valid: false, error: "'relevant_files' must be an array" };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid front matter syntax" };
  }
}

/**
 * Detect placeholder hashes in content (fake hashes like abc1234).
 */
export function detectPlaceholders(content: string): string[] {
  // Reset regex state
  PLACEHOLDER_PATTERN.lastIndex = 0;

  const matches = content.match(PLACEHOLDER_PATTERN);
  return matches || [];
}

/**
 * Detect unfinalized refs in content (refs without hashes).
 * These are refs like [ref:file:symbol] or [ref:file] that haven't been finalized.
 */
export function detectUnfinalizedRefs(content: string): string[] {
  const results: string[] = [];
  UNFINALIZED_REF_PATTERN.lastIndex = 0;

  let match;
  while ((match = UNFINALIZED_REF_PATTERN.exec(content)) !== null) {
    const fullMatch = match[0];
    // Check if this looks like a finalized ref (has 3+ colons with hash)
    // Finalized refs have format [ref:file:symbol:hash] or [ref:file::hash]
    const colonCount = (fullMatch.match(/:/g) || []).length;
    const hasHash = /:[a-f0-9]{7,}\]$/.test(fullMatch);
    if (!hasHash && colonCount < 3) {
      results.push(fullMatch);
    }
  }
  return results;
}

/**
 * Count fenced code blocks in content.
 */
export function countCodeBlocks(content: string): number {
  // Count complete fenced code blocks by matching open and close pairs
  // Pattern: ```[lang]\n...content...\n```
  const pattern = /^```[a-z0-9_+-]*\r?\n[\s\S]*?^```$/gm;
  const matches = content.match(pattern);
  return matches ? matches.length : 0;
}

/**
 * Detect capability list tables.
 */
export function hasCapabilityList(content: string): boolean {
  // Detect markdown tables that look like capability/command listings
  // Match lines that have Command|Option|Flag in one column and Purpose|Description in another
  const pattern =
    /\|\s*(Command|Option|Flag)\s*\|.*?(Purpose|Description)/i;
  return pattern.test(content);
}

/**
 * Recursively find all markdown files in a directory.
 */
export function findMarkdownFiles(dir: string, excludeReadme = false, excludePaths: string[] = []): string[] {
  const files: string[] = [];

  if (!existsSync(dir)) {
    return files;
  }

  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);

    // Skip excluded paths (exact match for files, prefix match for directories)
    if (excludePaths.some(ep => fullPath === ep || fullPath.startsWith(ep + "/"))) {
      continue;
    }

    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...findMarkdownFiles(fullPath, excludeReadme, excludePaths));
    } else if (entry.endsWith(".md")) {
      if (excludeReadme && entry === "README.md") {
        continue;
      }
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Validate a single reference.
 * @param ref - The parsed reference to validate
 * @param projectRoot - The project root directory
 * @param hashCache - Optional pre-fetched hash map for performance
 */
export function validateRef(
  ref: ParsedRef,
  projectRoot: string,
  hashCache?: Map<string, { hash: string; success: boolean }>
): ValidatedRef {
  const absolutePath = join(projectRoot, ref.file);

  // Check file exists
  if (!existsSync(absolutePath)) {
    return {
      ...ref,
      state: "invalid",
      reason: "File not found",
    };
  }

  // Get current file hash (from cache or fetch)
  let hashResult: { hash: string; success: boolean };
  if (hashCache && hashCache.has(absolutePath)) {
    hashResult = hashCache.get(absolutePath)!;
  } else if (hashCache && hashCache.has(ref.file)) {
    hashResult = hashCache.get(ref.file)!;
  } else {
    hashResult = getBlobHashForFile(absolutePath, projectRoot);
  }

  const { hash: currentHash, success } = hashResult;

  if (!success) {
    return {
      ...ref,
      state: "invalid",
      reason: "Git hash lookup failed (uncommitted file?)",
    };
  }

  // Check hash staleness (symbols are author-provided labels, not verified)
  if (currentHash !== ref.hash) {
    return {
      ...ref,
      state: "stale",
      reason: "File has been modified",
      currentHash,
    };
  }

  return { ...ref, state: "valid" };
}

/**
 * Validate all documentation in a directory.
 */
export function validateDocs(
  docsPath: string,
  projectRoot: string,
  options?: { useCache?: boolean; excludePaths?: string[] }
): ValidationResult {
  // Initialize result
  const result: ValidationResult = {
    message: "",
    total_files: 0,
    total_refs: 0,
    symbol_refs: 0,
    file_only_refs: 0,
    valid_count: 0,
    frontmatter_error_count: 0,
    stale_count: 0,
    invalid_count: 0,
    placeholder_error_count: 0,
    unfinalized_ref_count: 0,
    inline_code_error_count: 0,
    capability_list_warning_count: 0,
    by_doc_file: {},
    frontmatter_errors: [],
    stale: [],
    invalid: [],
    placeholder_errors: [],
    unfinalized_refs: [],
    inline_code_errors: [],
    capability_list_warnings: [],
  };

  // Find markdown files
  const mdFiles = findMarkdownFiles(docsPath, false, options?.excludePaths ?? []);
  result.total_files = mdFiles.length;

  if (mdFiles.length === 0) {
    result.message = "No documentation files found";
    return result;
  }

  // Load validation cache if enabled
  const useCache = options?.useCache ?? false;
  const cache = useCache ? loadValidationCache(projectRoot) : null;
  const newCache: ValidationCache = {
    lastRun: new Date().toISOString(),
    docChecksums: {},
    docIssues: {},
    refFileHashes: {},
  };

  // Helper to get/create doc file entry
  const getDocEntry = (docFile: string): DocFileIssues => {
    if (!result.by_doc_file[docFile]) {
      result.by_doc_file[docFile] = {
        stale: [],
        invalid: [],
        frontmatter_error: null,
        placeholder_errors: [],
        unfinalized_refs: [],
        inline_code_block_count: 0,
        has_capability_list_warning: false,
      };
    }
    return result.by_doc_file[docFile];
  };

  // Collect all refs
  const allRefs: ParsedRef[] = [];
  const skippedFromCache: string[] = [];

  // Process each markdown file
  for (const mdFile of mdFiles) {
    const content = readFileSync(mdFile, "utf-8");
    const relPath = relative(projectRoot, mdFile);
    const contentHash = getContentHash(content);

    // Check if we can use cached result
    if (cache && cache.docChecksums[relPath] === contentHash) {
      // Doc unchanged - check if referenced files also unchanged
      const cachedIssues = cache.docIssues[relPath];
      if (cachedIssues) {
        // Use cached issues for this file
        result.by_doc_file[relPath] = cachedIssues;
        if (cachedIssues.frontmatter_error) {
          result.frontmatter_errors.push({ doc_file: relPath, reason: cachedIssues.frontmatter_error });
          result.frontmatter_error_count++;
        }
        result.stale_count += cachedIssues.stale.length;
        result.invalid_count += cachedIssues.invalid.length;
        if (cachedIssues.inline_code_block_count > 0) {
          result.inline_code_error_count++;
        }
        if (cachedIssues.has_capability_list_warning) {
          result.capability_list_warning_count++;
        }
        skippedFromCache.push(relPath);
        newCache.docChecksums[relPath] = contentHash;
        newCache.docIssues[relPath] = cachedIssues;
        continue;
      }
    }

    // Store checksum for cache
    newCache.docChecksums[relPath] = contentHash;

    // Validate front matter
    const fmResult = validateFrontMatter(content);
    if (!fmResult.valid) {
      result.frontmatter_errors.push({ doc_file: relPath, reason: fmResult.error! });
      getDocEntry(relPath).frontmatter_error = fmResult.error!;
      result.frontmatter_error_count++;
    }

    // Extract refs
    const refs = extractRefs(content, relPath);
    allRefs.push(...refs);

    // Detect placeholders (fake hashes)
    const placeholders = detectPlaceholders(content);
    if (placeholders.length > 0) {
      result.placeholder_errors.push({
        doc_file: relPath,
        count: placeholders.length,
        examples: placeholders.slice(0, 3),
        reason: "Placeholder hashes detected - use format-reference command",
      });
      getDocEntry(relPath).placeholder_errors = placeholders;
      result.placeholder_error_count++;
    }

    // Detect unfinalized refs (refs without hashes)
    const unfinalizedRefs = detectUnfinalizedRefs(content);
    if (unfinalizedRefs.length > 0) {
      result.unfinalized_refs.push({
        doc_file: relPath,
        count: unfinalizedRefs.length,
        examples: unfinalizedRefs.slice(0, 3),
        reason: "Unfinalized refs detected - run 'ah docs finalize'",
      });
      getDocEntry(relPath).unfinalized_refs = unfinalizedRefs;
      result.unfinalized_ref_count++;
    }

    // Count code blocks
    const codeBlockCount = countCodeBlocks(content);
    if (codeBlockCount > 0) {
      result.inline_code_errors.push({
        doc_file: relPath,
        block_count: codeBlockCount,
        reason: "Documentation contains inline code blocks",
      });
      getDocEntry(relPath).inline_code_block_count = codeBlockCount;
      result.inline_code_error_count++;
    }

    // Check for capability lists
    if (hasCapabilityList(content)) {
      result.capability_list_warnings.push({
        doc_file: relPath,
        reason: "Possible capability list table detected",
      });
      getDocEntry(relPath).has_capability_list_warning = true;
      result.capability_list_warning_count++;
    }
  }

  result.total_refs = allRefs.length;
  result.symbol_refs = allRefs.filter((r) => !r.isFileOnly).length;
  result.file_only_refs = allRefs.filter((r) => r.isFileOnly).length;

  // Batch fetch all file hashes upfront (major performance improvement)
  const uniqueFiles = [...new Set(allRefs.map((r) => r.file))];
  const absoluteFiles = uniqueFiles.map((f) => join(projectRoot, f));
  const hashCache = batchGetBlobHashes(absoluteFiles, projectRoot);

  // Validate each reference (using cached hashes)
  for (const ref of allRefs) {
    const validated = validateRef(ref, projectRoot, hashCache);

    if (validated.state === "valid") {
      result.valid_count++;
    } else if (validated.state === "stale") {
      result.stale_count++;
      result.stale.push({
        doc_file: ref.docFile,
        reference: ref.reference,
        stored_hash: ref.hash,
        current_hash: validated.currentHash!,
        ref_type: ref.isFileOnly ? "file-only" : "symbol",
      });
      getDocEntry(ref.docFile).stale.push({
        reference: ref.reference,
        file_path: ref.file,
        symbol_name: ref.symbol,
        stored_hash: ref.hash,
        current_hash: validated.currentHash!,
        ref_type: ref.isFileOnly ? "file-only" : "symbol",
      });
    } else {
      result.invalid_count++;
      result.invalid.push({
        doc_file: ref.docFile,
        reference: ref.reference,
        reason: validated.reason!,
      });
      getDocEntry(ref.docFile).invalid.push({
        reference: ref.reference,
        reason: validated.reason!,
      });
    }
  }

  // Filter by_doc_file to only include docs with issues
  const filteredByDocFile: Record<string, DocFileIssues> = {};
  for (const [docFile, issues] of Object.entries(result.by_doc_file)) {
    const hasIssues =
      issues.stale.length > 0 ||
      issues.invalid.length > 0 ||
      issues.frontmatter_error !== null ||
      issues.placeholder_errors.length > 0 ||
      issues.unfinalized_refs.length > 0 ||
      issues.inline_code_block_count > 0 ||
      issues.has_capability_list_warning;
    if (hasIssues) {
      filteredByDocFile[docFile] = issues;
    }
  }
  result.by_doc_file = filteredByDocFile;

  // Generate message
  const hasErrors =
    result.frontmatter_error_count > 0 ||
    result.stale_count > 0 ||
    result.invalid_count > 0 ||
    result.placeholder_error_count > 0 ||
    result.unfinalized_ref_count > 0;

  if (hasErrors) {
    const parts: string[] = [];
    if (result.frontmatter_error_count > 0)
      parts.push(`${result.frontmatter_error_count} front matter errors`);
    if (result.invalid_count > 0)
      parts.push(`${result.invalid_count} invalid refs`);
    if (result.stale_count > 0) parts.push(`${result.stale_count} stale refs`);
    if (result.placeholder_error_count > 0)
      parts.push(`${result.placeholder_error_count} placeholder hashes`);
    if (result.unfinalized_ref_count > 0)
      parts.push(`${result.unfinalized_ref_count} unfinalized refs`);
    result.message = `Validation found issues: ${parts.join(", ")}`;
  } else if (result.capability_list_warning_count > 0) {
    result.message = `Validated ${result.total_files} files with ${result.capability_list_warning_count} warnings`;
  } else {
    result.message = `Validated ${result.total_files} files and ${result.total_refs} references (${result.symbol_refs} symbol, ${result.file_only_refs} file-only)`;
  }

  // Add cache info to message if applicable
  if (skippedFromCache.length > 0) {
    result.message += ` (${skippedFromCache.length} from cache)`;
  }

  // Save cache for future runs
  if (useCache) {
    // Store validated doc issues in cache
    for (const [docPath, issues] of Object.entries(result.by_doc_file)) {
      newCache.docIssues[docPath] = issues;
    }
    saveValidationCache(projectRoot, newCache);
  }

  return result;
}

/**
 * Validate all documentation in a directory (async version).
 * Kept async for API compatibility. Delegates directly to validateDocs.
 */
export async function validateDocsAsync(
  docsPath: string,
  projectRoot: string,
  options?: { useCache?: boolean; excludePaths?: string[] }
): Promise<ValidationResult> {
  return validateDocs(docsPath, projectRoot, options);
}
