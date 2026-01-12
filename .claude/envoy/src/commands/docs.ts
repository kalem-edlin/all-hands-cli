/**
 * Documentation commands - symbol reference formatting and validation.
 *
 * Commands:
 *   envoy docs format-reference <file> <symbol>
 *   envoy docs validate
 *   envoy docs complexity <path>
 *   envoy docs tree <path>
 */

import { Command } from "commander";
import { execSync, spawnSync } from "child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, relative, extname, dirname } from "path";
import matter from "gray-matter";
import { BaseCommand, CommandResult } from "./base.js";
import {
  findSymbol,
  getFileComplexity,
} from "../lib/tree-sitter-utils.js";
import { getSupportedExtensions } from "../lib/ast-queries.js";

const getProjectRoot = (): string => {
  try {
    return execSync("git rev-parse --show-toplevel", { encoding: "utf-8" }).trim();
  } catch {
    return process.cwd();
  }
};

/**
 * Get most recent commit hash for a line range using git blame.
 * Uses -t flag to get timestamps directly from blame output (single subprocess).
 */
const getMostRecentHashForRange = (
  filePath: string,
  startLine: number,
  endLine: number,
  cwd: string
): { hash: string; success: boolean } => {
  const blameResult = spawnSync(
    "git",
    ["blame", "-L", `${startLine},${endLine}`, "--porcelain", "-t", filePath],
    { encoding: "utf-8", cwd }
  );

  if (blameResult.status !== 0) {
    return { hash: "0000000", success: false };
  }

  const lines = blameResult.stdout.split("\n");
  let mostRecentHash = "0000000";
  let mostRecentTime = 0;
  let currentHash = "";

  for (const line of lines) {
    if (/^[a-f0-9]{40}/.test(line)) {
      currentHash = line.substring(0, 7);
    } else if (line.startsWith("committer-time ") && currentHash) {
      const timestamp = parseInt(line.substring(15), 10);
      if (timestamp > mostRecentTime) {
        mostRecentTime = timestamp;
        mostRecentHash = currentHash;
      }
    }
  }

  return { hash: mostRecentHash, success: true };
};

/**
 * Get most recent commit hash for entire file.
 * Used for non-AST files where we can't identify symbol line ranges.
 */
const getMostRecentHashForFile = (
  filePath: string,
  cwd: string
): { hash: string; success: boolean } => {
  const logResult = spawnSync(
    "git",
    ["log", "-1", "--format=%h", "--", filePath],
    { encoding: "utf-8", cwd }
  );

  if (logResult.status !== 0 || !logResult.stdout.trim()) {
    return { hash: "0000000", success: false };
  }

  return { hash: logResult.stdout.trim().substring(0, 7), success: true };
};

/**
 * Format a symbol reference with git blame hash.
 * Output: [ref:file:symbol:hash] for AST-supported files with symbol
 * Output: [ref:file::hash] for file-only refs (no symbol or non-AST files)
 */
class FormatReferenceCommand extends BaseCommand {
  readonly name = "format-reference";
  readonly description = "Format symbol reference with git blame hash";

  defineArguments(cmd: Command): void {
    cmd
      .argument("<file>", "Path to source file")
      .argument("[symbol]", "Symbol name (optional for non-AST files)");
  }

