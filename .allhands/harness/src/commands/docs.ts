/**
 * Documentation commands - validation and reference finalization.
 *
 * Uses ctags for symbol lookup (instead of AST parsing) for broader language support
 * and simpler implementation.
 *
 * Commands:
 *   ah docs validate [--path <path>]  - Validate all refs in docs/
 *   ah docs finalize [--path <path>]  - Finalize placeholder refs with hashes
 *   ah docs tree <path>               - Get tree with doc coverage
 */

import { Command } from "commander";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { join, relative, extname, dirname } from "path";
import {
  executeCommand,
  parseContext,
  addCommonOptions,
  CommandResult,
} from "../lib/base-command.js";
import { getProjectRoot } from "../lib/git.js";
import {
  checkCtagsAvailable,
  findSymbolInFile,
  generateCtagsIndex,
} from "../lib/ctags.js";
import {
  batchGetBlobHashes,
  findMarkdownFiles,
  isCodeFile,
  REF_PATTERN,
  validateDocs,
} from "../lib/docs-validation.js";

/**
 * Validate all documentation references.
 */
/** Paths excluded from validation and finalization (relative to project root). */
const EXCLUDED_DOC_PATHS = ["docs/memories.md", "docs/solutions"];

async function validate(docsPath: string, options?: { useCache?: boolean }): Promise<CommandResult> {
  const projectRoot = getProjectRoot();
  const absoluteDocsPath = docsPath.startsWith("/")
    ? docsPath
    : join(projectRoot, docsPath);

  // Check ctags availability first
  const ctagsCheck = checkCtagsAvailable();
  if (!ctagsCheck.available) {
    return {
      success: false,
      error: `ctags_unavailable: ${ctagsCheck.error}`,
    };
  }

  const excludePaths = EXCLUDED_DOC_PATHS.map((p) => join(projectRoot, p));

  // Run validation (with optional caching)
  const result = validateDocs(absoluteDocsPath, projectRoot, {
    useCache: options?.useCache ?? false,
    excludePaths,
  });

  // Consider it a success even with issues (issues are in the data)
  return { success: true, data: result };
}

/**
 * Get tree structure with documentation coverage.
 */
async function tree(pathArg: string, maxDepth: number): Promise<CommandResult> {
  const projectRoot = getProjectRoot();
  const absolutePath = pathArg.startsWith("/")
    ? pathArg
    : join(projectRoot, pathArg);
  const relativePath = relative(projectRoot, absolutePath);

  if (!existsSync(absolutePath)) {
    return {
      success: false,
      error: `path_not_found: Path not found: ${relativePath}`,
    };
  }

  const stat = statSync(absolutePath);
  if (!stat.isDirectory()) {
    return {
      success: false,
      error: `not_directory: ${relativePath} is not a directory`,
    };
  }

  const docsPath = join(projectRoot, "docs");

  interface TreeNode {
    name: string;
    type: "file" | "directory";
    has_docs: boolean;
    doc_path?: string;
    children?: TreeNode[];
  }

  const sourceExtensions = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".rb"];

  const buildTree = (dir: string, depth: number): TreeNode[] => {
    if (depth <= 0) return [];

    const entries = readdirSync(dir);
    const nodes: TreeNode[] = [];

    for (const entry of entries) {
      if (entry.startsWith(".") || entry === "node_modules") continue;

      const fullPath = join(dir, entry);
      const entryRelPath = relative(projectRoot, fullPath);
      const entryStat = statSync(fullPath);

      // Check for docs coverage
      const possibleDocPaths = [
        join(docsPath, entryRelPath + ".md"),
        join(docsPath, dirname(entryRelPath), entry.replace(extname(entry), ".md")),
        join(docsPath, entryRelPath, "index.md"),
      ];

      let hasDoc = false;
      let docPath: string | undefined;
      for (const dp of possibleDocPaths) {
        if (existsSync(dp)) {
          hasDoc = true;
          docPath = relative(projectRoot, dp);
          break;
        }
      }

      if (entryStat.isDirectory()) {
        const children = buildTree(fullPath, depth - 1);
        nodes.push({
          name: entry,
          type: "directory",
          has_docs: hasDoc,
          doc_path: docPath,
          children: children.length > 0 ? children : undefined,
        });
      } else {
        const ext = extname(entry);
        if (sourceExtensions.includes(ext)) {
          nodes.push({
            name: entry,
            type: "file",
            has_docs: hasDoc,
            doc_path: docPath,
          });
        }
      }
    }

    return nodes;
  };

  const treeData = buildTree(absolutePath, maxDepth);

  // Calculate coverage stats
  const countNodes = (nodes: TreeNode[]): { total: number; covered: number } => {
    let total = 0;
    let covered = 0;
    for (const node of nodes) {
      total++;
      if (node.has_docs) covered++;
      if (node.children) {
        const childStats = countNodes(node.children);
        total += childStats.total;
        covered += childStats.covered;
      }
    }
    return { total, covered };
  };

  const stats = countNodes(treeData);

  return {
    success: true,
    data: {
      path: relativePath,
      tree: treeData,
      coverage: {
        total: stats.total,
        covered: stats.covered,
        percentage: stats.total > 0 ? Math.round((stats.covered / stats.total) * 100) : 0,
      },
    },
  };
}

