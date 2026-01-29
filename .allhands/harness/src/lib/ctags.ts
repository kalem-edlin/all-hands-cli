/**
 * Ctags utilities for symbol lookup and validation.
 *
 * Uses universal-ctags to generate a symbol index for fast O(1) lookups.
 * This enables documentation reference validation without AST parsing.
 */

import { spawnSync } from "child_process";
import { existsSync } from "fs";

/**
 * Single ctags entry representing a symbol in a file.
 */
export interface CtagsEntry {
  name: string;
  path: string;
  line: number;
  kind: string;
  signature?: string;
}

/**
 * Indexed ctags data for O(1) lookups.
 * Structure: Map<file, Map<symbol, CtagsEntry[]>>
 * Multiple entries per symbol possible (overloads, same name in different scopes).
 */
export type CtagsIndex = Map<string, Map<string, CtagsEntry[]>>;

/**
 * Common paths where universal-ctags might be installed.
 * Checked in order before falling back to PATH.
 */
const CTAGS_PATHS = [
  "/opt/homebrew/bin/ctags", // macOS ARM homebrew
  "/usr/local/bin/ctags", // macOS Intel homebrew / Linux
  "/usr/bin/ctags", // System PATH (may be BSD ctags)
  "ctags", // Fall back to PATH
];

/** Cached path to universal-ctags binary */
let cachedCtagsPath: string | null = null;

/**
 * Find the universal-ctags binary, checking common paths first.
 */
function findUniversalCtags(): { path: string; version: string } | null {
  for (const ctagsPath of CTAGS_PATHS) {
    // Skip absolute paths that don't exist
    if (ctagsPath.startsWith("/") && !existsSync(ctagsPath)) {
      continue;
    }

    const result = spawnSync(ctagsPath, ["--version"], { encoding: "utf-8" });

    if (result.status !== 0) {
      continue;
    }

    const output = result.stdout || "";
    if (output.includes("Universal Ctags") || output.includes("universal-ctags")) {
      const versionMatch = output.match(/Universal Ctags\s+([\d.]+)/i);
      const version = versionMatch ? versionMatch[1] : "unknown";
      return { path: ctagsPath, version };
    }
  }

  return null;
}

/**
 * Get the path to universal-ctags (cached).
 */
export function getCtagsPath(): string | null {
  if (cachedCtagsPath !== null) {
    return cachedCtagsPath;
  }

  const found = findUniversalCtags();
  if (found) {
    cachedCtagsPath = found.path;
    return cachedCtagsPath;
  }

  return null;
}

/**
 * Check if ctags (universal-ctags) is available.
 */
export function checkCtagsAvailable(): { available: boolean; version?: string; error?: string; path?: string } {
  const found = findUniversalCtags();

  if (!found) {
    return {
      available: false,
      error:
        "Universal Ctags not found. Install with: brew install universal-ctags\n" +
        "Note: The BSD ctags that ships with macOS is not compatible.",
    };
  }

  cachedCtagsPath = found.path;

  return {
    available: true,
    version: found.version,
    path: found.path,
  };
}

/**
 * Parse a single line of ctags JSON output.
 */
function parseCtagsLine(line: string): CtagsEntry | null {
  try {
    const entry = JSON.parse(line);

    // Skip ptag entries (pseudo-tags with metadata)
    if (entry._type === "ptag") {
      return null;
    }

    if (entry._type !== "tag" || !entry.name || !entry.path) {
      return null;
    }

    return {
      name: entry.name,
      path: entry.path,
      line: entry.line || 0,
      kind: entry.kind || "unknown",
      signature: entry.signature,
    };
  } catch {
    return null;
  }
}

/**
 * Generate a ctags index for a directory.
 *
 * Uses ctags with JSON output format for reliable parsing.
 * Excludes common non-source directories.
 */