  async execute(args: Record<string, unknown>): Promise<CommandResult> {
    const file = args.file as string;
    const symbolName = args.symbol as string | undefined;

    if (!file) {
      return this.error("validation_error", "file is required");
    }

    const projectRoot = getProjectRoot();
    const absolutePath = file.startsWith("/") ? file : join(projectRoot, file);
    const relativePath = relative(projectRoot, absolutePath);

    if (!existsSync(absolutePath)) {
      return this.error("file_not_found", `File not found: ${relativePath}`);
    }

    // Check if file type is AST-supported
    const ext = extname(absolutePath);
    const supported = getSupportedExtensions();
    const isAstSupported = supported.includes(ext);

    // File-only reference (no symbol provided or non-AST file)
    if (!symbolName) {
      const { hash: fileHash, success } = getMostRecentHashForFile(
        absolutePath,
        projectRoot
      );

      if (!success || fileHash === "0000000") {
        return this.error(
          "uncommitted_file",
          `File ${relativePath} has uncommitted changes or no git history`,
          "Commit all changes before generating references: git add -A && git commit"
        );
      }

      const reference = `[ref:${relativePath}::${fileHash}]`;

      return this.success({
        reference,
        file: relativePath,
        symbol: null,
        hash: fileHash,
        type: "file-only",
        ast_supported: isAstSupported,
      });
    }

    // Symbol reference - requires AST support
    if (!isAstSupported) {
      return this.error(
        "unsupported_file_type",
        `File type ${ext} does not support symbol references`,
        `Use file-only reference: envoy docs format-reference ${file}`
      );
    }

    // Find symbol in file
    const symbol = await findSymbol(absolutePath, symbolName);

    if (!symbol) {
      return this.error(
        "symbol_not_found",
        `Symbol '${symbolName}' not found in ${relativePath}`,
        "Check symbol name spelling and ensure it's a top-level declaration"
      );
    }

    // Get git blame hash for symbol's line range
    const { hash: mostRecentHash, success } = getMostRecentHashForRange(
      absolutePath,
      symbol.startLine,
      symbol.endLine,
      projectRoot
    );

    if (!success || mostRecentHash === "0000000") {
      return this.error(
        "uncommitted_file",
        `File ${relativePath} has uncommitted changes or no git history`,
        "Commit all changes before generating references: git add -A && git commit"
      );
    }

    const reference = `[ref:${relativePath}:${symbolName}:${mostRecentHash}]`;

    return this.success({
      reference,
      file: relativePath,
      symbol: symbolName,
      hash: mostRecentHash,
      line_range: { start: symbol.startLine, end: symbol.endLine },
      symbol_type: symbol.type,
      type: "symbol",
    });
  }
}

/**
 * Validate all documentation references.
 * Supports two formats:
 *   [ref:file:symbol:hash] - symbol reference (AST-supported files)
 *   [ref:file::hash] - file-only reference (any file type)
 */
class ValidateCommand extends BaseCommand {
  readonly name = "validate";
  readonly description = "Validate symbol references in documentation";

  defineArguments(cmd: Command): void {
    cmd.option("--path <path>", "Specific docs path to validate", "docs/");
  }