/**
 * Placeholder ref pattern - matches [ref:file:symbol] without hash
 */
// Matches both [ref:file:symbol] and [ref:file] (file-only refs)
const PLACEHOLDER_REF_PATTERN = /\[ref:([^:\]]+)(?::([^\]]*))?\]/g;

/**
 * Finalize a single documentation file by replacing placeholder refs with full refs.
 */
function finalizeSingleFile(
  absolutePath: string,
  projectRoot: string,
  hashCache: Map<string, { success: boolean; hash?: string; error?: string }>
): { path: string; replacements: number; replaced: Array<{ from: string; to: string }>; errors: Array<{ placeholder: string; reason: string }> } {
  const relativePath = relative(projectRoot, absolutePath);
  const content = readFileSync(absolutePath, "utf-8");

  // Find all placeholder refs (symbol may be undefined for file-only refs)
  const placeholders: Array<{ match: string; file: string; symbol: string | undefined }> = [];
  let match;
  const pattern = new RegExp(PLACEHOLDER_REF_PATTERN.source, "g");
  while ((match = pattern.exec(content)) !== null) {
    // Skip if it already looks like a full ref (has 3 colons indicating hash)
    if (match[0].split(":").length > 3) continue;
    placeholders.push({
      match: match[0],
      file: match[1],
      symbol: match[2],
    });
  }

  if (placeholders.length === 0) {
    return { path: relativePath, replacements: 0, replaced: [], errors: [] };
  }

  // Process each placeholder
  const errors: Array<{ placeholder: string; reason: string }> = [];
  const replacements: Array<{ from: string; to: string }> = [];
  let finalizedContent = content;

  for (const placeholder of placeholders) {
    const absoluteFilePath = join(projectRoot, placeholder.file);

    // Check file exists
    if (!existsSync(absoluteFilePath)) {
      errors.push({
        placeholder: placeholder.match,
        reason: `File not found: ${placeholder.file}`,
      });
      continue;
    }

    // Get hash from cache
    const hashResult = hashCache.get(absoluteFilePath) || hashCache.get(placeholder.file);
    if (!hashResult || !hashResult.success) {
      errors.push({
        placeholder: placeholder.match,
        reason: `Git hash lookup failed for ${placeholder.file} (uncommitted file?)`,
      });
      continue;
    }

    // For file-only refs (empty symbol), just add the hash
    if (!placeholder.symbol || placeholder.symbol.trim() === "") {
      const fullRef = `[ref:${placeholder.file}::${hashResult.hash}]`;
      finalizedContent = finalizedContent.replaceAll(placeholder.match, fullRef);
      replacements.push({ from: placeholder.match, to: fullRef });
      continue;
    }

    // For non-code files (markdown, yaml, json, etc.), treat symbol as a label (no ctags lookup)
    if (!isCodeFile(placeholder.file)) {
      const fullRef = `[ref:${placeholder.file}:${placeholder.symbol}:${hashResult.hash}]`;
      finalizedContent = finalizedContent.replaceAll(placeholder.match, fullRef);
      replacements.push({ from: placeholder.match, to: fullRef });
      continue;
    }

    // For code files with symbol refs, verify symbol exists via ctags
    const entry = findSymbolInFile(absoluteFilePath, placeholder.symbol, projectRoot);
    if (!entry) {
      errors.push({
        placeholder: placeholder.match,
        reason: `Symbol '${placeholder.symbol}' not found in ${placeholder.file}`,
      });
      continue;
    }

    // Create full ref
    const fullRef = `[ref:${placeholder.file}:${placeholder.symbol}:${hashResult.hash}]`;
    finalizedContent = finalizedContent.replaceAll(placeholder.match, fullRef);
    replacements.push({ from: placeholder.match, to: fullRef });
  }

  // Write back if there were successful replacements
  if (replacements.length > 0) {
    writeFileSync(absolutePath, finalizedContent, "utf-8");
  }

  return { path: relativePath, replacements: replacements.length, replaced: replacements, errors };
}

