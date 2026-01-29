/**
 * Shared Hook Utilities
 *
 * Common types, I/O helpers, and cache utilities for Claude Code hooks.
 * Hooks communicate via stdin/stdout JSON.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Command } from 'commander';
import { logHookStart, logHookSuccess } from '../lib/trace-store.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Input from Claude Code hooks (stdin JSON) */
export interface HookInput {
  session_id?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  /** Claude Code PostToolUse sends this as tool_response; normalized to tool_result in readHookInput */
  tool_response?: unknown;
  /** Normalized from tool_response for backward compat - handlers should read this field */
  tool_result?: unknown;
  transcript_path?: string;
  stop_hook_active?: boolean;
}

/** PreToolUse hook output */
export interface PreToolUseOutput {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse';
    permissionDecision?: 'allow' | 'deny' | 'ask';
    permissionDecisionReason?: string;
    updatedInput?: Record<string, unknown>;
    additionalContext?: string;
  };
  systemMessage?: string;
}

/** PostToolUse hook output - uses hookSpecificOutput for model-visible context */
export interface PostToolUseOutput {
  continue?: boolean;
  suppressOutput?: boolean;
  systemMessage?: string;
  hookSpecificOutput?: {
    hookEventName: 'PostToolUse';
    additionalContext?: string;
  };
}

/** Stop/SubagentStop hook output */
export interface StopHookOutput {
  decision: 'approve' | 'block';
  reason?: string;
  systemMessage?: string;
}

/** PreCompact hook output - standard format with systemMessage */
export interface PreCompactOutput {
  continue?: boolean;
  systemMessage?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// I/O Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read hook input from stdin (synchronous for hook context).
 */
export async function readHookInput(): Promise<HookInput> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', (chunk) => {
      data += chunk;
    });

    process.stdin.on('end', () => {
      try {
        if (!data.trim()) {
          resolve({});
          return;
        }
        const parsed = JSON.parse(data) as HookInput;
        // Claude Code PostToolUse sends tool_response; normalize to tool_result
        if (parsed.tool_response !== undefined && parsed.tool_result === undefined) {
          parsed.tool_result = parsed.tool_response;
        }
        resolve(parsed);
      } catch (e) {
        reject(new Error(`Failed to parse hook input: ${e}`));
      }
    });

    process.stdin.on('error', reject);
  });
}

/**
 * Deny a tool use with a reason.
 * Outputs JSON to stdout and exits with 0 (success for hooks).
 * The reason is shown to Claude via permissionDecisionReason.
 * Optionally logs to trace-store if hookName is provided.
 */
export function denyTool(reason: string, hookName?: string): never {
  if (hookName) {
    logHookSuccess(hookName, { action: 'deny', reason });
  }
  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
  console.log(JSON.stringify(output));
  process.exit(0);
}

/**
 * Allow a tool use (silent exit).
 * Hooks that don't output anything allow the tool.
 * Optionally logs to trace-store if hookName is provided.
 * @see denyTool for blocking with a reason
 */
export function allowTool(hookName?: string): never {
  if (hookName) {
    logHookSuccess(hookName, { action: 'allow' });
  }
  process.exit(0);
}

/**
 * Output additional context for PostToolUse hooks.
 * Uses decision: 'block' with reason for reliable visibility to model.
 * (Since PostToolUse runs after the edit, 'block' just shows the message prominently)
 * Optionally logs to trace-store if hookName is provided.
 */
export function outputContext(context: string, hookName?: string): never {
  if (hookName) {
    logHookSuccess(hookName, { action: 'context', hasContext: true });
  }
  // Use decision: 'block' with reason for reliable visibility (like Continuous-Claude-v3)
  // The edit already happened, so 'block' just ensures the message is shown prominently
  const output = {
    decision: 'block',
    reason: context,
  };
  console.log(JSON.stringify(output));
  process.exit(0);
}

/**
 * Block a PostToolUse action with a message.
 * Uses decision: 'block' with reason for reliable visibility.
 * Optionally logs to trace-store if hookName is provided.
 */