  async execute(args: Record<string, unknown>): Promise<CommandResult> {
    const docsPath = args.path as string || "docs/";
    const projectRoot = getProjectRoot();
    const absoluteDocsPath = docsPath.startsWith("/")
      ? docsPath
      : join(projectRoot, docsPath);

    if (!existsSync(absoluteDocsPath)) {
      return this.success({
        message: "No docs directory found",
        stale: [],
        invalid: [],
        frontmatter_errors: [],
        total_refs: 0,
        total_files: 0,
      });
    }

    interface RefInfo {
      file: string;
      reference: string;
      refFile: string;
      refSymbol: string | null; // null for file-only refs
      refHash: string;
      isFileOnly: boolean;
    }

    const refs: RefInfo[] = [];

    // Recursively find all markdown files (excluding README.md)
    const findMarkdownFiles = (dir: string): string[] => {
      const files: string[] = [];
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          files.push(...findMarkdownFiles(fullPath));
        } else if (entry.endsWith(".md") && entry !== "README.md") {
          files.push(fullPath);
        }
      }
      return files;
    };

    const mdFiles = findMarkdownFiles(absoluteDocsPath);

    // Group all issues by doc file for easy delegation to documentation-writers
    interface DocFileIssues {
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
      placeholder_errors: Array<string>;
      inline_code_block_count: number;
      has_capability_list_warning: boolean;
    }

    const byDocFile: Record<string, DocFileIssues> = {};

    const getOrCreateDocEntry = (docFile: string): DocFileIssues => {
      if (!byDocFile[docFile]) {
        byDocFile[docFile] = {
          stale: [],
          invalid: [],
          frontmatter_error: null,
          placeholder_errors: [],
          inline_code_block_count: 0,
          has_capability_list_warning: false,
        };
      }
      return byDocFile[docFile];
    };

    // Legacy flat arrays for backward compat
    const frontmatterErrors: Array<{
      doc_file: string;
      reason: string;
    }> = [];

    const placeholderErrors: Array<{
      doc_file: string;
      count: number;
      examples: string[];
      reason: string;
    }> = [];

    const inlineCodeErrors: Array<{
      doc_file: string;
      block_count: number;
      reason: string;
    }> = [];

    const capabilityListWarnings: Array<{
      doc_file: string;
      reason: string;
    }> = [];

    for (const mdFile of mdFiles) {
      const content = readFileSync(mdFile, "utf-8");
      const relPath = relative(projectRoot, mdFile);

      // Check for front matter block
      if (!content.startsWith("---")) {
        const reason = "Missing front matter (file must start with ---)";
        frontmatterErrors.push({ doc_file: relPath, reason });
        getOrCreateDocEntry(relPath).frontmatter_error = reason;
        continue;
      }

      try {
        const parsed = matter(content);

        // Check for required description field
        if (!parsed.data.description || typeof parsed.data.description !== "string") {
          const reason = "Missing or invalid 'description' field in front matter";
          frontmatterErrors.push({ doc_file: relPath, reason });
          getOrCreateDocEntry(relPath).frontmatter_error = reason;
        } else if (parsed.data.description.trim() === "") {
          const reason = "Empty 'description' field in front matter";
          frontmatterErrors.push({ doc_file: relPath, reason });
          getOrCreateDocEntry(relPath).frontmatter_error = reason;
        }

        // Validate relevant_files if present
        if (parsed.data.relevant_files !== undefined) {
          if (!Array.isArray(parsed.data.relevant_files)) {
            const reason = "'relevant_files' must be an array";
            frontmatterErrors.push({ doc_file: relPath, reason });
            getOrCreateDocEntry(relPath).frontmatter_error = reason;
          }
        }
      } catch {
        const reason = "Invalid front matter syntax";
        frontmatterErrors.push({ doc_file: relPath, reason });
        getOrCreateDocEntry(relPath).frontmatter_error = reason;
      }
    }

    // Extract refs from all markdown files
    // Matches both [ref:file:symbol:hash] and [ref:file::hash]
    const refPattern = /\[ref:([^:\]]+):([^:\]]*):([a-f0-9]+)\]/g;

    for (const mdFile of mdFiles) {
      const content = readFileSync(mdFile, "utf-8");
      const relPath = relative(projectRoot, mdFile);
      let match;
      while ((match = refPattern.exec(content)) !== null) {
        const isFileOnly = match[2] === "";
        refs.push({
          file: relPath,
          reference: match[0],
          refFile: match[1],
          refSymbol: isFileOnly ? null : match[2],
          refHash: match[3],
          isFileOnly,
        });
      }

      // Placeholder hash detection
const placeholderPattern = /\[ref:[^\]]+:(abc123[0-9]?|123456[0-9]?|000000[0-9]?|hash[a-f0-9]{0,4}|test[a-f0-9]{0,4})\]/gi;
      const placeholderMatches = content.match(placeholderPattern);
      if (placeholderMatches) {
        placeholderErrors.push({
          doc_file: relPath,
          count: placeholderMatches.length,
          examples: placeholderMatches.slice(0, 3),
          reason: "Placeholder hashes detected - writer didn't use format-reference",
        });
        const entry = getOrCreateDocEntry(relPath);
        entry.placeholder_errors = placeholderMatches;
      }

      // Inline code block detection (fenced code blocks in documentation)
