/**
 * Complexity command - Get complexity metrics for files or directories.
 *
 * Provides line counts and estimated token counts for source files.
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

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ".swift", ".rb", ".kt"];

/**
 * Get complexity metrics for a file or directory.
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

  const stat = statSync(absolutePath);

  if (stat.isFile()) {
    const content = readFileSync(absolutePath, "utf-8");
    const lines = content.split("\n").length;

    return {
      success: true,
      data: {
        path: relativePath,
        type: "file",
        metrics: { lines },
        estimated_tokens: Math.ceil(lines * 10),
      },
    };
  }

  // Directory complexity
  let totalLines = 0;
  let fileCount = 0;

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
        if (SOURCE_EXTENSIONS.includes(ext)) {
          fileCount++;
          const content = readFileSync(fullPath, "utf-8");
          totalLines += content.split("\n").length;
        }
      }
    }
  };

  countDir(absolutePath);

  return {
    success: true,
    data: {
      path: relativePath,
      type: "directory",
      file_count: fileCount,
      metrics: { lines: totalLines },
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
