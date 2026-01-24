/**
 * Documentation commands - symbol reference formatting and validation.
 *
 * Uses ctags for symbol lookup (instead of AST parsing) for broader language support
 * and simpler implementation.
 *
 * Commands:
 *   ah docs format-reference <file> [symbol]  - Create a validated reference
 *   ah docs validate [--path <path>]          - Validate all refs in docs/
 *   ah docs complexity <path>                 - Get complexity metrics
 *   ah docs tree <path>                       - Get tree with doc coverage
 */

import { Command } from "commander";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
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
  getFileSymbols,
} from "../lib/ctags.js";
import {
  getMostRecentHashForFile,
  validateDocs,
} from "../lib/docs-validation.js";

/**
 * Format a symbol or file reference with git hash.
 *
 * Output: [ref:file:symbol:hash] for symbol refs
 * Output: [ref:file::hash] for file-only refs
 */
async function formatReference(
  file: string,
  symbol?: string
): Promise<CommandResult> {
  const projectRoot = getProjectRoot();
  const absolutePath = file.startsWith("/") ? file : join(projectRoot, file);
  const relativePath = relative(projectRoot, absolutePath);

  // Check file exists
  if (!existsSync(absolutePath)) {
    return {
      success: false,
      error: `file_not_found: File not found: ${relativePath}`,
    };
  }

  // Get file hash
  const { hash: fileHash, success: hashSuccess } = getMostRecentHashForFile(
    absolutePath,
    projectRoot
  );

  if (!hashSuccess || fileHash === "0000000") {
    return {
      success: false,
      error: `uncommitted_file: File ${relativePath} has uncommitted changes or no git history`,
      details: "Commit all changes before generating references: git add -A && git commit",
    };
  }

  // File-only reference (no symbol)
  if (!symbol) {
    const reference = `[ref:${relativePath}::${fileHash}]`;
    return {
      success: true,
      data: {
        reference,
        file: relativePath,
        symbol: null,
        hash: fileHash,
        type: "file-only",
      },
    };
  }

  // Symbol reference - check ctags is available
  const ctagsCheck = checkCtagsAvailable();
  if (!ctagsCheck.available) {
    return {
      success: false,
      error: `ctags_unavailable: ${ctagsCheck.error}`,
    };
  }

  // Find symbol in file
  const entry = findSymbolInFile(absolutePath, symbol, projectRoot);

  if (!entry) {
    // List available symbols for helpful error
    const { entries: allSymbols } = await import("../lib/ctags.js").then((m) =>
      m.generateFileCtags(absolutePath, projectRoot)
    );

    const symbolList = allSymbols
      .slice(0, 10)
      .map((s) => `  - ${s.name} (${s.kind}, line ${s.line})`)
      .join("\n");

    return {
      success: false,
      error: `symbol_not_found: Symbol '${symbol}' not found in ${relativePath}`,
      details: allSymbols.length > 0
        ? `Available symbols:\n${symbolList}${allSymbols.length > 10 ? `\n  ... and ${allSymbols.length - 10} more` : ""}`
        : "No symbols found in file (may be unsupported file type)",
    };
  }

  const reference = `[ref:${relativePath}:${symbol}:${fileHash}]`;

  return {
    success: true,
    data: {
      reference,
      file: relativePath,
      symbol,
      symbol_type: entry.kind,
      line: entry.line,
      hash: fileHash,
      type: "symbol",
    },
  };
}

/**
 * Validate all documentation references.
 */
async function validate(docsPath: string): Promise<CommandResult> {
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

  // Run validation
  const result = validateDocs(absoluteDocsPath, projectRoot);

  // Consider it a success even with issues (issues are in the data)
  return { success: true, data: result };
}

/**
 * Get complexity metrics for a file or directory.
 * Uses ctags to count symbols instead of AST parsing.
 */