const codeBlockPattern = /^```[a-z0-9_+-]*$/gm;
      const codeBlockMatches = content.match(codeBlockPattern);
      if (codeBlockMatches && codeBlockMatches.length > 0) {
        inlineCodeErrors.push({
          doc_file: relPath,
          block_count: codeBlockMatches.length,
          reason: "Documentation contains inline code blocks",
        });
        getOrCreateDocEntry(relPath).inline_code_block_count = codeBlockMatches.length;
      }

      // Capability list detection (tables with Command/Purpose headers)
      const capabilityTablePattern = /\|\s*(Command|Option|Flag)\s*\|.*\|\s*(Purpose|Description)\s*\|/i;
      if (capabilityTablePattern.test(content)) {
        capabilityListWarnings.push({
          doc_file: relPath,
          reason: "Possible capability list table detected",
        });
        getOrCreateDocEntry(relPath).has_capability_list_warning = true;
      }
    }

    // Legacy flat arrays for backward compat
    const stale: Array<{
      doc_file: string;
      reference: string;
      stored_hash: string;
      current_hash: string;
      ref_type: "symbol" | "file-only";
    }> = [];

    const invalid: Array<{
      doc_file: string;
      reference: string;
      reason: string;
    }> = [];

    // Validate each reference
    for (const ref of refs) {
      const absoluteRefFile = join(projectRoot, ref.refFile);

      // Check if file exists
      if (!existsSync(absoluteRefFile)) {
        const reason = "File not found";
        invalid.push({
          doc_file: ref.file,
          reference: ref.reference,
          reason,
        });
        getOrCreateDocEntry(ref.file).invalid.push({
          reference: ref.reference,
          reason,
        });
        continue;
      }

      // File-only reference: check file hash staleness
      if (ref.isFileOnly) {
        const { hash: currentHash, success } = getMostRecentHashForFile(
          absoluteRefFile,
          projectRoot
        );

        if (!success) {
          const reason = "Git hash lookup failed";
          invalid.push({
            doc_file: ref.file,
            reference: ref.reference,
            reason,
          });
          getOrCreateDocEntry(ref.file).invalid.push({
            reference: ref.reference,
            reason,
          });
          continue;
        }

        if (currentHash !== ref.refHash) {
          stale.push({
            doc_file: ref.file,
            reference: ref.reference,
            stored_hash: ref.refHash,
            current_hash: currentHash,
            ref_type: "file-only",
          });
          getOrCreateDocEntry(ref.file).stale.push({
            reference: ref.reference,
            file_path: ref.refFile,
            symbol_name: null,
            stored_hash: ref.refHash,
            current_hash: currentHash,
            ref_type: "file-only",
          });
        }
        continue;
      }

      // Symbol reference: validate symbol exists and check hash
      const ext = extname(absoluteRefFile);
      const supported = getSupportedExtensions();
      if (!supported.includes(ext)) {
        const reason = `File type ${ext} does not support symbol references`;
        invalid.push({
          doc_file: ref.file,
          reference: ref.reference,
          reason,
        });
        getOrCreateDocEntry(ref.file).invalid.push({
          reference: ref.reference,
          reason,
        });
        continue;
      }

      // Check if symbol exists and get its location
      const symbol = await findSymbol(absoluteRefFile, ref.refSymbol!);
      if (!symbol) {
        const reason = "Symbol not found";
        invalid.push({
          doc_file: ref.file,
          reference: ref.reference,
          reason,
        });
        getOrCreateDocEntry(ref.file).invalid.push({
          reference: ref.reference,
          reason,
        });
        continue;
      }

      const { hash: mostRecentHash, success } = getMostRecentHashForRange(
        absoluteRefFile,
        symbol.startLine,
        symbol.endLine,
        projectRoot
      );

      if (!success) {
        const reason = "Git blame failed";
        invalid.push({
          doc_file: ref.file,
          reference: ref.reference,
          reason,
        });
        getOrCreateDocEntry(ref.file).invalid.push({
          reference: ref.reference,
          reason,
        });
        continue;
      }

      if (mostRecentHash !== ref.refHash) {
        stale.push({
          doc_file: ref.file,
          reference: ref.reference,
          stored_hash: ref.refHash,
          current_hash: mostRecentHash,
          ref_type: "symbol",
        });
        getOrCreateDocEntry(ref.file).stale.push({
          reference: ref.reference,
          file_path: ref.refFile,
          symbol_name: ref.refSymbol,
          stored_hash: ref.refHash,
          current_hash: mostRecentHash,
          ref_type: "symbol",
        });
      }
    }

    const hasErrors = frontmatterErrors.length > 0 || stale.length > 0 || invalid.length > 0 ||
      placeholderErrors.length > 0 || inlineCodeErrors.length > 0;
    const hasWarnings = capabilityListWarnings.length > 0;
    const fileOnlyRefs = refs.filter(r => r.isFileOnly).length;
    const symbolRefs = refs.filter(r => !r.isFileOnly).length;

    let message: string;
    if (hasErrors) {
      const parts: string[] = [];
      if (frontmatterErrors.length > 0) parts.push(`${frontmatterErrors.length} front matter errors`);
      if (invalid.length > 0) parts.push(`${invalid.length} invalid refs`);
      if (stale.length > 0) parts.push(`${stale.length} stale refs`);
      if (placeholderErrors.length > 0) parts.push(`${placeholderErrors.length} placeholder hashes`);
      if (inlineCodeErrors.length > 0) parts.push(`${inlineCodeErrors.length} inline code blocks`);
      message = `Validation found issues: ${parts.join(", ")}`;
    } else if (hasWarnings) {
      message = `Validated ${mdFiles.length} files with ${capabilityListWarnings.length} warnings`;
    } else {
      message = `Validated ${mdFiles.length} files and ${refs.length} references (${symbolRefs} symbol, ${fileOnlyRefs} file-only)`;
    }

    // Filter byDocFile to only include docs with actual issues
    const byDocFileFiltered: Record<string, DocFileIssues> = {};
    for (const [docFile, issues] of Object.entries(byDocFile)) {
      const hasIssues =
        issues.stale.length > 0 ||
        issues.invalid.length > 0 ||
        issues.frontmatter_error !== null ||
        issues.placeholder_errors.length > 0 ||
        issues.inline_code_block_count > 0 ||
        issues.has_capability_list_warning;
      if (hasIssues) {
        byDocFileFiltered[docFile] = issues;
      }
    }

    return this.success({
      message,
      total_files: mdFiles.length,
      total_refs: refs.length,
      symbol_refs: symbolRefs,
      file_only_refs: fileOnlyRefs,
      frontmatter_error_count: frontmatterErrors.length,
      stale_count: stale.length,
      invalid_count: invalid.length,
      placeholder_error_count: placeholderErrors.length,
      inline_code_error_count: inlineCodeErrors.length,
      capability_list_warning_count: capabilityListWarnings.length,
      // Grouped by doc file for easy delegation to documentation-writers
      by_doc_file: byDocFileFiltered,
      // Legacy flat arrays for backward compat
      frontmatter_errors: frontmatterErrors,
      stale,
      invalid,
      placeholder_errors: placeholderErrors,
      inline_code_errors: inlineCodeErrors,
      capability_list_warnings: capabilityListWarnings,
    });
  }
}

/**
 * Get complexity metrics for a file or directory.
 */
class ComplexityCommand extends BaseCommand {
  readonly name = "complexity";
  readonly description = "Get complexity metrics for file or directory";

  defineArguments(cmd: Command): void {
    cmd.argument("<path>", "File or directory path");
  }

  async execute(args: Record<string, unknown>): Promise<CommandResult> {
    const pathArg = args.path as string;

    if (!pathArg) {
      return this.error("validation_error", "path is required");
    }

    const projectRoot = getProjectRoot();
    const absolutePath = pathArg.startsWith("/")
      ? pathArg
      : join(projectRoot, pathArg);
    const relativePath = relative(projectRoot, absolutePath);

    if (!existsSync(absolutePath)) {
      return this.error("path_not_found", `Path not found: ${relativePath}`);
    }

    const stat = statSync(absolutePath);

    if (stat.isFile()) {
      // Single file complexity
      const metrics = await getFileComplexity(absolutePath);
      if (!metrics) {
        return this.error("parse_error", `Could not parse ${relativePath}`);
      }

      return this.success({
        path: relativePath,
        type: "file",
        metrics,
        estimated_tokens: Math.ceil(metrics.lines * 10), // Rough estimate
      });
    }

    // Directory complexity
    const supported = getSupportedExtensions();
    const files: string[] = [];

    const findSourceFiles = (dir: string): void => {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (entry.startsWith(".") || entry === "node_modules") continue;
        const fullPath = join(dir, entry);
        const entryStat = statSync(fullPath);
        if (entryStat.isDirectory()) {
          findSourceFiles(fullPath);
        } else if (supported.includes(extname(entry))) {
          files.push(fullPath);
        }
      }
    };

    findSourceFiles(absolutePath);

    let totalLines = 0;
    let totalImports = 0;
    let totalExports = 0;
    let totalFunctions = 0;
    let totalClasses = 0;

    for (const file of files) {
      const metrics = await getFileComplexity(file);
      if (metrics) {
        totalLines += metrics.lines;
        totalImports += metrics.imports;
        totalExports += metrics.exports;
        totalFunctions += metrics.functions;
        totalClasses += metrics.classes;
      }
    }

    return this.success({
      path: relativePath,
      type: "directory",
      file_count: files.length,
      metrics: {
        lines: totalLines,
        imports: totalImports,
        exports: totalExports,
        functions: totalFunctions,
        classes: totalClasses,
      },
      estimated_tokens: Math.ceil(totalLines * 10),
    });
  }
}

/**
 * Get tree structure with documentation coverage.
 */
class TreeCommand extends BaseCommand {
  readonly name = "tree";
  readonly description = "Get tree structure with doc coverage indicators";

  defineArguments(cmd: Command): void {
    cmd
      .argument("<path>", "Directory path")
      .option("--depth <n>", "Max depth to traverse", "3");
  }

  async execute(args: Record<string, unknown>): Promise<CommandResult> {
    const pathArg = args.path as string;
    const maxDepth = parseInt(args.depth as string || "3", 10);

    if (!pathArg) {
      return this.error("validation_error", "path is required");
    }

    const projectRoot = getProjectRoot();
    const absolutePath = pathArg.startsWith("/")
      ? pathArg
      : join(projectRoot, pathArg);
    const relativePath = relative(projectRoot, absolutePath);

    if (!existsSync(absolutePath)) {
      return this.error("path_not_found", `Path not found: ${relativePath}`);
    }

    const stat = statSync(absolutePath);
    if (!stat.isDirectory()) {
      return this.error("not_directory", `${relativePath} is not a directory`);
    }

    const docsPath = join(projectRoot, "docs");

    interface TreeNode {
      name: string;
      type: "file" | "directory";
      has_docs: boolean;
      doc_path?: string;
      children?: TreeNode[];
    }

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
        // Convention: docs/path/to/dir.md or docs/path/to/file.md
        // Note: README.md excluded from docs system, index.md for subdomains only
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
          const supported = getSupportedExtensions();
          if (supported.includes(ext)) {
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

    const tree = buildTree(absolutePath, maxDepth);

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

    const stats = countNodes(tree);

    return this.success({
      path: relativePath,
      tree,
      coverage: {
        total: stats.total,
        covered: stats.covered,
        percentage: stats.total > 0
          ? Math.round((stats.covered / stats.total) * 100)
          : 0,
      },
    });
  }
}

export const COMMANDS = {
  "format-reference": FormatReferenceCommand,
  validate: ValidateCommand,
  complexity: ComplexityCommand,
  tree: TreeCommand,
};