/**
 * Refresh a single documentation file by updating all finalized ref hashes to current blob hashes.
 */
function refreshSingleFile(
  absolutePath: string,
  projectRoot: string,
  hashCache: Map<string, { hash: string; success: boolean }>
): { path: string; updated: number; unchanged: number; errors: number } {
  const relativePath = relative(projectRoot, absolutePath);
  const content = readFileSync(absolutePath, "utf-8");

  // Find all finalized refs matching REF_PATTERN
  const pattern = new RegExp(REF_PATTERN.source, "g");
  const matches: Array<{ full: string; file: string; symbol: string; hash: string }> = [];
  let match;
  while ((match = pattern.exec(content)) !== null) {
    matches.push({ full: match[0], file: match[1], symbol: match[2], hash: match[3] });
  }

  if (matches.length === 0) {
    return { path: relativePath, updated: 0, unchanged: 0, errors: 0 };
  }

  let updated = 0;
  let unchanged = 0;
  let errors = 0;
  let refreshedContent = content;

  for (const m of matches) {
    const absoluteFilePath = join(projectRoot, m.file);
    const hashResult = hashCache.get(absoluteFilePath) || hashCache.get(m.file);
    if (!hashResult || !hashResult.success) {
      errors++;
      continue;
    }

    if (m.hash === hashResult.hash) {
      unchanged++;
      continue;
    }

    // Replace old hash with current blob hash
    const oldRef = m.full;
    const newRef = m.symbol === ""
      ? `[ref:${m.file}::${hashResult.hash}]`
      : `[ref:${m.file}:${m.symbol}:${hashResult.hash}]`;
    refreshedContent = refreshedContent.replaceAll(oldRef, newRef);
    updated++;
  }

  if (updated > 0) {
    writeFileSync(absolutePath, refreshedContent, "utf-8");
  }

  return { path: relativePath, updated, unchanged, errors };
}

/**
 * Finalize documentation files by replacing placeholder refs with full refs.
 * Supports both single file and directory (batch) operation.
 * This allows writers to use [ref:file:symbol] syntax without hashes during writing,
 * then batch-process all refs in a single pass.
 *
 * When refresh=true, operates on ALL finalized refs (not just placeholders),
 * replacing stored hashes with current blob hashes.
 */
