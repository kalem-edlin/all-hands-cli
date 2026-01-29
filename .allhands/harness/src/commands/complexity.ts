/**
 * Complexity command - Get complexity metrics for files or directories.
 *
 * Uses ctags to count symbols for broader language support.
 *
 * Command:
 *   ah complexity <path>  - Get complexity metrics
 */

import { Command } from "commander";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, relative, extname } from "path";
import {
  executeCommand,
  parseContext,
  addCommonOptions,
  CommandResult,
} from "../lib/base-command.js";
import { getProjectRoot } from "../lib/git.js";
import {
  checkCtagsAvailable,
  generateCtagsIndex,
  getFileSymbols,
} from "../lib/ctags.js";

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
  for (const fileMap of Array.from(index.values())) {
    for (const entries of Array.from(fileMap.values())) {
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
 * Register complexity command.
 */
export function register(program: Command): void {
  const complexityCmd = program
    .command("complexity")
    .description("Get complexity metrics for file or directory")
    .argument("<path>", "File or directory path");

  addCommonOptions(complexityCmd);

  complexityCmd.action(async (path: string, options) => {
    const context = parseContext(options);
    await executeCommand("complexity", context, () => complexity(path));
  });
}
