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
import { BaseCommand, CommandResult } from "./base.js";
import {
  findSymbol,
  symbolExists,
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
 * Format a symbol reference with git blame hash.
 * Output: [ref:file:symbol:hash]
 */
class FormatReferenceCommand extends BaseCommand {
  readonly name = "format-reference";
  readonly description = "Format symbol reference with git blame hash";

  defineArguments(cmd: Command): void {
    cmd
      .argument("<file>", "Path to source file")
      .argument("<symbol>", "Symbol name (function, class, variable, etc.)");
  }

  async execute(args: Record<string, unknown>): Promise<CommandResult> {
    const file = args.file as string;
    const symbolName = args.symbol as string;

    if (!file || !symbolName) {
      return this.error("validation_error", "file and symbol are required");
    }

    const projectRoot = getProjectRoot();
    const absolutePath = file.startsWith("/") ? file : join(projectRoot, file);
    const relativePath = relative(projectRoot, absolutePath);

    if (!existsSync(absolutePath)) {
      return this.error("file_not_found", `File not found: ${relativePath}`);
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

    if (!success) {
      return this.error(
        "git_error",
        "Failed to get git blame for symbol",
        "Ensure file is tracked by git"
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
    });
  }
}

/**
 * Validate all documentation references.
 * Scans docs/ for markdown files with [ref:file:symbol:hash] patterns.
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
        total_refs: 0,
      });
    }

    const refs: Array<{
      file: string;
      reference: string;
      refFile: string;
      refSymbol: string;
      refHash: string;
    }> = [];

    // Recursively find all markdown files
    const findMarkdownFiles = (dir: string): string[] => {
      const files: string[] = [];
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          files.push(...findMarkdownFiles(fullPath));
        } else if (entry.endsWith(".md")) {
          files.push(fullPath);
        }
      }
      return files;
    };

    // Extract refs from all markdown files
    const refPattern = /\[ref:([^:]+):([^:]+):([a-f0-9]+)\]/g;
    const mdFiles = findMarkdownFiles(absoluteDocsPath);

    for (const mdFile of mdFiles) {
      const content = readFileSync(mdFile, "utf-8");
      let match;
      while ((match = refPattern.exec(content)) !== null) {
        refs.push({
          file: relative(projectRoot, mdFile),
          reference: match[0],
          refFile: match[1],
          refSymbol: match[2],
          refHash: match[3],
        });
      }
    }

    if (refs.length === 0) {
      return this.success({
        message: "No references found in documentation",
        stale: [],
        invalid: [],
        total_refs: 0,
      });
    }

    const stale: Array<{
      doc_file: string;
      reference: string;
      stored_hash: string;
      current_hash: string;
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
        invalid.push({
          doc_file: ref.file,
          reference: ref.reference,
          reason: "File not found",
        });
        continue;
      }

      // Check if file type is supported for symbol validation
      const ext = extname(absoluteRefFile);
      const supported = getSupportedExtensions();
      if (!supported.includes(ext)) {
        // Can't validate symbol hash for unsupported files - file exists, skip hash check
        continue;
      }

      // Check if symbol exists
      const symbolFound = await symbolExists(absoluteRefFile, ref.refSymbol);
      if (!symbolFound) {
        invalid.push({
          doc_file: ref.file,
          reference: ref.reference,
          reason: "Symbol not found",
        });
        continue;
      }

      // Get current hash for symbol
      const symbol = await findSymbol(absoluteRefFile, ref.refSymbol);
      if (!symbol) {
        continue; // Already validated above
      }

      const { hash: mostRecentHash, success } = getMostRecentHashForRange(
        absoluteRefFile,
        symbol.startLine,
        symbol.endLine,
        projectRoot
      );

      if (!success) {
        invalid.push({
          doc_file: ref.file,
          reference: ref.reference,
          reason: "Git blame failed",
        });
        continue;
      }

      if (mostRecentHash !== ref.refHash) {
        stale.push({
          doc_file: ref.file,
          reference: ref.reference,
          stored_hash: ref.refHash,
          current_hash: mostRecentHash,
        });
      }
    }

    return this.success({
      message: `Validated ${refs.length} references`,
      total_refs: refs.length,
      stale_count: stale.length,
      invalid_count: invalid.length,
      stale,
      invalid,
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
        const possibleDocPaths = [
          join(docsPath, entryRelPath + ".md"),
          join(docsPath, dirname(entryRelPath), entry.replace(extname(entry), ".md")),
          join(docsPath, entryRelPath, "README.md"),
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