async function finalize(docsPath: string, options?: { refresh?: boolean }): Promise<CommandResult> {
  const projectRoot = getProjectRoot();
  const absolutePath = docsPath.startsWith("/") ? docsPath : join(projectRoot, docsPath);
  const relativePath = relative(projectRoot, absolutePath);

  if (!existsSync(absolutePath)) {
    return {
      success: false,
      error: `path_not_found: Path not found: ${relativePath}`,
    };
  }

  // Check ctags availability
  const ctagsCheck = checkCtagsAvailable();
  if (!ctagsCheck.available) {
    return {
      success: false,
      error: `ctags_unavailable: ${ctagsCheck.error}`,
    };
  }

  // Generate ctags index for symbol lookup
  generateCtagsIndex(projectRoot);

  // Determine if path is a file or directory
  const excludePaths = EXCLUDED_DOC_PATHS.map((p) => join(projectRoot, p));
  const stat = statSync(absolutePath);
  const filesToProcess: string[] = stat.isDirectory()
    ? findMarkdownFiles(absolutePath, false, excludePaths)
    : excludePaths.some((ep) => absolutePath === ep || absolutePath.startsWith(ep + "/"))
      ? []
      : [absolutePath];

  if (filesToProcess.length === 0) {
    return {
      success: true,
      data: {
        message: "No markdown files found",
        path: relativePath,
        filesProcessed: 0,
        totalReplacements: 0,
      },
    };
  }

  // --refresh mode: update all finalized ref hashes to current blob hashes
  if (options?.refresh) {
    // Collect all referenced files from finalized refs across all files
    const allRefFiles: Set<string> = new Set();
    for (const docFile of filesToProcess) {
      const content = readFileSync(docFile, "utf-8");
      const refPattern = new RegExp(REF_PATTERN.source, "g");
      let match;
      while ((match = refPattern.exec(content)) !== null) {
        allRefFiles.add(match[1]);
      }
    }

    // Batch get blob hashes for all referenced files
    const absoluteRefFiles = [...allRefFiles].map((f) => join(projectRoot, f));
    const refreshHashCache = batchGetBlobHashes(absoluteRefFiles, projectRoot);

    // Process each file
    let totalUpdated = 0;
    let totalUnchanged = 0;
    let totalRefreshErrors = 0;
    const refreshResults: Array<{ path: string; updated: number; unchanged: number; errors: number }> = [];

    for (const docFile of filesToProcess) {
      const result = refreshSingleFile(docFile, projectRoot, refreshHashCache);
      refreshResults.push(result);
      totalUpdated += result.updated;
      totalUnchanged += result.unchanged;
      totalRefreshErrors += result.errors;
    }

    return {
      success: totalRefreshErrors === 0,
      error: totalRefreshErrors > 0 ? `Refresh had ${totalRefreshErrors} hash lookup error(s)` : undefined,
      data: {
        mode: "refresh",
        path: relativePath,
        filesProcessed: filesToProcess.length,
        totalUpdated,
        totalUnchanged,
        totalErrors: totalRefreshErrors,
        files: refreshResults.filter((r) => r.updated > 0 || r.errors > 0),
      },
    };
  }

  // Collect all placeholder refs across all files to batch hash lookup
  const allPlaceholders: Array<{ file: string; docPath: string }> = [];
  for (const docFile of filesToProcess) {
    const content = readFileSync(docFile, "utf-8");
    const pattern = new RegExp(PLACEHOLDER_REF_PATTERN.source, "g");
    let match;
    while ((match = pattern.exec(content)) !== null) {
      if (match[0].split(":").length > 3) continue;
      allPlaceholders.push({ file: match[1], docPath: docFile });
    }
  }

  // Batch get file hashes for all referenced files
  const uniqueFiles = [...new Set(allPlaceholders.map((p) => p.file))];
  const absoluteFiles = uniqueFiles.map((f) => join(projectRoot, f));
  const hashCache = batchGetBlobHashes(absoluteFiles, projectRoot);

  // Process each file
  const results: Array<{ path: string; replacements: number; errors: number }> = [];
  let totalReplacements = 0;
  let totalErrors = 0;
  const allErrors: Array<{ file: string; placeholder: string; reason: string }> = [];

  for (const docFile of filesToProcess) {
    const result = finalizeSingleFile(docFile, projectRoot, hashCache);
    results.push({
      path: result.path,
      replacements: result.replacements,
      errors: result.errors.length,
    });
    totalReplacements += result.replacements;
    totalErrors += result.errors.length;
    for (const err of result.errors) {
      allErrors.push({ file: result.path, ...err });
    }
  }

  const hasErrors = totalErrors > 0;
  return {
    success: !hasErrors,
    error: hasErrors ? `Finalization had ${totalErrors} error(s) in ${allErrors.length} file(s)` : undefined,
    data: {
      path: relativePath,
      filesProcessed: filesToProcess.length,
      totalReplacements,
      totalErrors,
      files: results.filter((r) => r.replacements > 0 || r.errors > 0),
      errors: allErrors.length > 0 ? allErrors : undefined,
    },
  };
}

/**
 * Register docs commands.
 */
export function register(program: Command): void {
  const docs = program.command("docs").description("Documentation management and validation");

  // validate
  const validateCmd = docs
    .command("validate")
    .description("Validate all documentation references")
    .option("--path <path>", "Docs directory path", "docs/")
    .option("--cache", "Use validation cache for faster repeated runs", false);

  addCommonOptions(validateCmd);

  validateCmd.action(async (options) => {
    const context = parseContext(options);
    await executeCommand("docs:validate", context, () =>
      validate(options.path, { useCache: options.cache })
    );
  });

  // tree
  const treeCmd = docs
    .command("tree")
    .description("Get tree structure with documentation coverage")
    .argument("<path>", "Directory path")
    .option("--depth <n>", "Max depth to traverse", "3");

  addCommonOptions(treeCmd);

  treeCmd.action(async (path: string, options) => {
    const context = parseContext(options);
    const depth = parseInt(options.depth || "3", 10);
    await executeCommand("docs:tree", context, () => tree(path, depth));
  });

  // finalize
  const finalizeCmd = docs
    .command("finalize")
    .description("Replace placeholder refs [ref:file:symbol] with full refs including hashes")
    .option("--path <path>", "Docs path (file or directory)", "docs/")
    .option("--refresh", "Re-stamp all finalized refs with current blob hashes", false);

  addCommonOptions(finalizeCmd);

  finalizeCmd.action(async (options) => {
    const context = parseContext(options);
    await executeCommand("docs:finalize", context, () =>
      finalize(options.path, { refresh: options.refresh })
    );
  });
}