export function blockTool(message: string, hookName?: string): never {
  if (hookName) {
    logHookSuccess(hookName, { action: 'block', message });
  }
  // Use decision: 'block' with reason for reliable visibility (like Continuous-Claude-v3)
  const output = {
    decision: 'block',
    reason: message,
  };
  console.log(JSON.stringify(output));
  process.exit(0);
}

/**
 * Output Stop/SubagentStop hook result.
 * Use decision: "approve" to allow stop, "block" to continue.
 * Optionally logs to trace-store if hookName is provided.
 */
export function outputStopHook(decision: 'approve' | 'block', reason?: string, hookName?: string): never {
  if (hookName) {
    logHookSuccess(hookName, { action: decision, reason });
  }
  const output: StopHookOutput = {
    decision,
    reason,
  };
  console.log(JSON.stringify(output));
  process.exit(0);
}

/**
 * Output PreCompact hook result.
 * Use systemMessage to inject context that survives compaction.
 * Optionally logs to trace-store if hookName is provided.
 */
export function outputPreCompact(systemMessage?: string, hookName?: string): never {
  if (hookName) {
    logHookSuccess(hookName, { action: 'precompact', hasMessage: !!systemMessage });
  }
  const output: PreCompactOutput = {
    continue: true,
    systemMessage,
  };
  console.log(JSON.stringify(output));
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Language Detection (for AST-grep, TLDR, etc.)
// ─────────────────────────────────────────────────────────────────────────────

/** Map of file extensions to AST-grep compatible language names */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  // TypeScript
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.mts': 'typescript',
  '.cts': 'typescript',
  // JavaScript
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  // Python
  '.py': 'python',
  '.pyi': 'python',
  '.pyx': 'python',
  // Go
  '.go': 'go',
  // Rust
  '.rs': 'rust',
  // C/C++
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.hh': 'cpp',
  // Java
  '.java': 'java',
  // Kotlin
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  // Ruby
  '.rb': 'ruby',
  // Swift
  '.swift': 'swift',
  // C#
  '.cs': 'c-sharp',
  // Lua
  '.lua': 'lua',
  // HTML/CSS
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  // JSON/YAML
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
};

/** Map of ripgrep type names to AST-grep language names */
const TYPE_TO_LANGUAGE: Record<string, string> = {
  'ts': 'typescript',
  'typescript': 'typescript',
  'tsx': 'tsx',
  'js': 'javascript',
  'javascript': 'javascript',
  'jsx': 'javascript',
  'py': 'python',
  'python': 'python',
  'go': 'go',
  'rust': 'rust',
  'rs': 'rust',
  'c': 'c',
  'cpp': 'cpp',
  'java': 'java',
  'kotlin': 'kotlin',
  'kt': 'kotlin',
  'ruby': 'ruby',
  'rb': 'ruby',
  'swift': 'swift',
  'cs': 'c-sharp',
  'csharp': 'c-sharp',
  'lua': 'lua',
  'html': 'html',
  'css': 'css',
  'json': 'json',
  'yaml': 'yaml',
};

/** Map of code patterns to likely languages */
const PATTERN_TO_LANGUAGE: Record<string, string> = {
  'def ': 'python',
  'async def ': 'python',
  'class ': 'python', // Could be multiple languages, default to python
  'function ': 'typescript',
  'async function ': 'typescript',
  'const ': 'typescript',
  'let ': 'typescript',
  'export ': 'typescript',
  'import ': 'typescript',
  'func ': 'go',
  'fn ': 'rust',
  'pub fn ': 'rust',
  'impl ': 'rust',
  'package ': 'go',
};

/**
 * Detect language from various inputs.
 * Checks in order: glob patterns, ripgrep type, code patterns.
 * Returns AST-grep compatible language name.
 */
