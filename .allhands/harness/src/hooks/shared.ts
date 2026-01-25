/**
 * Shared Hook Utilities
 *
 * Common types, I/O helpers, and cache utilities for Claude Code hooks.
 * Hooks communicate via stdin/stdout JSON.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Input from Claude Code hooks (stdin JSON) */
export interface HookInput {
  session_id?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_result?: unknown;
  transcript_path?: string;
  stop_hook_active?: boolean;
}

/** PreToolUse hook output */
export interface PreToolUseOutput {
  hookSpecificOutput: {
    permissionDecision: 'allow' | 'deny' | 'ask';
    updatedInput?: Record<string, unknown>;
  };
  systemMessage?: string;
}

/** PostToolUse hook output - uses standard output format */
export interface PostToolUseOutput {
  continue?: boolean;
  suppressOutput?: boolean;
  systemMessage?: string;
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
        resolve(JSON.parse(data));
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
 */
export function denyTool(reason: string): never {
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
 */
export function allowTool(): never {
  process.exit(0);
}

/**
 * Output additional context for PostToolUse hooks.
 * Uses systemMessage field per official hook documentation.
 */
export function outputContext(context: string): never {
  const output: PostToolUseOutput = {
    continue: true,
    systemMessage: context,
  };
  console.log(JSON.stringify(output));
  process.exit(0);
}

/**
 * Block a PostToolUse action with a message.
 * The file change will be rejected and the message shown.
 */
export function blockTool(message: string): never {
  const output: PostToolUseOutput = {
    continue: false,
    systemMessage: message,
  };
  console.log(JSON.stringify(output));
  process.exit(0);
}

/**
 * Output Stop/SubagentStop hook result.
 * Use decision: "approve" to allow stop, "block" to continue.
 */
export function outputStopHook(decision: 'approve' | 'block', reason?: string): never {
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
 */
export function outputPreCompact(systemMessage?: string): never {
  const output: PreCompactOutput = {
    continue: true,
    systemMessage,
  };
  console.log(JSON.stringify(output));
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Path Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the project directory from environment or cwd.
 */
export function getProjectDir(): string {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
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
 */
export function injectContext(
  originalInput: Record<string, unknown>,
  additionalContext: string,
  targetField: string = 'prompt'
): never {
  const currentValue = (originalInput[targetField] as string) || '';
  const output: PreToolUseOutput = {
    hookSpecificOutput: {
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
 */
export function preToolContext(context: string): never {
  const output: PreToolUseOutput = {
    hookSpecificOutput: {
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
}

/** Project settings structure (.allhands/settings.json) */
export interface ProjectSettings {
  validation?: ValidationSettings;
  git?: GitSettings;
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
 * Get base branch from settings, env, or default.
 * Priority: settings.json > BASE_BRANCH env > "main"
 */
export function getBaseBranch(): string {
  const settings = loadProjectSettings();
  return settings?.git?.baseBranch || process.env.BASE_BRANCH || 'main';
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