async function complexity(pathArg: string): Promise<CommandResult> {
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

  // Check ctags availability
  const ctagsCheck = checkCtagsAvailable();
  if (!ctagsCheck.available) {
    return {
      success: false,
      error: `ctags_unavailable: ${ctagsCheck.error}`,
    };
  }

  const stat = statSync(absolutePath);

  if (stat.isFile()) {
    // Single file complexity
    const content = readFileSync(absolutePath, "utf-8");
    const lines = content.split("\n").length;

    // Get symbols via ctags
    const { index } = generateCtagsIndex(projectRoot, { target: relativePath });
    const symbols = getFileSymbols(index, relativePath);

    const functions = symbols.filter(
      (s) => s.kind === "function" || s.kind === "method"
    ).length;
    const classes = symbols.filter((s) => s.kind === "class").length;
    const interfaces = symbols.filter(
      (s) => s.kind === "interface" || s.kind === "type"
    ).length;

    // Count imports/exports with regex (simple heuristic)
    const importMatches = content.match(/^import\s/gm);
    const exportMatches = content.match(/^export\s/gm);

    return {
      success: true,
      data: {
        path: relativePath,
        type: "file",
        metrics: {
          lines,
          functions,
          classes,
          interfaces,
          imports: importMatches?.length || 0,
          exports: exportMatches?.length || 0,
          total_symbols: symbols.length,
        },
        estimated_tokens: Math.ceil(lines * 10),
      },
    };
  }

  // Directory complexity
  const { index, entryCount } = generateCtagsIndex(projectRoot, {
    target: relativePath,
  });

  // Aggregate stats
  let totalLines = 0;
  let totalFunctions = 0;
  let totalClasses = 0;
  let totalInterfaces = 0;
  let fileCount = 0;

  // Find source files and count lines
  const countDir = (dir: string): void => {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (entry.startsWith(".") || entry === "node_modules") continue;
      const fullPath = join(dir, entry);
      const entryStat = statSync(fullPath);
      if (entryStat.isDirectory()) {
        countDir(fullPath);
      } else {
        const ext = extname(entry);
        if ([".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java"].includes(ext)) {
          fileCount++;
          const content = readFileSync(fullPath, "utf-8");
          totalLines += content.split("\n").length;
        }
      }
    }
  };

  countDir(absolutePath);

  // Count symbol types from index
  for (const fileMap of index.values()) {
    for (const entries of fileMap.values()) {
      for (const entry of entries) {
        if (entry.kind === "function" || entry.kind === "method") {
          totalFunctions++;
        } else if (entry.kind === "class") {
          totalClasses++;
        } else if (entry.kind === "interface" || entry.kind === "type") {
          totalInterfaces++;
        }
      }
    }
  }

  return {
    success: true,
    data: {
      path: relativePath,
      type: "directory",
      file_count: fileCount,
      metrics: {
        lines: totalLines,
        functions: totalFunctions,
        classes: totalClasses,
        interfaces: totalInterfaces,
        total_symbols: entryCount,
      },
      estimated_tokens: Math.ceil(totalLines * 10),
    },
  };
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
 * Register docs commands.
 */
export function register(program: Command): void {
  const docs = program.command("docs").description("Documentation management and validation");

  // format-reference
  const formatRefCmd = docs
    .command("format-reference")
    .description("Format a symbol or file reference with git hash")
    .argument("<file>", "Path to source file")
    .argument("[symbol]", "Symbol name (optional for file-only refs)");

  addCommonOptions(formatRefCmd);

  formatRefCmd.action(async (file: string, symbol: string | undefined, options) => {
    const context = parseContext(options);
    await executeCommand("docs:format-reference", context, () =>
      formatReference(file, symbol)
    );
  });

  // validate
  const validateCmd = docs
    .command("validate")
    .description("Validate all documentation references")
    .option("--path <path>", "Docs directory path", "docs/");

  addCommonOptions(validateCmd);

  validateCmd.action(async (options) => {
    const context = parseContext(options);
    await executeCommand("docs:validate", context, () => validate(options.path));
  });

  // complexity
  const complexityCmd = docs
    .command("complexity")
    .description("Get complexity metrics for file or directory")
    .argument("<path>", "File or directory path");

  addCommonOptions(complexityCmd);

  complexityCmd.action(async (path: string, options) => {
    const context = parseContext(options);
    await executeCommand("docs:complexity", context, () => complexity(path));
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
}