export function detectLanguage(options: {
  glob?: string;
  type?: string;
  pattern?: string;
  filePath?: string;
}): string {
  const { glob, type, pattern, filePath } = options;

  // 1. Check file path extension
  if (filePath) {
    const ext = filePath.substring(filePath.lastIndexOf('.'));
    if (EXTENSION_TO_LANGUAGE[ext]) {
      return EXTENSION_TO_LANGUAGE[ext];
    }
  }

  // 2. Check glob pattern for extensions
  if (glob) {
    for (const [ext, lang] of Object.entries(EXTENSION_TO_LANGUAGE)) {
      if (glob.includes(ext)) {
        return lang;
      }
    }
  }

  // 3. Check ripgrep type parameter
  if (type) {
    const lowerType = type.toLowerCase();
    if (TYPE_TO_LANGUAGE[lowerType]) {
      return TYPE_TO_LANGUAGE[lowerType];
    }
  }

  // 4. Check code pattern for language hints
  if (pattern) {
    for (const [hint, lang] of Object.entries(PATTERN_TO_LANGUAGE)) {
      if (pattern.includes(hint)) {
        return lang;
      }
    }
  }

  // Default to typescript (most common in this codebase)
  return 'typescript';
}

/**
 * Get all file extensions for a given language.
 * Useful for building glob patterns.
 */
export function getExtensionsForLanguage(language: string): string[] {
  const extensions: string[] = [];
  for (const [ext, lang] of Object.entries(EXTENSION_TO_LANGUAGE)) {
    if (lang === language) {
      extensions.push(ext);
    }
  }
  return extensions;
}

// ─────────────────────────────────────────────────────────────────────────────
// Path Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the project directory.
 * Priority:
 * 1. CLAUDE_PROJECT_DIR env var (set by Claude Code)
 * 2. Find .allhands/harness directory going up from cwd (indicates project root)
 * 3. Fall back to cwd
 */
export function getProjectDir(): string {
  if (process.env.CLAUDE_PROJECT_DIR) {
    return process.env.CLAUDE_PROJECT_DIR;
  }

  // Find project root by looking for .allhands/harness directory
  // This is more reliable than just .allhands since harness may have nested .allhands
  let dir = process.cwd();
  while (dir !== '/') {
    const harnessPath = join(dir, '.allhands', 'harness');
    const ahScript = join(harnessPath, 'ah');
    // Check for the ah script to confirm this is the project root
    if (existsSync(ahScript)) {
      return dir;
    }
    dir = join(dir, '..');
  }

  return process.cwd();
}

/**
 * Get the cache directory (.allhands/harness/.cache/).
 * Creates the directory if it doesn't exist.
 */
export function getCacheDir(): string {
  const projectDir = getProjectDir();
  const cacheDir = join(projectDir, '.allhands', 'harness', '.cache');

  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }

  return cacheDir;
}

/**
 * Get a specific cache subdirectory.
 */
export function getCacheSubdir(name: string): string {
  const subdir = join(getCacheDir(), name);

  if (!existsSync(subdir)) {
    mkdirSync(subdir, { recursive: true });
  }

  return subdir;
}

// ─────────────────────────────────────────────────────────────────────────────
// PreToolUse Context Injection Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Output PreToolUse with context injection (modifies tool input).
 * Prepends additionalContext to the specified field (default: 'prompt').
 * Optionally logs to trace-store if hookName is provided.
 */
export function injectContext(
  originalInput: Record<string, unknown>,
  additionalContext: string,
  targetField: string = 'prompt',
  hookName?: string
): never {
  if (hookName) {
    logHookSuccess(hookName, { action: 'inject', targetField });
  }
  const currentValue = (originalInput[targetField] as string) || '';
  const output: PreToolUseOutput = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      updatedInput: {
        ...originalInput,
        [targetField]: `${additionalContext}\n\n---\n${currentValue}`,
      },
    },
  };
  console.log(JSON.stringify(output));
  process.exit(0);
}

/**
 * Output PreToolUse additional context without modifying input.
 * Adds context to the conversation via systemMessage.
 * Optionally logs to trace-store if hookName is provided.
 */
export function preToolContext(context: string, hookName?: string): never {
  if (hookName) {
    logHookSuccess(hookName, { action: 'preToolContext', hasContext: true });
  }
  const output: PreToolUseOutput = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
    },
    systemMessage: context,
  };
  console.log(JSON.stringify(output));
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Project Settings (.allhands/settings.json)
// ─────────────────────────────────────────────────────────────────────────────

/** Format pattern configuration */
export interface FormatPattern {
  match: string;
  command: string;
}

/** Format configuration */
export interface FormatConfig {
  enabled?: boolean;
  command?: string;
  patterns?: FormatPattern[];
}

/** Validation section of settings */
export interface ValidationSettings {
  format?: FormatConfig;
}

