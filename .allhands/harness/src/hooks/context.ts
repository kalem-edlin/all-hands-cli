/**
 * Context Hooks - TLDR-powered context injection
 *
 * PreToolUse and PostToolUse hooks that use TLDR daemon for
 * token-efficient code analysis and context injection.
 *
 * All hooks gracefully degrade if TLDR is not installed.
 */

import type { Command } from 'commander';
import { existsSync, statSync } from 'fs';
import {
  HookInput,
  readHookInput,
  allowTool,
  outputContext,
  preToolContext,
  getProjectDir,
  SearchContext,
  saveSearchContext,
  loadSearchContext,
  denyTool,
} from './shared.js';
import { logHookStart } from '../lib/trace-store.js';
import {
  isTldrInstalled,
  isTldrDaemonRunning,
  contextDaemon,
  cfgDaemon,
  dfgDaemon,
  archDaemon,
  extractDaemon,
  searchDaemon,
  diagnosticsDaemon,
  notifyFileChanged,
  impactDaemon,
} from '../lib/tldr.js';

// ─────────────────────────────────────────────────────────────────────────────
// Hook Names
// ─────────────────────────────────────────────────────────────────────────────

const HOOK_TLDR_INJECT = 'context tldr-inject';
const HOOK_EDIT_INJECT = 'context edit-inject';
const HOOK_ARCH_INJECT = 'context arch-inject';
const HOOK_SIGNATURE = 'context signature';
const HOOK_DIAGNOSTICS = 'context diagnostics';
const HOOK_IMPORT_VALIDATE = 'context import-validate';
const HOOK_EDIT_NOTIFY = 'context edit-notify';
const HOOK_READ_ENFORCER = 'context read-enforcer';
const HOOK_SEARCH_ROUTER = 'context search-router';
const HOOK_IMPACT_REFACTOR = 'context impact-refactor';

// ─────────────────────────────────────────────────────────────────────────────
// Intent Detection
// ─────────────────────────────────────────────────────────────────────────────

type AnalysisIntent =
  | 'debug'      // debug/investigate → Call Graph + CFG
  | 'dataflow'   // where does X come from → DFG
  | 'slice'      // what affects line Z → PDG/slice
  | 'structure'  // show structure → AST only
  | 'arch'       // plan/design/refactor → Architecture layers
  | 'default';   // Default → Call Graph

/**
 * Detect analysis intent from prompt content.
 */
function detectIntent(prompt: string): AnalysisIntent {
  const lower = prompt.toLowerCase();

  // Debug/investigate patterns
  if (
    lower.includes('debug') ||
    lower.includes('investigate') ||
    lower.includes('trace') ||
    lower.includes('why does') ||
    lower.includes('how does')
  ) {
    return 'debug';
  }

  // Data flow patterns
  if (
    lower.includes('where does') ||
    lower.includes('come from') ||
    lower.includes('origin of') ||
    lower.includes('source of') ||
    lower.includes('data flow')
  ) {
    return 'dataflow';
  }

  // Slice/affect patterns
  if (
    lower.includes('what affects') ||
    lower.includes('depends on') ||
    lower.includes('impact of') ||
    lower.includes('slice')
  ) {
    return 'slice';
  }

  // Structure patterns
  if (
    lower.includes('show structure') ||
    lower.includes('list functions') ||
    lower.includes('list classes') ||
    lower.includes('symbols in')
  ) {
    return 'structure';
  }

  // Architecture patterns
  if (
    lower.includes('plan') ||
    lower.includes('design') ||
    lower.includes('refactor') ||
    lower.includes('architecture') ||
    lower.includes('overview')
  ) {
    return 'arch';
  }

  return 'default';
}

/**
 * Extract function/symbol references from prompt.
 */
