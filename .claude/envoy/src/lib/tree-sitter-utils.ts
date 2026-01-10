/**
 * Tree-sitter utilities for AST parsing and symbol resolution.
 * Used by docs commands for symbol lookup and validation.
 */

import { readFileSync, existsSync } from "fs";
import { extname } from "path";
import {
  getLanguageForExtension,
  getQueriesForLanguage,
  type LanguageQueries,
} from "./ast-queries.js";

export interface SymbolLocation {
  name: string;
  startLine: number;
  endLine: number;
  type: string;
}

export interface ParseResult {
  success: boolean;
  language?: string;
  symbols?: SymbolLocation[];
  error?: string;
  warnings?: string[]; // Non-fatal issues during parsing (e.g., query failures)
}

// Tree-sitter Query types
interface QueryCapture {
  name: string;
  node: {
    text: string;
    startPosition: { row: number; column: number };
    endPosition: { row: number; column: number };
  };
}

interface QueryMatch {
  pattern: number;
  captures: QueryCapture[];
}

interface Query {
  matches(node: unknown): QueryMatch[];
}

interface QueryConstructor {
  new (grammar: unknown, queryString: string): Query;
}

// Parser data type including Query constructor
interface ParserData {
  parser: unknown;
  grammar: unknown;
  QueryClass: QueryConstructor;
}

// Lazy-loaded parsers cache - stores parser, grammar, and Query class
const parserCache = new Map<string, ParserData>();

/**
 * Get or create a tree-sitter parser for a language.
 * Lazily loads grammars to avoid startup cost.
 * Returns parser, grammar, and Query class (needed for Query API).
 */
async function getParser(language: string): Promise<ParserData | null> {
  if (parserCache.has(language)) {
    return parserCache.get(language)!;
  }

  try {
    // Dynamic import tree-sitter
    const TreeSitter = await import("tree-sitter");
    const Parser = TreeSitter.default;
    const QueryClass = (TreeSitter as unknown as { Query: QueryConstructor }).Query;

    // Load language grammar
    let grammar: unknown;
    switch (language) {
      case "typescript":
        grammar = (await import("tree-sitter-typescript")).default.typescript;
        break;
      case "javascript":
        grammar = (await import("tree-sitter-javascript")).default;
        break;
      case "python":
        grammar = (await import("tree-sitter-python")).default;
        break;
      case "go":
        grammar = (await import("tree-sitter-go")).default;
        break;
      case "rust":
        grammar = (await import("tree-sitter-rust")).default;
        break;
      case "java":
        grammar = (await import("tree-sitter-java")).default;
        break;
      case "ruby":
        grammar = (await import("tree-sitter-ruby")).default;
        break;
      case "swift":
        grammar = (await import("tree-sitter-swift")).default;
        break;
      default:
        return null;
    }

    const parser = new Parser();
    parser.setLanguage(grammar as Parameters<typeof parser.setLanguage>[0]);
    const cached: ParserData = { parser, grammar, QueryClass };
    parserCache.set(language, cached);
    return cached;
  } catch (e) {
    // Detect native binding failures
    const errorMsg = e instanceof Error ? e.message : String(e);
    if (
      errorMsg.includes("MODULE_NOT_FOUND") ||
      errorMsg.includes("invalid ELF header") ||
      errorMsg.includes("was compiled against a different Node.js version") ||
      errorMsg.includes("dlopen") ||
      errorMsg.includes(".node")
    ) {
      console.error(
        `Native binding error for ${language} parser. ` +
        `This usually means tree-sitter was compiled for a different Node.js version. ` +
        `Try: rm -rf node_modules && npm install`
      );
    } else {
      console.error(`Failed to load parser for ${language}:`, e);
    }
    return null;
  }
}

/**
 * Parse a file and extract all symbol definitions.
 */
