/**
 * Documentation validation utilities.
 *
 * Validates references in documentation files against the actual codebase
 * using ctags for symbol lookup and git for staleness detection.
 *
 * Reference formats:
 *   [ref:file:symbol:hash] - Symbol reference (validated via ctags)
 *   [ref:file::hash]       - File-only reference (no symbol validation)
 *
 * Where hash = file-level git hash (git log -1 --format=%h -- file)
 */

import { spawnSync } from "child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import matter from "gray-matter";
import { CtagsIndex, generateCtagsIndex, lookupSymbol } from "./ctags.js";

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
  inline_code_errors: Array<{
    doc_file: string;
    block_count: number;
    reason: string;
  }>;
  capability_list_warnings: Array<{ doc_file: string; reason: string }>;
}

/**
 * Get the most recent commit hash for a file.
 */
export function getMostRecentHashForFile(
  filePath: string,
  cwd: string
): { hash: string; success: boolean } {
  const result = spawnSync("git", ["log", "-1", "--format=%h", "--", filePath], {
    encoding: "utf-8",
    cwd,
  });

  if (result.status !== 0 || !result.stdout.trim()) {
    return { hash: "0000000", success: false };
  }

  return { hash: result.stdout.trim().substring(0, 7), success: true };
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
 * Detect placeholder hashes in content.
 */
export function detectPlaceholders(content: string): string[] {
  // Reset regex state
  PLACEHOLDER_PATTERN.lastIndex = 0;

  const matches = content.match(PLACEHOLDER_PATTERN);
  return matches || [];
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
export function findMarkdownFiles(dir: string, excludeReadme = true): string[] {
  const files: string[] = [];

  if (!existsSync(dir)) {
    return files;
  }

  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...findMarkdownFiles(fullPath, excludeReadme));
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
 */
export function validateRef(
  ref: ParsedRef,
  ctagsIndex: CtagsIndex,
  projectRoot: string
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

  // Get current file hash
  const { hash: currentHash, success } = getMostRecentHashForFile(
    absolutePath,
    projectRoot
  );

  if (!success) {
    return {
      ...ref,
      state: "invalid",
      reason: "Git hash lookup failed (uncommitted file?)",
    };
  }

  // File-only reference: just check hash
  if (ref.isFileOnly) {
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

  // Symbol reference: check symbol exists via ctags
  const entries = lookupSymbol(ctagsIndex, ref.file, ref.symbol!);

  if (entries.length === 0) {
    return {
      ...ref,
      state: "invalid",
      reason: `Symbol '${ref.symbol}' not found in ${ref.file}`,
    };
  }

  // Check hash staleness (using file-level hash for ctags approach)
  if (currentHash !== ref.hash) {
    return {
      ...ref,
      state: "stale",
      reason: "File has been modified since reference was created",
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
  options?: { ctagsIndex?: CtagsIndex }
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
    inline_code_error_count: 0,
    capability_list_warning_count: 0,
    by_doc_file: {},
    frontmatter_errors: [],
    stale: [],
    invalid: [],
    placeholder_errors: [],
    inline_code_errors: [],
    capability_list_warnings: [],
  };

  // Find markdown files
  const mdFiles = findMarkdownFiles(docsPath);
  result.total_files = mdFiles.length;

  if (mdFiles.length === 0) {
    result.message = "No documentation files found";
    return result;
  }

  // Generate ctags index (or use provided one)
  const ctagsIndex =
    options?.ctagsIndex ||
    generateCtagsIndex(projectRoot).index;

  // Helper to get/create doc file entry
  const getDocEntry = (docFile: string): DocFileIssues => {
    if (!result.by_doc_file[docFile]) {
      result.by_doc_file[docFile] = {
        stale: [],
        invalid: [],
        frontmatter_error: null,
        placeholder_errors: [],
        inline_code_block_count: 0,
        has_capability_list_warning: false,
      };
    }
    return result.by_doc_file[docFile];
  };

  // Collect all refs
  const allRefs: ParsedRef[] = [];

  // Process each markdown file
  for (const mdFile of mdFiles) {
    const content = readFileSync(mdFile, "utf-8");
    const relPath = relative(projectRoot, mdFile);

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

    // Detect placeholders
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

  // Validate each reference
  for (const ref of allRefs) {
    const validated = validateRef(ref, ctagsIndex, projectRoot);

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
    result.placeholder_error_count > 0;

  if (hasErrors) {
    const parts: string[] = [];
    if (result.frontmatter_error_count > 0)
      parts.push(`${result.frontmatter_error_count} front matter errors`);
    if (result.invalid_count > 0)
      parts.push(`${result.invalid_count} invalid refs`);
    if (result.stale_count > 0) parts.push(`${result.stale_count} stale refs`);
    if (result.placeholder_error_count > 0)
      parts.push(`${result.placeholder_error_count} placeholder hashes`);
    result.message = `Validation found issues: ${parts.join(", ")}`;
  } else if (result.capability_list_warning_count > 0) {
    result.message = `Validated ${result.total_files} files with ${result.capability_list_warning_count} warnings`;
  } else {
    result.message = `Validated ${result.total_files} files and ${result.total_refs} references (${result.symbol_refs} symbol, ${result.file_only_refs} file-only)`;
  }

  return result;
}