function extractReferences(prompt: string): string[] {
  const refs: string[] = [];

  // Match function-like references: func(), Class.method(), etc.
  const funcPattern = /\b([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)\s*\(/g;
  let match;
  while ((match = funcPattern.exec(prompt)) !== null) {
    refs.push(match[1]);
  }

  // Match backtick references: `functionName`
  const backtickPattern = /`([A-Za-z_][A-Za-z0-9_.]*)`/g;
  while ((match = backtickPattern.exec(prompt)) !== null) {
    refs.push(match[1]);
  }

  return [...new Set(refs)]; // Deduplicate
}

// ─────────────────────────────────────────────────────────────────────────────
// PreToolUse: tldr-context-inject (Task)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inject TLDR context for Task tool based on intent.
 *
 * Routes to different analysis layers:
 * - debug → Call Graph + CFG
 * - dataflow → DFG
 * - arch → Architecture layers
 * - default → Call Graph
 */
function tldrContextInject(input: HookInput): void {
  const projectDir = getProjectDir();

  if (!isTldrInstalled() || !isTldrDaemonRunning(projectDir)) {
    allowTool(HOOK_TLDR_INJECT);
  }

  const prompt = (input.tool_input?.prompt as string) || '';
  if (!prompt) {
    allowTool(HOOK_TLDR_INJECT);
  }

  const intent = detectIntent(prompt);
  const refs = extractReferences(prompt);
  const contextParts: string[] = [];

  switch (intent) {
    case 'debug': {
      // Call graph + CFG for referenced functions
      for (const ref of refs.slice(0, 3)) {
        const ctx = contextDaemon(ref, projectDir);
        if (ctx) {
          contextParts.push(`## Call Graph: ${ref}`);
          contextParts.push(`Callers: ${ctx.callers.join(', ') || 'none'}`);
          contextParts.push(`Callees: ${ctx.callees.join(', ') || 'none'}`);

          // Try to get CFG if we can identify the file
          const searchResults = searchDaemon(ref, projectDir);
          if (searchResults.length > 0) {
            const cfg = cfgDaemon(searchResults[0].file, ref, projectDir);
            if (cfg) {
              contextParts.push(`\n### Control Flow (${ref})`);
              contextParts.push(`Nodes: ${cfg.nodes.length}, Edges: ${cfg.edges.length}`);
            }
          }
        }
      }
      break;
    }

    case 'dataflow': {
      // DFG for referenced functions
      for (const ref of refs.slice(0, 3)) {
        const searchResults = searchDaemon(ref, projectDir);
        if (searchResults.length > 0) {
          const dfg = dfgDaemon(searchResults[0].file, ref, projectDir);
          if (dfg) {
            contextParts.push(`## Data Flow: ${ref}`);
            for (const v of dfg.variables.slice(0, 5)) {
              contextParts.push(`- ${v.name}: defined at ${v.definitions.join(',')}, used at ${v.uses.join(',')}`);
            }
          }
        }
      }
      break;
    }

    case 'arch': {
      const arch = archDaemon(projectDir);
      if (arch) {
        contextParts.push('## Architecture Layers');
        for (const layer of arch.layers) {
          contextParts.push(`\n### ${layer.name}`);
          if (layer.description) {
            contextParts.push(layer.description);
          }
          contextParts.push(`Files: ${layer.files.slice(0, 10).join(', ')}${layer.files.length > 10 ? '...' : ''}`);
        }
      }
      break;
    }

    case 'structure': {
      // Extract symbols from referenced files
      for (const ref of refs.slice(0, 3)) {
        const searchResults = searchDaemon(ref, projectDir);
        if (searchResults.length > 0) {
          const extract = extractDaemon(searchResults[0].file, projectDir);
          if (extract) {
            contextParts.push(`## Structure: ${searchResults[0].file}`);
            // Show classes first
            for (const cls of (extract.classes || []).slice(0, 5)) {
              contextParts.push(`- class ${cls.name} (line ${cls.line_number})`);
            }
            // Then functions
            for (const fn of extract.functions.slice(0, 10)) {
              contextParts.push(`- function ${fn.name} (line ${fn.line_number})`);
            }
          }
        }
      }
      break;
    }

    default: {
      // Default: Call graph for referenced functions
      for (const ref of refs.slice(0, 3)) {
        const ctx = contextDaemon(ref, projectDir);
        if (ctx) {
          contextParts.push(`## ${ref}`);
          contextParts.push(`Callers: ${ctx.callers.join(', ') || 'none'}`);
          contextParts.push(`Callees: ${ctx.callees.join(', ') || 'none'}`);
        }
      }
    }
  }

  if (contextParts.length > 0) {
    preToolContext(`# TLDR Analysis (${intent})\n\n${contextParts.join('\n')}`, HOOK_TLDR_INJECT);
  }

  allowTool(HOOK_TLDR_INJECT);
}

// ─────────────────────────────────────────────────────────────────────────────
// PreToolUse: edit-context-inject (Edit)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inject file structure context before edits.
 */
function editContextInject(input: HookInput): void {
  const projectDir = getProjectDir();

  if (!isTldrInstalled() || !isTldrDaemonRunning(projectDir)) {
    allowTool(HOOK_EDIT_INJECT);
  }

  const filePath = (input.tool_input?.file_path as string) || '';
  if (!filePath) {
    allowTool(HOOK_EDIT_INJECT);
  }

  const extract = extractDaemon(filePath, projectDir);
  if (!extract || extract.functions.length === 0) {
    allowTool(HOOK_EDIT_INJECT);
  }

  const contextParts: string[] = ['## File Structure', ''];

  // Classes come from separate array in extract
  const classes = extract!.classes || [];
  const functions = extract!.functions || [];

  if (classes.length > 0) {
    contextParts.push('### Classes');
    for (const c of classes) {
      contextParts.push(`- ${c.name} (line ${c.line_number})`);
    }
  }

  if (functions.length > 0) {
    contextParts.push('\n### Functions');
    for (const f of functions.slice(0, 15)) {
      const sig = f.signature ? `: ${f.signature}` : '';
      contextParts.push(`- ${f.name}${sig} (line ${f.line_number})`);
    }
    if (functions.length > 15) {
      contextParts.push(`... and ${functions.length - 15} more`);
    }
  }

  if (extract!.imports.length > 0) {
    contextParts.push('\n### Imports');
    contextParts.push(extract!.imports.slice(0, 10).map(i => i.module).join(', '));
  }

  preToolContext(contextParts.join('\n'), HOOK_EDIT_INJECT);
}

// ─────────────────────────────────────────────────────────────────────────────
// PreToolUse: arch-context-inject (Task for planning)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inject architecture layers for planning tasks.
 */
function archContextInject(input: HookInput): void {
  const projectDir = getProjectDir();

  if (!isTldrInstalled() || !isTldrDaemonRunning(projectDir)) {
    allowTool(HOOK_ARCH_INJECT);
  }

  const prompt = (input.tool_input?.prompt as string) || '';

  // Only inject for planning-related prompts
  const lower = prompt.toLowerCase();
  if (
    !lower.includes('plan') &&
    !lower.includes('design') &&
    !lower.includes('architect') &&
    !lower.includes('overview') &&
    !lower.includes('structure')
  ) {
    allowTool(HOOK_ARCH_INJECT);
  }

  const arch = archDaemon(projectDir);
  if (!arch) {
    allowTool(HOOK_ARCH_INJECT);
  }

  const contextParts: string[] = ['## Project Architecture', ''];

  for (const layer of arch!.layers) {
    contextParts.push(`### ${layer.name}`);
    if (layer.description) {
      contextParts.push(layer.description);
    }
    contextParts.push(`Files: ${layer.files.slice(0, 8).join(', ')}${layer.files.length > 8 ? '...' : ''}`);
    contextParts.push('');
  }

  if (arch!.dependencies.length > 0) {
    contextParts.push('### Layer Dependencies');
    for (const dep of arch!.dependencies.slice(0, 10)) {
      contextParts.push(`- ${dep.from} -> ${dep.to}`);
    }
  }

  preToolContext(contextParts.join('\n'), HOOK_ARCH_INJECT);
}

// ─────────────────────────────────────────────────────────────────────────────
// PreToolUse: signature-helper (Edit)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Inject function signatures for called functions in edit context.
 */
function signatureHelper(input: HookInput): void {
  const projectDir = getProjectDir();

  if (!isTldrInstalled() || !isTldrDaemonRunning(projectDir)) {
    allowTool(HOOK_SIGNATURE);
  }

  const newString = (input.tool_input?.new_string as string) || '';
  if (!newString) {
    allowTool(HOOK_SIGNATURE);
  }

  // Extract function calls from the new code
  const refs = extractReferences(newString);
  if (refs.length === 0) {
    allowTool(HOOK_SIGNATURE);
  }

  const signatures: string[] = [];

  for (const ref of refs.slice(0, 5)) {
    const results = searchDaemon(ref, projectDir);
    for (const result of results.slice(0, 1)) {
      if (result.signature) {
        signatures.push(`${ref}: ${result.signature}`);
      }
    }
  }

  if (signatures.length > 0) {
    preToolContext(`## Referenced Signatures\n\n${signatures.join('\n')}`, HOOK_SIGNATURE);
  }

  allowTool(HOOK_SIGNATURE);
}

// ─────────────────────────────────────────────────────────────────────────────
// PostToolUse: post-edit-diagnostics (Edit/Write)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run pyright+ruff diagnostics via TLDR daemon after edits.
 */
function postEditDiagnostics(input: HookInput): void {
  const projectDir = getProjectDir();

  if (!isTldrInstalled() || !isTldrDaemonRunning(projectDir)) {
    allowTool(HOOK_DIAGNOSTICS);
  }

  const filePath = (input.tool_input?.file_path as string) || '';
  if (!filePath) {
    allowTool(HOOK_DIAGNOSTICS);
  }

  // Only for Python files
  if (!filePath.endsWith('.py')) {
    allowTool(HOOK_DIAGNOSTICS);
  }

  const diag = diagnosticsDaemon(filePath, projectDir);
  if (!diag || diag.errors.length === 0) {
    allowTool(HOOK_DIAGNOSTICS);
  }

  const errors = diag!.errors.filter((e) => e.severity === 'error');
  const warnings = diag!.errors.filter((e) => e.severity === 'warning');

  if (errors.length === 0) {
    allowTool(HOOK_DIAGNOSTICS);
  }

  const contextParts: string[] = ['## TLDR Diagnostics'];

  if (errors.length > 0) {
    contextParts.push('\n### Errors');
    for (const e of errors.slice(0, 5)) {
      contextParts.push(`- ${filePath}:${e.line}:${e.column} [${e.source}] ${e.message}`);
    }
  }

  if (warnings.length > 0 && warnings.length <= 3) {
    contextParts.push('\n### Warnings');
    for (const w of warnings.slice(0, 3)) {
      contextParts.push(`- ${filePath}:${w.line} [${w.source}] ${w.message}`);
    }
  }

  contextParts.push('\nPlease fix these issues.');

  outputContext(contextParts.join('\n'), HOOK_DIAGNOSTICS);
}

// ─────────────────────────────────────────────────────────────────────────────
// PostToolUse: import-validator (Write/Edit)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate import paths against known symbols.
 */
function importValidator(input: HookInput): void {
  const projectDir = getProjectDir();

  if (!isTldrInstalled() || !isTldrDaemonRunning(projectDir)) {
    allowTool(HOOK_IMPORT_VALIDATE);
  }

  const filePath = (input.tool_input?.file_path as string) || '';
  if (!filePath) {
    allowTool(HOOK_IMPORT_VALIDATE);
  }

  // Only for Python files
  if (!filePath.endsWith('.py')) {
    allowTool(HOOK_IMPORT_VALIDATE);
  }

  const extract = extractDaemon(filePath, projectDir);
  if (!extract || extract.imports.length === 0) {
    allowTool(HOOK_IMPORT_VALIDATE);
  }

  const invalidImports: string[] = [];

  // Python standard library modules to skip
  const STDLIB_MODULES = new Set([
    'os', 'sys', 'typing', 'pathlib', 'json', 're', 'io', 'abc', 'collections',
    'itertools', 'functools', 'dataclasses', 'enum', 'datetime', 'time', 'math',
    'random', 'copy', 'logging', 'warnings', 'contextlib', 'inspect', 'types',
    'subprocess', 'shutil', 'tempfile', 'glob', 'fnmatch', 'hashlib', 'hmac',
    'secrets', 'struct', 'codecs', 'unicodedata', 'string', 'textwrap', 'difflib',
    'unittest', 'pytest', 'asyncio', 'concurrent', 'threading', 'multiprocessing',
    'socket', 'ssl', 'http', 'urllib', 'email', 'html', 'xml', 'base64', 'binascii',
    'pickle', 'shelve', 'sqlite3', 'csv', 'configparser', 'argparse', 'getopt',
    'pprint', 'reprlib', 'traceback', 'gc', 'weakref', 'array', 'bisect', 'heapq',
    'operator', 'decimal', 'fractions', 'statistics', 'cmath', 'numbers',
  ]);

  for (const imp of extract!.imports) {
    const moduleName = imp.module;

    // Skip standard library and common packages
    // Module name is the root module (e.g., "os" from "os.path")
    const rootModule = moduleName.split('.')[0];
    if (STDLIB_MODULES.has(rootModule)) {
      continue;
    }

    // Skip common third-party packages
    const commonPackages = ['numpy', 'pandas', 'requests', 'flask', 'django', 'pytest', 'pydantic'];
    if (commonPackages.includes(rootModule)) {
      continue;
    }

    // Check if it's a local relative import (indicated by is_from with relative path)
    if (imp.is_from && moduleName.startsWith('.')) {
      // Try to find the module in the project
      const searchPattern = moduleName.replace(/^\.+/, '');
      if (searchPattern) {
        const results = searchDaemon(searchPattern, projectDir);
        if (results.length === 0) {
          invalidImports.push(moduleName);
        }
      }
    }
  }

  if (invalidImports.length > 0) {
    outputContext(
      `## Import Warnings\n\nThese imports may be invalid:\n${invalidImports.map((i) => `- ${i}`).join('\n')}`,
      HOOK_IMPORT_VALIDATE
    );
  }

  allowTool(HOOK_IMPORT_VALIDATE);
}

// ─────────────────────────────────────────────────────────────────────────────
// PostToolUse: edit-notify (Edit/Write)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Notify TLDR daemon of file changes for incremental indexing.
 */
async function editNotify(input: HookInput): Promise<void> {
  const projectDir = getProjectDir();

  if (!isTldrInstalled()) {
    return allowTool(HOOK_EDIT_NOTIFY);
  }

  // Start daemon if not running (ensures dirty tracking works)
  if (!isTldrDaemonRunning(projectDir)) {
    try {
      const { execSync } = await import('child_process');
      execSync(`tldr daemon start --project "${projectDir}"`, {
        stdio: 'ignore',
        timeout: 5000,
      });
      // Give daemon a moment to start accepting connections
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch {
      // Best effort - continue even if daemon start fails
    }
  }

  const filePath = (input.tool_input?.file_path as string) || '';
  if (!filePath) {
    return allowTool(HOOK_EDIT_NOTIFY);
  }

  // Fire and forget - don't block on notification
  await notifyFileChanged(projectDir, filePath);
  allowTool(HOOK_EDIT_NOTIFY);
}

// ─────────────────────────────────────────────────────────────────────────────
// PreToolUse: tldr-read-enforcer (Read)
// ─────────────────────────────────────────────────────────────────────────────

/** Code file extensions that benefit from TLDR analysis */
const CODE_EXTENSIONS = [
  '.py', '.pyx', '.pyi',  // Python
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',  // JavaScript/TypeScript
  '.go',  // Go
  '.rs',  // Rust
  '.java', '.kt', '.scala',  // JVM
  '.c', '.cpp', '.cc', '.h', '.hpp',  // C/C++
  '.rb',  // Ruby
  '.php',  // PHP
];

/** Minimum line count to trigger TLDR enforcement */
const MIN_LINES_FOR_TLDR = 100;

/**
 * Count lines in a file (approximate, for quick check).
 */
function countFileLines(filePath: string): number {
  try {
    const stats = statSync(filePath);
    // Rough estimate: ~40 chars per line average for code
    return Math.ceil(stats.size / 40);
  } catch {
    return 0;
  }
}

/**
 * Check if file is a code file based on extension.
 */
function isCodeFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return CODE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * TLDR Read Enforcer - intercepts Read on large code files.
 *
 * For large code files (>100 lines), returns TLDR AST/symbol context
 * instead of raw file content, saving ~95% tokens.
 *
 * Bypass conditions:
 * - File has offset/limit params (explicit partial read)
 * - File is not a code file
 * - File is small (<100 lines)
 * - TLDR not installed/running
 * - Recent search context suggests specific location
 */
function tldrReadEnforcer(input: HookInput): void {
  const projectDir = getProjectDir();
  const sessionId = input.session_id || 'default';

  // Always allow if TLDR not available
  if (!isTldrInstalled() || !isTldrDaemonRunning(projectDir)) {
    return allowTool(HOOK_READ_ENFORCER);
  }

  const filePath = (input.tool_input?.file_path as string) || '';
  if (!filePath) {
    return allowTool(HOOK_READ_ENFORCER);
  }

  // Bypass: explicit offset/limit means user wants specific lines
  const offset = input.tool_input?.offset as number | undefined;
  const limit = input.tool_input?.limit as number | undefined;
  if (offset !== undefined || limit !== undefined) {
    return allowTool(HOOK_READ_ENFORCER);
  }

  // Bypass: not a code file
  if (!isCodeFile(filePath)) {
    return allowTool(HOOK_READ_ENFORCER);
  }

  // Bypass: file doesn't exist
  if (!existsSync(filePath)) {
    return allowTool(HOOK_READ_ENFORCER);
  }

  // Bypass: small file
  const lineCount = countFileLines(filePath);
  if (lineCount < MIN_LINES_FOR_TLDR) {
    return allowTool(HOOK_READ_ENFORCER);
  }

  // Check search context - if recent search targeted specific location, allow read
  const searchCtx = loadSearchContext(sessionId);
  if (searchCtx && searchCtx.definitionLocation) {
    return allowTool(HOOK_READ_ENFORCER);
  }

  // Get TLDR extract for the file
  const extract = extractDaemon(filePath, projectDir);
  if (!extract || extract.functions.length === 0) {
    return allowTool(HOOK_READ_ENFORCER);
  }

  // Build token-efficient summary instead of raw file
  const parts: string[] = [
    `## File: ${filePath}`,
    `**Note**: This file has ~${lineCount} lines. Showing TLDR summary for token efficiency.`,
    `To read specific lines, use \`offset\` and \`limit\` parameters.`,
    '',
  ];

  // Imports
  if (extract!.imports.length > 0) {
    parts.push('### Imports');
    parts.push('```');
    for (const imp of extract!.imports.slice(0, 20)) {
      parts.push(imp.module);
    }
    if (extract!.imports.length > 20) {
      parts.push(`... and ${extract!.imports.length - 20} more imports`);
    }
    parts.push('```');
    parts.push('');
  }

  // Classes (from separate array)
  const classes = extract!.classes || [];
  if (classes.length > 0) {
    parts.push('### Classes');
    for (const cls of classes) {
      const doc = cls.docstring ? ` - ${cls.docstring.slice(0, 60)}...` : '';
      parts.push(`- **${cls.name}** (line ${cls.line_number})${doc}`);
    }
    parts.push('');
  }

  // Functions
  const functions = extract!.functions;
  if (functions.length > 0) {
    parts.push('### Functions');
    for (const fn of functions.slice(0, 25)) {
      const sig = fn.signature ? `\`${fn.signature}\`` : '';
      parts.push(`- **${fn.name}** (line ${fn.line_number}) ${sig}`);
    }
    if (functions.length > 25) {
      parts.push(`... and ${functions.length - 25} more functions`);
    }
    parts.push('');
  }

  parts.push('---');
  parts.push('To read specific sections, use: `Read(file_path, offset=LINE, limit=COUNT)`');

  // Put full TLDR summary in permissionDecisionReason so it's reliably shown
  // (systemMessage isn't consistently displayed for denied tools)
  denyTool(parts.join('\n'), HOOK_READ_ENFORCER);
}

// ─────────────────────────────────────────────────────────────────────────────
// PreToolUse: smart-search-router (Grep)
// ─────────────────────────────────────────────────────────────────────────────

type QueryType = 'structural' | 'semantic' | 'literal';
type TargetType = 'function' | 'class' | 'variable' | 'import' | 'decorator' | 'unknown';

/**
 * Classify a search pattern to determine optimal routing.
 */
function classifySearchPattern(pattern: string): { queryType: QueryType; targetType: TargetType } {
  // Structural patterns (AST-level)
  const structuralPatterns = [
    { regex: /^(def|function|func)\s+\w+/, targetType: 'function' as TargetType },
    { regex: /^(class|struct|interface)\s+\w+/, targetType: 'class' as TargetType },
    { regex: /^(import|from|require|use)\s+/, targetType: 'import' as TargetType },
    { regex: /^@\w+/, targetType: 'decorator' as TargetType },
    { regex: /^\w+\s*=\s*/, targetType: 'variable' as TargetType },
  ];

  for (const { regex, targetType } of structuralPatterns) {
    if (regex.test(pattern)) {
      return { queryType: 'structural', targetType };
    }
  }

  // Semantic patterns (natural language / concept search)
  const semanticIndicators = [
    'where', 'how', 'what', 'find', 'search',
    'related', 'similar', 'like', 'about',
  ];
  const lowerPattern = pattern.toLowerCase();
  if (semanticIndicators.some((ind) => lowerPattern.includes(ind))) {
    return { queryType: 'semantic', targetType: 'unknown' };
  }

  // Check if it looks like an identifier (potential symbol search)
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(pattern)) {
    // Single identifier - could be function/class name
    if (pattern[0] === pattern[0].toUpperCase()) {
      return { queryType: 'structural', targetType: 'class' };
    }
    return { queryType: 'structural', targetType: 'function' };
  }

  // Default to literal search
  return { queryType: 'literal', targetType: 'unknown' };
}

/**
 * Suggest TLDR layers based on query type and target.
 */
function suggestLayers(queryType: QueryType, targetType: TargetType): string[] {
  switch (queryType) {
    case 'structural':
      switch (targetType) {
        case 'function':
          return ['L1-AST', 'L2-CallGraph'];
        case 'class':
          return ['L1-AST'];
        case 'import':
          return ['L1-AST'];
        case 'decorator':
          return ['L1-AST'];
        case 'variable':
          return ['L1-AST', 'L4-DFG'];
        default:
          return ['L1-AST'];
      }
    case 'semantic':
      return ['semantic-search'];
    case 'literal':
    default:
      return ['ripgrep'];
  }
}

/**
 * Smart Search Router - intercepts Grep and routes to optimal tool.
 *
 * Classifies the search pattern and:
 * - Stores search context for downstream hooks (e.g., read enforcer)
 * - For structural queries: suggests TLDR if available
 * - For semantic queries: suggests TLDR semantic search
 * - For literal queries: allows pass-through to ripgrep
 */
function smartSearchRouter(input: HookInput): void {
  const projectDir = getProjectDir();
  const sessionId = input.session_id || 'default';

  const pattern = (input.tool_input?.pattern as string) || '';
  if (!pattern) {
    allowTool(HOOK_SEARCH_ROUTER);
  }

  // Classify the query
  const { queryType, targetType } = classifySearchPattern(pattern);
  const suggestedLayers = suggestLayers(queryType, targetType);

  // Build search context for downstream hooks
  const searchContext: SearchContext = {
    timestamp: Date.now(),
    queryType,
    pattern,
    target: null,
    targetType,
    suggestedLayers,
  };

  // If TLDR is available and query is structural, try to find definition
  if (isTldrInstalled() && isTldrDaemonRunning(projectDir) && queryType === 'structural') {
    // Extract target name from pattern
    const nameMatch = pattern.match(/(?:def|function|func|class|struct|interface)\s+(\w+)/);
    const targetName = nameMatch ? nameMatch[1] : pattern.match(/^(\w+)/)?.[1];

    if (targetName) {
      searchContext.target = targetName;

      // Search via TLDR
      const results = searchDaemon(targetName, projectDir);
      if (results.length > 0) {
        searchContext.definitionLocation = `${results[0].file}:${results[0].line}`;

        // Get callers if it's a function
        if (targetType === 'function') {
          const ctx = contextDaemon(targetName, projectDir);
          if (ctx) {
            searchContext.callers = ctx.callers;
          }
        }
      }
    }
  }

  // Save context for downstream hooks
  saveSearchContext(sessionId, searchContext);

  // For structural queries with TLDR available, inject context
  if (
    queryType === 'structural' &&
    isTldrInstalled() &&
    isTldrDaemonRunning(projectDir) &&
    searchContext.definitionLocation
  ) {
    const parts: string[] = [
      `## TLDR Search Context`,
      `Found **${searchContext.target}** at \`${searchContext.definitionLocation}\``,
    ];

    if (searchContext.callers && searchContext.callers.length > 0) {
      parts.push(`Called by: ${searchContext.callers.slice(0, 5).join(', ')}`);
    }

    parts.push('');
    parts.push('Proceeding with grep for additional matches...');

    preToolContext(parts.join('\n'), HOOK_SEARCH_ROUTER);
  }

  // Allow grep to proceed (with context saved for read enforcer)
  allowTool(HOOK_SEARCH_ROUTER);
}

// ─────────────────────────────────────────────────────────────────────────────
// UserPromptSubmit: impact-refactor
// ─────────────────────────────────────────────────────────────────────────────

/** Keywords that trigger impact analysis */
const REFACTOR_KEYWORDS = [
  /\brefactor\b/i,
  /\brename\b/i,
  /\bchange\b.*\bfunction\b/i,
  /\bmodify\b.*\b(?:function|method|class)\b/i,
  /\bupdate\b.*\bsignature\b/i,
  /\bmove\b.*\bfunction\b/i,
  /\bdelete\b.*\b(?:function|method)\b/i,
  /\bremove\b.*\b(?:function|method)\b/i,
  /\bextract\b.*\b(?:function|method)\b/i,
  /\binline\b.*\b(?:function|method)\b/i,
];

/** Extract function/method names from prompt */
const IMPACT_FUNCTION_PATTERNS = [
  /(?:refactor|rename|change|modify|update|move|delete|remove)\s+(?:the\s+)?(?:function\s+)?[`"']?(\w+)[`"']?/gi,
  /[`"'](\w+)[`"']\s+(?:function|method)/gi,
  /(?:function|method|def|fn)\s+[`"']?(\w+)[`"']?/gi,
];

const IMPACT_EXCLUDE_WORDS = new Set([
  'the', 'this', 'that', 'function', 'method', 'class', 'file',
  'to', 'from', 'into', 'a', 'an', 'and', 'or', 'for', 'with',
]);

function shouldTriggerImpact(prompt: string): boolean {
  return REFACTOR_KEYWORDS.some((pattern) => pattern.test(prompt));
}

function extractImpactFunctionNames(prompt: string): string[] {
  const candidates: Set<string> = new Set();

  for (const pattern of IMPACT_FUNCTION_PATTERNS) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(prompt)) !== null) {
      const name = match[1];
      if (name && name.length > 2 && !IMPACT_EXCLUDE_WORDS.has(name.toLowerCase())) {
        candidates.add(name);
      }
    }
  }

  // Also look for snake_case and camelCase identifiers
  const identifierPattern = /\b([a-z][a-z0-9_]*[a-z0-9])\b/gi;
  let match;
  while ((match = identifierPattern.exec(prompt)) !== null) {
    const name = match[1];
    if (name.length > 4 && !IMPACT_EXCLUDE_WORDS.has(name.toLowerCase())) {
      if (name.includes('_') || /[a-z][A-Z]/.test(name)) {
        candidates.add(name);
      }
    }
  }

  return Array.from(candidates);
}

/**
 * Impact analysis for refactoring (UserPromptSubmit).
 * When user mentions refactor/rename + function name, shows callers.
 */
function impactRefactor(input: HookInput): void {
  const prompt = (input.tool_input?.prompt as string) || (input.tool_input?.message as string) || '';

  if (!shouldTriggerImpact(prompt)) {
    process.exit(0);
  }

  const functions = extractImpactFunctionNames(prompt);
  if (functions.length === 0) {
    process.exit(0);
  }

  const projectDir = getProjectDir();

  if (!isTldrInstalled() || !isTldrDaemonRunning(projectDir)) {
    process.exit(0);
  }

  const results: string[] = [];

  for (const funcName of functions.slice(0, 3)) {
    const impact = impactDaemon(funcName, projectDir);

    if (!impact) {
      continue;
    }

    const callers = impact.callers;
    let callerText: string;

    if (callers.length === 0) {
      callerText = 'No callers found (entry point or unused)';
    } else {
      callerText = callers
        .slice(0, 15)
        .map((c) => `  - ${c.function || 'unknown'} in ${c.file}:${c.line}`)
        .join('\n');
      if (callers.length > 15) {
        callerText += `\n  ... and ${callers.length - 15} more`;
      }
    }

    results.push(`**Impact: ${funcName}**\nCallers:\n${callerText}`);
  }

  if (results.length > 0) {
    console.log(`\n## REFACTORING IMPACT ANALYSIS\n\n${results.join('\n\n')}\n\nConsider all callers before making changes.\n`);
  }

  process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Command Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register context hook subcommands.
 */
export function register(parent: Command): void {
  const context = parent
    .command('context')
    .description('TLDR context injection hooks');

  // PreToolUse hooks
  context
    .command('tldr-inject')
    .description('Inject TLDR context for Task (PreToolUse:Task)')
    .action(async () => {
      try {
        const input = await readHookInput();
        logHookStart(HOOK_TLDR_INJECT, { tool: input.tool_name });
        tldrContextInject(input);
      } catch {
        allowTool(HOOK_TLDR_INJECT);
      }
    });

  context
    .command('edit-inject')
    .description('Inject file structure before edits (PreToolUse:Edit)')
    .action(async () => {
      try {
        const input = await readHookInput();
        logHookStart(HOOK_EDIT_INJECT, { tool: input.tool_name, file: input.tool_input?.file_path });
        editContextInject(input);
      } catch {
        allowTool(HOOK_EDIT_INJECT);
      }
    });

  context
    .command('arch-inject')
    .description('Inject architecture layers for planning (PreToolUse:Task)')
    .action(async () => {
      try {
        const input = await readHookInput();
        logHookStart(HOOK_ARCH_INJECT, { tool: input.tool_name });
        archContextInject(input);
      } catch {
        allowTool(HOOK_ARCH_INJECT);
      }
    });

  context
    .command('signature')
    .description('Inject function signatures for Edit (PreToolUse:Edit)')
    .action(async () => {
      try {
        const input = await readHookInput();
        logHookStart(HOOK_SIGNATURE, { tool: input.tool_name, file: input.tool_input?.file_path });
        signatureHelper(input);
      } catch {
        allowTool(HOOK_SIGNATURE);
      }
    });

  // PostToolUse hooks
  context
    .command('diagnostics')
    .description('Run TLDR diagnostics after edits (PostToolUse:Edit|Write)')
    .action(async () => {
      try {
        const input = await readHookInput();
        logHookStart(HOOK_DIAGNOSTICS, { tool: input.tool_name, file: input.tool_input?.file_path });
        postEditDiagnostics(input);
      } catch {
        allowTool(HOOK_DIAGNOSTICS);
      }
    });

  context
    .command('import-validate')
    .description('Validate imports after edits (PostToolUse:Edit|Write)')
    .action(async () => {
      try {
        const input = await readHookInput();
        logHookStart(HOOK_IMPORT_VALIDATE, { tool: input.tool_name, file: input.tool_input?.file_path });
        importValidator(input);
      } catch {
        allowTool(HOOK_IMPORT_VALIDATE);
      }
    });

  context
    .command('edit-notify')
    .description('Notify TLDR daemon of file changes (PostToolUse:Edit|Write)')
    .action(async () => {
      try {
        const input = await readHookInput();
        logHookStart(HOOK_EDIT_NOTIFY, { tool: input.tool_name, file: input.tool_input?.file_path });
        await editNotify(input);
      } catch {
        allowTool(HOOK_EDIT_NOTIFY);
      }
    });

  // TLDR enforcement hooks
  context
    .command('read-enforcer')
    .description('Enforce TLDR for large code files (PreToolUse:Read)')
    .action(async () => {
      try {
        const input = await readHookInput();
        logHookStart(HOOK_READ_ENFORCER, { tool: input.tool_name, file: input.tool_input?.file_path });
        tldrReadEnforcer(input);
      } catch {
        allowTool(HOOK_READ_ENFORCER);
      }
    });

  context
    .command('search-router')
    .description('Route searches to optimal tool (PreToolUse:Grep)')
    .action(async () => {
      try {
        const input = await readHookInput();
        logHookStart(HOOK_SEARCH_ROUTER, { tool: input.tool_name, pattern: input.tool_input?.pattern });
        smartSearchRouter(input);
      } catch {
        allowTool(HOOK_SEARCH_ROUTER);
      }
    });

  // UserPromptSubmit hooks
  context
    .command('impact-refactor')
    .description('Show impact analysis for refactoring (UserPromptSubmit)')
    .action(async () => {
      try {
        const input = await readHookInput();
        logHookStart(HOOK_IMPACT_REFACTOR, { prompt: (input.tool_input?.prompt as string)?.slice(0, 50) });
        impactRefactor(input);
      } catch {
        process.exit(0);
      }
    });
}