export async function parseFile(filePath: string): Promise<ParseResult> {
  const ext = extname(filePath);
  const language = getLanguageForExtension(ext);

  if (!language) {
    return {
      success: false,
      error: `Unsupported file extension: ${ext}`,
    };
  }

  if (!existsSync(filePath)) {
    return {
      success: false,
      error: `File not found: ${filePath}`,
    };
  }

  const parserData = await getParser(language);
  if (!parserData) {
    return {
      success: false,
      error: `No parser available for ${language}`,
    };
  }

  try {
    const sourceCode = readFileSync(filePath, "utf-8");
    const tree = (parserData.parser as { parse(source: string): unknown }).parse(sourceCode);
    const queries = getQueriesForLanguage(language);

    if (!queries) {
      return {
        success: false,
        error: `No queries defined for ${language}`,
      };
    }

    const { symbols, warnings } = extractSymbols(tree, queries, parserData.grammar, parserData.QueryClass);

    return {
      success: true,
      language,
      symbols,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Find a specific symbol in a file.
 */
export async function findSymbol(
  filePath: string,
  symbolName: string
): Promise<SymbolLocation | null> {
  const result = await parseFile(filePath);

  if (!result.success || !result.symbols) {
    return null;
  }

  return result.symbols.find((s) => s.name === symbolName) || null;
}

/**
 * Check if a symbol exists in a file.
 */
export async function symbolExists(
  filePath: string,
  symbolName: string
): Promise<boolean> {
  const symbol = await findSymbol(filePath, symbolName);
  return symbol !== null;
}

// Cache compiled queries to avoid recompilation
const queryCache = new Map<string, Query>();

interface ExtractResult {
  symbols: SymbolLocation[];
  warnings: string[];
}

/**
 * Extract symbols from a parsed tree using tree-sitter's Query API.
 * This uses the declarative query patterns from ast-queries.ts.
 */
function extractSymbols(
  tree: unknown,
  queries: LanguageQueries,
  grammar: unknown,
  QueryClass: QueryConstructor
): ExtractResult {
  const symbols: SymbolLocation[] = [];
  const warnings: string[] = [];
  const root = (tree as { rootNode: unknown }).rootNode;

  for (const [symbolType, queryDef] of Object.entries(queries)) {
    const cacheKey = `${symbolType}:${queryDef.query}`;

    let query = queryCache.get(cacheKey);
    if (!query) {
      try {
        query = new QueryClass(grammar, queryDef.query);
        queryCache.set(cacheKey, query);
      } catch (e) {
        const msg = `Query compile failed for ${symbolType}: ${e instanceof Error ? e.message : String(e)}`;
        warnings.push(msg);
        continue;
      }
    }

    try {
      const matches = query.matches(root);
      for (const match of matches) {
        const nameCapture = match.captures.find(c => c.name === queryDef.nameCapture);
        // Use defCapture for range if available, otherwise fall back to nameCapture
        const defCaptureName = queryDef.defCapture || queryDef.nameCapture;
        const defCapture = match.captures.find(c => c.name === defCaptureName);
        const rangeNode = defCapture?.node || nameCapture?.node;

        if (nameCapture && rangeNode) {
          symbols.push({
            name: nameCapture.node.text,
            startLine: rangeNode.startPosition.row + 1,
            endLine: rangeNode.endPosition.row + 1,
            type: symbolType,
          });
        }
      }
    } catch (e) {
      const msg = `Query exec failed for ${symbolType}: ${e instanceof Error ? e.message : String(e)}`;
      warnings.push(msg);
      continue;
    }
  }

  return { symbols, warnings };
}

/**
 * Get complexity metrics for a file.
 */
export async function getFileComplexity(filePath: string): Promise<{
  lines: number;
  imports: number;
  exports: number;
  functions: number;
  classes: number;
} | null> {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n").length;

    const result = await parseFile(filePath);
    if (!result.success || !result.symbols) {
      // Fallback to regex-based counting for unsupported files
      return {
        lines,
        imports: (content.match(/^import\s/gm) || []).length,
        exports: (content.match(/^export\s/gm) || []).length,
        functions: (content.match(/function\s+\w+/g) || []).length,
        classes: (content.match(/class\s+\w+/g) || []).length,
      };
    }

    const functions = result.symbols.filter(
      (s) => s.type === "function" || s.type === "method" || s.type === "arrowFunction"
    ).length;
    const classes = result.symbols.filter(
      (s) => s.type === "class" || s.type === "struct" || s.type === "interface"
    ).length;

    // Count imports/exports via regex (simpler than AST for this)
    const imports = (content.match(/^import\s/gm) || []).length;
    const exports = (content.match(/^export\s/gm) || []).length;

    return { lines, imports, exports, functions, classes };
  } catch {
    return null;
  }
}