/** Git settings */
export interface GitSettings {
  baseBranch?: string;
  localBaseBranch?: string;
}

/** TLDR settings */
export interface TldrSettings {
  enableForHarness?: boolean;
}

/** Knowledge search settings */
export interface KnowledgeSettings {
  similarityThreshold?: number;
  fullContextSimilarityThreshold?: number;
  contextTokenLimit?: number;
}

/** Oracle inference settings */
export interface OracleSettings {
  defaultProvider?: 'gemini' | 'openai';
  /** LLM provider for compaction analysis (defaults to gemini for large context) */
  compactionProvider?: 'gemini' | 'openai';
}

/** OpenCode SDK agent execution settings */
export interface OpencodeSdkSettings {
  model?: string;
  codesearchToolBudget?: number;
}

/** Spawn settings for parallel execution */
export interface SpawnSettings {
  maxParallelPrompts?: number;
  /** Autocompact percentage threshold for prompt-scoped agents (1-100, default 65) */
  promptScopedAutocompactAt?: number;
}

/** Event loop timing settings */
export interface EventLoopSettings {
  tickIntervalMs?: number;
}

/** PR review detection and triggering settings */
export interface PRReviewSettings {
  reviewDetectionString?: string;
  rerunComment?: string;
  checkFrequency?: number;
}

/** Project settings structure (.allhands/settings.json) */
export interface DaemonSettings {
  enabled?: boolean;
}

export interface ProjectSettings {
  daemon?: DaemonSettings;
  validation?: ValidationSettings;
  git?: GitSettings;
  tldr?: TldrSettings;
  knowledge?: KnowledgeSettings;
  oracle?: OracleSettings;
  opencodeSdk?: OpencodeSdkSettings;
  spawn?: SpawnSettings;
  eventLoop?: EventLoopSettings;
  prReview?: PRReviewSettings;
  disabledHooks?: string[];
}

/**
 * Load project settings from .allhands/settings.json.
 * Returns null if file doesn't exist or is invalid.
 */
export function loadProjectSettings(): ProjectSettings | null {
  const settingsPath = join(getProjectDir(), '.allhands', 'settings.json');
  if (!existsSync(settingsPath)) {
    return null;
  }

  try {
    const content = readFileSync(settingsPath, 'utf-8');
    return JSON.parse(content) as ProjectSettings;
  } catch {
    return null;
  }
}

/**
 * Get base branch from settings or default.
 * Priority: settings.json > "main"
 */
export function getBaseBranch(): string {
  const settings = loadProjectSettings();
  return settings?.git?.baseBranch || 'main';
}

/**
 * Get local base branch for checkout operations.
 * Priority: settings.git.localBaseBranch > settings.git.baseBranch > "main"
 */
export function getLocalBaseBranch(): string {
  const settings = loadProjectSettings();
  return settings?.git?.localBaseBranch || settings?.git?.baseBranch || 'main';
}

// ─────────────────────────────────────────────────────────────────────────────
// Search Context (for hook coordination)
// ─────────────────────────────────────────────────────────────────────────────

/** Search context passed between hooks */
export interface SearchContext {
  timestamp: number;
  queryType: 'structural' | 'semantic' | 'literal';
  pattern: string;
  target: string | null;
  targetType: 'function' | 'class' | 'variable' | 'import' | 'decorator' | 'unknown';
  suggestedLayers: string[];
  definitionLocation?: string;
  callers?: string[];
}

/**
 * Get the search context file path for a session.
 */
function getSearchContextPath(sessionId: string): string {
  const tmpDir = '/tmp/claude-search-context';
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true });
  }
  return join(tmpDir, `${sessionId}.json`);
}

/**
 * Save search context for downstream hooks.
 */
export function saveSearchContext(sessionId: string, context: SearchContext): void {
  const path = getSearchContextPath(sessionId);
  writeFileSync(path, JSON.stringify(context, null, 2));
}

/**
 * Load search context from upstream hooks.
 * Returns null if not found or expired (>5 min).
 */