export function generateCtagsIndex(
  cwd: string,
  options?: {
    /** Additional exclude patterns */
    exclude?: string[];
    /** Specific file or directory to index (relative to cwd) */
    target?: string;
  }
): { index: CtagsIndex; success: boolean; error?: string; entryCount: number } {
  const check = checkCtagsAvailable();
  if (!check.available) {
    return {
      index: new Map(),
      success: false,
      error: check.error,
      entryCount: 0,
    };
  }

  const excludes = [
    "node_modules",
    ".git",
    "dist",
    "build",
    ".next",
    "coverage",
    "__pycache__",
    ".venv",
    "venv",
    ...(options?.exclude || []),
  ];

  const args = [
    "-R",
    "--output-format=json",
    "--fields=+nKS", // +n=line number, +K=kind, +S=signature
    "-o",
    "-", // Output to stdout
  ];

  // Add exclude patterns
  for (const exclude of excludes) {
    args.push(`--exclude=${exclude}`);
  }

  // Add target if specified, otherwise index current directory
  const target = options?.target || ".";
  args.push(target);

  const ctagsPath = getCtagsPath()!;
  const result = spawnSync(ctagsPath, args, {
    encoding: "utf-8",
    cwd,
    maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large repos
  });

  if (result.status !== 0) {
    return {
      index: new Map(),
      success: false,
      error: `ctags failed: ${result.stderr || "unknown error"}`,
      entryCount: 0,
    };
  }

  // Parse JSON output into index
  const index: CtagsIndex = new Map();
  let entryCount = 0;

  const lines = result.stdout.split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;

    const entry = parseCtagsLine(line);
    if (!entry) continue;

    entryCount++;

    // Get or create file map
    let fileMap = index.get(entry.path);
    if (!fileMap) {
      fileMap = new Map();
      index.set(entry.path, fileMap);
    }

    // Get or create symbol array
    let symbols = fileMap.get(entry.name);
    if (!symbols) {
      symbols = [];
      fileMap.set(entry.name, symbols);
    }

    symbols.push(entry);
  }

  return { index, success: true, entryCount };
}

/**
 * Look up a symbol in a specific file.
 *
 * Returns all matching entries (may have multiple for overloads).
 */
export function lookupSymbol(
  index: CtagsIndex,
  filePath: string,
  symbolName: string
): CtagsEntry[] {
  const fileMap = index.get(filePath);
  if (!fileMap) {
    return [];
  }

  return fileMap.get(symbolName) || [];
}

/**
 * Look up a symbol in any file (for searching).
 *
 * Returns all matching entries across all files.
 */
export function searchSymbol(
  index: CtagsIndex,
  symbolName: string
): Array<CtagsEntry & { file: string }> {
  const results: Array<CtagsEntry & { file: string }> = [];

  for (const [file, fileMap] of index) {
    const entries = fileMap.get(symbolName);
    if (entries) {
      for (const entry of entries) {
        results.push({ ...entry, file });
      }
    }
  }

  return results;
}

/**
 * Get all symbols in a file.
 */
export function getFileSymbols(index: CtagsIndex, filePath: string): CtagsEntry[] {
  const fileMap = index.get(filePath);
  if (!fileMap) {
    return [];
  }

  const symbols: CtagsEntry[] = [];
  for (const entries of fileMap.values()) {
    symbols.push(...entries);
  }

  // Sort by line number
  return symbols.sort((a, b) => a.line - b.line);
}

/**
 * Generate ctags for a single file (faster for format-reference command).
 */
export function generateFileCtags(
  filePath: string,
  cwd: string
): { entries: CtagsEntry[]; success: boolean; error?: string } {
  if (!existsSync(filePath)) {
    return { entries: [], success: false, error: "File not found" };
  }

  const check = checkCtagsAvailable();
  if (!check.available) {
    return { entries: [], success: false, error: check.error };
  }

  const args = [
    "--output-format=json",
    "--fields=+nKS",
    "-o",
    "-",
    filePath,
  ];

  const ctagsPath = getCtagsPath()!;
  const result = spawnSync(ctagsPath, args, {
    encoding: "utf-8",
    cwd,
    maxBuffer: 10 * 1024 * 1024, // 10MB buffer
  });

  if (result.status !== 0) {
    return {
      entries: [],
      success: false,
      error: `ctags failed: ${result.stderr || "unknown error"}`,
    };
  }

  const entries: CtagsEntry[] = [];
  const lines = result.stdout.split("\n");

  for (const line of lines) {
    if (!line.trim()) continue;

    const entry = parseCtagsLine(line);
    if (entry) {
      entries.push(entry);
    }
  }

  return { entries, success: true };
}

/**
 * Find a specific symbol in a file (convenience function).
 * Uses single-file ctags for efficiency.
 */
export function findSymbolInFile(
  filePath: string,
  symbolName: string,
  cwd: string
): CtagsEntry | null {
  const { entries, success } = generateFileCtags(filePath, cwd);
  if (!success) {
    return null;
  }

  // Return first match (usually there's only one)
  return entries.find((e) => e.name === symbolName) || null;
}