export function loadSearchContext(sessionId: string): SearchContext | null {
  const path = getSearchContextPath(sessionId);
  if (!existsSync(path)) {
    return null;
  }

  try {
    const data = readFileSync(path, 'utf-8');
    const context = JSON.parse(data) as SearchContext;

    // Check if expired (5 minute TTL)
    const age = Date.now() - context.timestamp;
    if (age > 5 * 60 * 1000) {
      return null;
    }

    return context;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Declarative Hook Definitions
// ─────────────────────────────────────────────────────────────────────────────

/** Error fallback strategies for when a hook throws */
export type ErrorFallback =
  | { type: 'allowTool' }
  | { type: 'outputStopHook'; decision: 'approve' | 'block' }
  | { type: 'outputPreCompact' }
  | { type: 'continue' }
  | { type: 'silent' };

/** Single hook definition */
export interface HookDefinition {
  /** Hook name (e.g., 'agent-stop') */
  name: string;
  /** Description for CLI help */
  description: string;
  /** Handler function */
  handler: (input: HookInput) => void | Promise<void>;
  /** Error fallback strategy (default: silent exit) */
  errorFallback?: ErrorFallback;
  /** Optional payload generator for trace logging */
  logPayload?: (input: HookInput) => Record<string, unknown>;
}

/** Category of related hooks */
export interface HookCategory {
  /** Category name (e.g., 'lifecycle') */
  name: string;
  /** Description for CLI help */
  description: string;
  /** Hooks in this category */
  hooks: HookDefinition[];
}

/** Type for daemon handler registration function */
export type RegisterFn = (category: string, name: string, handler: (input: HookInput) => void | Promise<void>) => void;

/**
 * Execute error fallback strategy.
 */
function executeErrorFallback(fallback: ErrorFallback | undefined, hookName: string): never {
  if (!fallback) {
    // Default: silent exit
    process.exit(0);
  }

  switch (fallback.type) {
    case 'allowTool':
      logHookSuccess(hookName, { action: 'allow', error: true });
      process.exit(0);
    case 'outputStopHook':
      logHookSuccess(hookName, { action: fallback.decision, error: true });
      console.log(JSON.stringify({ decision: fallback.decision }));
      process.exit(0);
    case 'outputPreCompact':
      logHookSuccess(hookName, { action: 'continue', error: true });
      console.log(JSON.stringify({ continue: true }));
      process.exit(0);
    case 'continue':
      logHookSuccess(hookName, { action: 'continue', error: true });
      console.log(JSON.stringify({ continue: true }));
      process.exit(0);
    case 'silent':
    default:
      process.exit(0);
  }
}

/**
 * Check if a hook is disabled via disabledHooks in settings.
 * Disabled hooks pass through without executing.
 */
function isHookDisabled(hookName: string): boolean {
  const settings = loadProjectSettings();
  return settings?.disabledHooks?.includes(hookName) ?? false;
}

/**
 * Register a hook category to Commander.js.
 * Creates subcommands with consistent error handling and trace logging.
 */
export function registerCategory(parent: Command, category: HookCategory): void {
  const cmd = parent
    .command(category.name)
    .description(category.description);

  for (const hook of category.hooks) {
    const hookName = `${category.name} ${hook.name}`;

    cmd
      .command(hook.name)
      .description(hook.description)
      .action(async () => {
        if (isHookDisabled(hookName)) {
          process.exit(0);
        }
        try {
          const input = await readHookInput();
          const payload = hook.logPayload ? hook.logPayload(input) : { tool: input.tool_name };
          logHookStart(hookName, payload);
          await hook.handler(input);
        } catch {
          executeErrorFallback(hook.errorFallback, hookName);
        }
      });
  }
}

/**
 * Register a hook category for daemon mode.
 * Handlers are called directly with input (daemon manages I/O).
 */
export function registerCategoryForDaemon(category: HookCategory, register: RegisterFn): void {
  for (const hook of category.hooks) {
    const hookName = `${category.name} ${hook.name}`;
    const wrappedHandler = async (input: HookInput): Promise<void> => {
      if (isHookDisabled(hookName)) {
        process.exit(0);
      }
      try {
        await hook.handler(input);
      } catch {
        executeErrorFallback(hook.errorFallback, `${category.name}.${hook.name}`);
      }
    };
    register(category.name, hook.name, wrappedHandler);
  }
}

